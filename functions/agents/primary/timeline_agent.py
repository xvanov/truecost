"""Timeline Agent for TrueCost.

Generates project timeline with tasks, dependencies, and critical path.

Important:
- Task lists are NOT hardcoded. The LLM generates tasks based on the user-defined
  scope and the pipeline input JSON.
"""

from datetime import datetime, timedelta
import json
from typing import Any, Dict, List, Optional
import time
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from models.timeline import (
    CriticalPath,
    DependencyType,
    Milestone,
    PhaseType,
    ProjectTimeline,
    TaskDependency,
    TaskPriority,
    TaskStatus,
    TimelineTask,
    TimelineSummary,
    WeatherImpact,
)

logger = structlog.get_logger()


# =============================================================================
# LLM TASK PLANNING PROMPT (NO HARDCODED TASK LISTS)
# =============================================================================


TIMELINE_TASK_PLANNER_PROMPT = """You are a construction scheduling expert for TrueCost.

Your job: generate a project schedule task list based strictly on the provided project context
(user-defined scope + pipeline JSON). Do NOT use hardcoded templates.

Requirements:
- Output JSON with a top-level key "tasks".
- Each task MUST include:
  - name: string
  - phase: one of ["preconstruction","demolition","site_prep","foundation","framing","rough_in","insulation","drywall","finish","fixtures","punch_list","final_inspection"]
  - duration_days: integer working days (>= 1)
  - primary_trade: string (e.g., "plumber", "electrician", "carpenter", "general")
  - depends_on: array of task names that must finish before this task starts

Guidelines:
- Keep dependencies realistic; allow parallel work when safe by not over-linking tasks.
- Include permitting/lead-time/inspection tasks when appropriate for the given scope.
- If information is missing, do NOT invent durations. Instead set duration_days to null and explain in "notes".

Return format:
{
  "tasks": [
    {
      "name": "...",
      "phase": "...",
      "duration_days": 3,
      "primary_trade": "...",
      "depends_on": ["..."],
      "notes": "optional"
    }
  ]
}
"""


class TimelineAgent(BaseA2AAgent):
    """Timeline Agent - generates project timeline with dependencies.
    
    Creates:
    - Task sequence based on scope and project type
    - Task dependencies (finish-to-start primarily)
    - Critical path analysis
    - Duration ranges (optimistic/pessimistic)
    - Weather impact assessment
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize TimelineAgent."""
        super().__init__(
            name="timeline",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
    
    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run timeline generation.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing scope_output, location_output, cost_output.
            feedback: Optional critic feedback for retry.
            
        Returns:
            Project timeline with tasks and dependencies.
        """
        self._start_time = time.time()
        
        logger.info(
            "timeline_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )
        
        # Extract inputs
        scope_output = input_data.get("scope_output", {})
        location_output = input_data.get("location_output", {})
        cost_output = input_data.get("cost_output", {})
        clarification = input_data.get("clarification_output", {})
        
        # Get project type
        project_brief = clarification.get("projectBrief", {})
        project_type = project_brief.get("projectType", "renovation").lower()
        total_sqft = project_brief.get("scopeSummary", {}).get("totalSqft")
        
        logger.info(
            "timeline_agent_inputs",
            estimate_id=estimate_id,
            project_type=project_type,
            total_sqft=total_sqft
        )
        
        # Get weather factors for scheduling
        weather = location_output.get("weatherFactors", {})
        seasonal_adjustment = weather.get("seasonalAdjustment", 1.0)
        winter_impact = weather.get("winterImpact", "low")
        
        # Calculate start date (must come from clarification JSON; do NOT default to "2 weeks from now")
        desired_start = project_brief.get("timeline", {}).get("desiredStart")
        if not (isinstance(desired_start, str) and desired_start.strip()):
            msg = "Timeline unavailable (missing required projectBrief.timeline.desiredStart)."
            logger.warning(
                "timeline_agent_missing_desired_start",
                estimate_id=estimate_id,
            )
            output = {
                "estimateId": estimate_id,
                "error": {"code": "INSUFFICIENT_DATA", "message": msg},
                "tasks": [],
                "milestones": [],
                "criticalPath": None,
                "totalDuration": 0,
                "totalCalendarDays": 0,
                "durationRange": {"optimistic": 0, "pessimistic": 0},
            }
            await self.firestore.save_agent_output(
                estimate_id=estimate_id,
                agent_name=self.name,
                output=output,
                summary="Timeline unavailable (missing desiredStart)",
                confidence=0.0,
                tokens_used=self._tokens_used,
                duration_ms=self.duration_ms,
            )
            return output

        try:
            # Accept ISO date or datetime strings (optionally "Z"-terminated)
            start_date = datetime.fromisoformat(desired_start.strip().replace("Z", ""))
        except Exception:
            msg = "Timeline unavailable (invalid desiredStart; must be ISO date/datetime)."
            logger.warning(
                "timeline_agent_invalid_desired_start",
                estimate_id=estimate_id,
                desired_start=desired_start,
            )
            output = {
                "estimateId": estimate_id,
                "error": {"code": "INVALID_INPUT", "message": msg},
                "tasks": [],
                "milestones": [],
                "criticalPath": None,
                "totalDuration": 0,
                "totalCalendarDays": 0,
                "durationRange": {"optimistic": 0, "pessimistic": 0},
            }
            await self.firestore.save_agent_output(
                estimate_id=estimate_id,
                agent_name=self.name,
                output=output,
                summary="Timeline unavailable (invalid desiredStart)",
                confidence=0.0,
                tokens_used=self._tokens_used,
                duration_ms=self.duration_ms,
            )
            return output

        # Generate task plan via LLM (no hardcoded templates)
        task_specs = await self._generate_task_specs_with_llm(
            estimate_id=estimate_id,
            project_type=project_type,
            total_sqft=total_sqft,
            scope_output=scope_output,
            cost_output=cost_output,
            location_output=location_output,
            feedback=feedback,
        )

        # If LLM cannot provide durations, do not fabricate: return N/A.
        if not task_specs:
            msg = "Timeline unavailable (insufficient data to generate tasks)."
            logger.warning("timeline_agent_insufficient_data", estimate_id=estimate_id)
            output = {
                "estimateId": estimate_id,
                "error": {"code": "INSUFFICIENT_DATA", "message": msg},
                "tasks": [],
                "milestones": [],
                "criticalPath": None,
                "totalDuration": 0,
                "totalCalendarDays": 0,
                "durationRange": {"optimistic": 0, "pessimistic": 0},
            }
            await self.firestore.save_agent_output(
                estimate_id=estimate_id,
                agent_name=self.name,
                output=output,
                summary="Timeline unavailable (insufficient data)",
                confidence=0.0,
                tokens_used=self._tokens_used,
                duration_ms=self.duration_ms,
            )
            return output

        tasks = self._build_tasks_from_specs(
            task_specs=task_specs,
            start_date=start_date,
        )
        
        # Calculate critical path
        critical_path = self._calculate_critical_path(tasks)
        
        # Mark critical tasks
        for task in tasks:
            task.is_critical = task.id in critical_path.path_task_ids
            if task.is_critical:
                task.priority = TaskPriority.CRITICAL
        
        # Generate milestones
        milestones = self._generate_milestones(tasks)
        
        # Calculate weather impact
        weather_impact = self._calculate_weather_impact(
            tasks=tasks,
            winter_impact=winter_impact,
            seasonal_adjustment=seasonal_adjustment
        )
        
        # Calculate total durations
        total_duration = critical_path.total_duration
        end_date = self._calculate_end_date(tasks)
        calendar_days = (end_date - start_date).days
        
        # Generate summary
        summary = await self._generate_summary(
            tasks=tasks,
            total_duration=total_duration,
            calendar_days=calendar_days,
            project_type=project_type,
            weather_impact=weather_impact
        )
        
        # Build timeline model
        timeline = ProjectTimeline(
            estimate_id=estimate_id,
            project_start_date=start_date.isoformat(),
            project_end_date=end_date.isoformat(),
            tasks=tasks,
            milestones=milestones,
            critical_path=critical_path,
            total_duration_days=total_duration,
            total_calendar_days=calendar_days,
            duration_optimistic=int(total_duration * 0.85),
            duration_pessimistic=int(total_duration * 1.35),
            weather_impact=weather_impact,
            summary=summary,
            schedule_confidence=self._calculate_confidence(tasks, weather_impact)
        )
        
        # Convert to output format
        output = timeline.to_agent_output()
        
        # Save output to Firestore
        await self.firestore.save_agent_output(
            estimate_id=estimate_id,
            agent_name=self.name,
            output=output,
            summary=summary.headline,
            confidence=timeline.schedule_confidence,
            tokens_used=self._tokens_used,
            duration_ms=self.duration_ms
        )
        
        logger.info(
            "timeline_agent_completed",
            estimate_id=estimate_id,
            total_days=total_duration,
            task_count=len(tasks),
            critical_path_length=len(critical_path.path_task_ids),
            duration_ms=self.duration_ms
        )
        
        return output
    
    async def _generate_task_specs_with_llm(
        self,
        estimate_id: str,
        project_type: str,
        total_sqft: Any,
        scope_output: Dict[str, Any],
        cost_output: Dict[str, Any],
        location_output: Dict[str, Any],
        feedback: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Ask the LLM to generate a task plan (no hardcoded templates)."""
        try:
            user_message = json.dumps(
                {
                    "requestType": "TIMELINE_TASK_PLAN_REQUEST",
                    "estimateId": estimate_id,
                    "projectType": project_type,
                    "totalSqft": total_sqft,
                    "location": {
                        "zipCode": location_output.get("zipCode"),
                        "weatherFactors": location_output.get("weatherFactors"),
                    },
                    "scope": {
                        "divisions": scope_output.get("divisions", []),
                    },
                    "cost": {
                        "summary": cost_output.get("summary"),
                        "subtotals": cost_output.get("subtotals"),
                    },
                    "criticFeedback": feedback,
                },
                default=str,
            )

            result = await self.llm.generate_json(
                TIMELINE_TASK_PLANNER_PROMPT,
                user_message,
                max_tokens=1400,
            )
            self._tokens_used += result.get("tokens_used", 0)
            content = result.get("content") or {}
            tasks = content.get("tasks") if isinstance(content, dict) else None
            if not isinstance(tasks, list):
                return []

            # Filter out tasks without numeric durations (do not invent).
            cleaned: List[Dict[str, Any]] = []
            for t in tasks:
                if not isinstance(t, dict):
                    continue
                if t.get("duration_days") is None:
                    continue
                try:
                    d = int(t.get("duration_days"))
                except Exception:
                    continue
                if d < 1:
                    continue
                cleaned.append(t)
            return cleaned

        except Exception as e:
            logger.warning("timeline_task_plan_llm_failed", estimate_id=estimate_id, error=str(e))
            return []

    def _build_tasks_from_specs(
        self,
        task_specs: List[Dict[str, Any]],
        start_date: datetime,
    ) -> List[TimelineTask]:
        """Convert LLM task specs into TimelineTask objects and schedule them."""
        name_to_id: Dict[str, str] = {}
        for i, spec in enumerate(task_specs):
            name = str(spec.get("name", f"Task {i+1}")).strip()
            name_to_id[name] = f"task-{i + 1:02d}"

        tasks: List[TimelineTask] = []
        # Simple scheduling: honor dependencies; otherwise schedule sequentially in given order.
        scheduled_end: Dict[str, datetime] = {}

        for i, spec in enumerate(task_specs):
            task_id = f"task-{i + 1:02d}"
            name = str(spec.get("name", f"Task {i+1}")).strip()
            phase_raw = str(spec.get("phase", "")).strip().lower()
            try:
                phase = PhaseType(phase_raw)
            except Exception:
                # Unknown phase -> skip (do not invent).
                continue

            duration_days = int(spec.get("duration_days"))
            depends_on = spec.get("depends_on") or []
            dep_ids: List[TaskDependency] = []
            latest_pred_end = start_date

            if isinstance(depends_on, list):
                for dep_name in depends_on:
                    dep_name_str = str(dep_name).strip()
                    pred_id = name_to_id.get(dep_name_str)
                    if pred_id:
                        dep_ids.append(
                            TaskDependency(
                                predecessor_id=pred_id,
                                dependency_type=DependencyType.FINISH_TO_START,
                                lag_days=0,
                            )
                        )
                        latest_pred_end = max(latest_pred_end, scheduled_end.get(pred_id, start_date))

            # If no dependencies, chain to previous task end to keep ordering stable.
            if not dep_ids and tasks:
                prev_end = scheduled_end.get(tasks[-1].id, start_date)
                latest_pred_end = max(latest_pred_end, prev_end)
                dep_ids.append(
                    TaskDependency(
                        predecessor_id=tasks[-1].id,
                        dependency_type=DependencyType.FINISH_TO_START,
                        lag_days=0,
                    )
                )

            task_start = latest_pred_end
            task_end = task_start + timedelta(days=duration_days)

            weather_sensitive = phase in {PhaseType.DEMOLITION, PhaseType.SITE_PREP, PhaseType.FOUNDATION}

            task = TimelineTask(
                id=task_id,
                name=name,
                description=str(spec.get("notes")) if spec.get("notes") else None,
                phase=phase,
                primary_trade=str(spec.get("primary_trade")) if spec.get("primary_trade") else None,
                duration_days=duration_days,
                start_date=task_start.isoformat(),
                end_date=task_end.isoformat(),
                dependencies=dep_ids,
                is_milestone=phase == PhaseType.FINAL_INSPECTION,
                weather_sensitive=weather_sensitive,
                labor_hours=duration_days * 8,
            )
            tasks.append(task)
            scheduled_end[task_id] = task_end

        return tasks
    
    def _calculate_critical_path(self, tasks: List[TimelineTask]) -> CriticalPath:
        """Calculate critical path through tasks.
        
        Simple implementation - assumes sequential tasks.
        Real implementation would use network analysis.
        
        Args:
            tasks: List of tasks.
            
        Returns:
            CriticalPath object.
        """
        # For sequential tasks, all are on critical path
        path_task_ids = [task.id for task in tasks]
        total_duration = sum(task.duration_days for task in tasks)
        
        # Identify bottlenecks (longest tasks)
        sorted_tasks = sorted(tasks, key=lambda t: t.duration_days, reverse=True)
        bottlenecks = [t.id for t in sorted_tasks[:3]]
        
        return CriticalPath(
            path_task_ids=path_task_ids,
            total_duration=total_duration,
            bottlenecks=bottlenecks
        )
    
    def _generate_milestones(self, tasks: List[TimelineTask]) -> List[Milestone]:
        """Generate project milestones from tasks.
        
        Args:
            tasks: List of tasks.
            
        Returns:
            List of Milestone objects.
        """
        milestones = []
        
        if not tasks:
            return milestones
        
        # Project Start
        milestones.append(Milestone(
            id="ms-1",
            name="Project Start",
            date=tasks[0].start_date,
            description="Project kickoff and mobilization"
        ))
        
        # Find rough-in completion
        rough_in_tasks = [t for t in tasks if t.phase == PhaseType.ROUGH_IN]
        if rough_in_tasks:
            milestones.append(Milestone(
                id="ms-2",
                name="Rough-In Complete",
                date=rough_in_tasks[-1].end_date,
                description="All rough-in work complete, ready for inspection",
                related_task_id=rough_in_tasks[-1].id,
                is_payment_milestone=True
            ))
        
        # Find finish phase start
        finish_tasks = [t for t in tasks if t.phase == PhaseType.FINISH]
        if finish_tasks:
            milestones.append(Milestone(
                id="ms-3",
                name="Finish Phase Start",
                date=finish_tasks[0].start_date,
                description="Beginning finish work",
                related_task_id=finish_tasks[0].id
            ))
        
        # Project Complete
        milestones.append(Milestone(
            id="ms-4",
            name="Project Complete",
            date=tasks[-1].end_date,
            description="Final inspection passed, project handover",
            related_task_id=tasks[-1].id,
            is_payment_milestone=True
        ))
        
        return milestones
    
    def _calculate_weather_impact(
        self,
        tasks: List[TimelineTask],
        winter_impact: str,
        seasonal_adjustment: float
    ) -> WeatherImpact:
        """Calculate weather impact on schedule.
        
        Args:
            tasks: List of tasks.
            winter_impact: Winter impact level (low/moderate/high).
            seasonal_adjustment: Seasonal multiplier.
            
        Returns:
            WeatherImpact object.
        """
        # Count weather-sensitive task days
        sensitive_days = sum(
            t.duration_days for t in tasks if t.weather_sensitive
        )
        
        # Calculate expected weather delays
        impact_multipliers = {"low": 0.05, "moderate": 0.15, "high": 0.25}
        impact_mult = impact_multipliers.get(winter_impact, 0.10)
        
        expected_delay = int(sensitive_days * impact_mult)
        buffer_days = max(2, expected_delay + 2)
        
        # Determine risk level
        if expected_delay > 5:
            risk_level = "high"
        elif expected_delay > 2:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Determine season
        now = datetime.now()
        month = now.month
        if month in [12, 1, 2]:
            season = "winter"
        elif month in [3, 4, 5]:
            season = "spring"
        elif month in [6, 7, 8]:
            season = "summer"
        else:
            season = "fall"
        
        return WeatherImpact(
            expected_weather_days=expected_delay,
            weather_buffer_days=buffer_days,
            season=season,
            weather_risk_level=risk_level,
            notes=f"Schedule accounts for {buffer_days} weather buffer days during {season}"
        )
    
    def _calculate_end_date(self, tasks: List[TimelineTask]) -> datetime:
        """Calculate project end date from tasks.
        
        Args:
            tasks: List of tasks.
            
        Returns:
            End datetime.
        """
        if not tasks:
            return datetime.now()
        
        last_task = tasks[-1]
        if last_task.end_date:
            return datetime.fromisoformat(last_task.end_date.replace("Z", ""))
        
        # Calculate from durations
        start = datetime.fromisoformat(tasks[0].start_date.replace("Z", ""))
        total_days = sum(t.duration_days for t in tasks)
        return start + timedelta(days=total_days)
    
    async def _generate_summary(
        self,
        tasks: List[TimelineTask],
        total_duration: int,
        calendar_days: int,
        project_type: str,
        weather_impact: WeatherImpact
    ) -> TimelineSummary:
        """Generate timeline summary.
        
        Args:
            tasks: List of tasks.
            total_duration: Total working days.
            calendar_days: Total calendar days.
            project_type: Type of project.
            weather_impact: Weather impact analysis.
            
        Returns:
            TimelineSummary object.
        """
        weeks = round(calendar_days / 7, 1)
        
        # Get key phases
        phases = list(set(t.phase.value for t in tasks))
        
        # Generate assumptions
        assumptions = [
            "Standard 5-day work week",
            "Normal weather conditions",
            "Materials available as scheduled",
            "Permits approved within standard timeframe",
            "Single crew per trade"
        ]
        
        # Generate risks
        risks = []
        if weather_impact.weather_risk_level == "high":
            risks.append(f"High weather risk during {weather_impact.season}")
        risks.append("Material lead times may vary")
        risks.append("Inspection delays possible")
        
        return TimelineSummary(
            headline=f"Project duration: {total_duration} working days ({weeks} weeks)",
            total_working_days=total_duration,
            total_calendar_days=calendar_days,
            weeks=weeks,
            key_phases=phases,
            assumptions=assumptions,
            risks=risks
        )
    
    def _calculate_confidence(
        self,
        tasks: List[TimelineTask],
        weather_impact: WeatherImpact
    ) -> float:
        """Calculate schedule confidence.
        
        Args:
            tasks: List of tasks.
            weather_impact: Weather impact analysis.
            
        Returns:
            Confidence score (0-1).
        """
        confidence = 0.80  # Base confidence
        
        # Reduce for weather risk
        if weather_impact.weather_risk_level == "high":
            confidence -= 0.10
        elif weather_impact.weather_risk_level == "medium":
            confidence -= 0.05
        
        # Increase for good task coverage
        if len(tasks) >= 10:
            confidence += 0.05
        
        return max(0.5, min(0.95, confidence))
