"""Timeline Critic for TrueCost.

Provides actionable feedback for Timeline Agent output improvement.
"""

from typing import Any, Dict, List, Optional
import structlog

from agents.critics.base_critic import BaseCritic
from services.firestore_service import FirestoreService
from services.llm_service import LLMService

logger = structlog.get_logger()


class TimelineCritic(BaseCritic):
    """Critic for Timeline Agent output.
    
    Analyzes timeline output and provides specific feedback
    for improving schedule accuracy and completeness.
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize TimelineCritic."""
        super().__init__(
            name="timeline_critic",
            primary_agent_name="timeline",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
    
    def get_critique_prompt(self) -> str:
        """Get domain-specific critique prompt.
        
        Returns:
            Prompt string for LLM critique.
        """
        return """You are a construction scheduling expert reviewing a project timeline.

Critique Focus:
1. Are task durations realistic for the work involved?
2. Are dependencies properly sequenced (can't do finish before rough-in)?
3. Is the critical path accurate?
4. Are milestones at appropriate points?
5. Is weather impact properly considered?

For each issue found, explain:
- What specifically is wrong with the schedule
- Why it's a problem (delays, coordination issues, etc.)
- How to fix it with specific duration or sequencing changes

Focus on:
- Trade sequencing (plumbing before drywall, etc.)
- Inspection/permit wait times
- Material lead time considerations
- Realistic crew productivity
- Weather-sensitive work timing"""
    
    async def analyze_output(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any],
        score: int,
        scorer_feedback: str
    ) -> Dict[str, Any]:
        """Analyze timeline output and provide feedback.
        
        Args:
            output: Timeline Agent output to critique.
            input_data: Original input data.
            score: Score from scorer.
            scorer_feedback: Feedback from scorer.
            
        Returns:
            Dict with issues, why_wrong, and how_to_fix.
        """
        issues = []
        why_wrong = []
        how_to_fix = []
        
        # Analyze task structure
        task_issues = self._analyze_tasks(output, input_data)
        if task_issues:
            issues.extend(task_issues["issues"])
            why_wrong.extend(task_issues["why_wrong"])
            how_to_fix.extend(task_issues["how_to_fix"])
        
        # Analyze dependencies
        dep_issues = self._analyze_dependencies(output)
        if dep_issues:
            issues.extend(dep_issues["issues"])
            why_wrong.extend(dep_issues["why_wrong"])
            how_to_fix.extend(dep_issues["how_to_fix"])
        
        # Analyze duration
        duration_issues = self._analyze_duration(output, input_data)
        if duration_issues:
            issues.extend(duration_issues["issues"])
            why_wrong.extend(duration_issues["why_wrong"])
            how_to_fix.extend(duration_issues["how_to_fix"])
        
        # Analyze milestones
        milestone_issues = self._analyze_milestones(output)
        if milestone_issues:
            issues.extend(milestone_issues["issues"])
            why_wrong.extend(milestone_issues["why_wrong"])
            how_to_fix.extend(milestone_issues["how_to_fix"])
        
        # If no specific issues found, provide general guidance
        if not issues:
            issues.append("Timeline could be more detailed")
            why_wrong.append("Score below threshold suggests schedule needs refinement")
            how_to_fix.append("Add more task detail and verify durations against scope")
        
        return {
            "issues": issues,
            "why_wrong": why_wrong,
            "how_to_fix": how_to_fix,
            "scorer_feedback": scorer_feedback,
            "priority_fixes": how_to_fix[:3]
        }
    
    def _analyze_tasks(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Optional[Dict[str, List[str]]]:
        """Analyze task definitions.
        
        Args:
            output: Timeline output.
            input_data: Input data.
            
        Returns:
            Dict with issues if any found.
        """
        issues = []
        why_wrong = []
        how_to_fix = []
        
        tasks = output.get("tasks", [])
        
        if not tasks:
            issues.append("No tasks defined in timeline")
            why_wrong.append("A project schedule must have defined tasks")
            how_to_fix.append("Generate tasks based on scope divisions and line items")
            return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix}
        
        # Check for missing key phases
        task_names = " ".join(t.get("name", "").lower() for t in tasks)
        
        key_phases = ["permit", "demolition", "rough", "finish", "inspection"]
        missing_phases = [p for p in key_phases if p not in task_names]
        
        if missing_phases:
            issues.append(f"Missing key phases: {', '.join(missing_phases)}")
            why_wrong.append("Standard construction projects require these phases")
            how_to_fix.append(f"Add tasks for: {', '.join(missing_phases)}")
        
        # Check for unrealistic individual durations
        short_tasks = [t for t in tasks if t.get("duration", 0) < 1]
        long_tasks = [t for t in tasks if t.get("duration", 0) > 30]
        
        if short_tasks:
            issues.append(f"{len(short_tasks)} tasks have <1 day duration")
            why_wrong.append("Tasks should have at least 1 day for planning purposes")
            how_to_fix.append("Increase minimum task duration to 1 day")
        
        if long_tasks:
            task_names_long = [t.get("name", "?") for t in long_tasks[:2]]
            issues.append(f"Tasks with very long durations: {', '.join(task_names_long)}")
            why_wrong.append("Long tasks should be broken into smaller chunks for tracking")
            how_to_fix.append("Split tasks >30 days into smaller sub-tasks")
        
        return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix} if issues else None
    
    def _analyze_dependencies(
        self,
        output: Dict[str, Any]
    ) -> Optional[Dict[str, List[str]]]:
        """Analyze task dependencies.
        
        Args:
            output: Timeline output.
            
        Returns:
            Dict with issues if any found.
        """
        issues = []
        why_wrong = []
        how_to_fix = []
        
        tasks = output.get("tasks", [])
        
        if len(tasks) < 2:
            return None
        
        # Check that tasks after first have dependencies
        tasks_without_deps = [
            t.get("name", "?") for t in tasks[1:5]
            if not t.get("dependencies")
        ]
        
        if tasks_without_deps:
            issues.append(f"Tasks without dependencies: {', '.join(tasks_without_deps)}")
            why_wrong.append("Unlinked tasks create scheduling ambiguity")
            how_to_fix.append("Add finish-to-start dependencies to connect all tasks")
        
        # Check for proper trade sequencing
        task_order = {t.get("id"): i for i, t in enumerate(tasks)}
        task_by_name = {t.get("name", "").lower(): t for t in tasks}
        
        # Rough-in should come before drywall
        rough_in = None
        drywall = None
        for name, task in task_by_name.items():
            if "rough" in name:
                rough_in = task
            if "drywall" in name:
                drywall = task
        
        if rough_in and drywall:
            rough_idx = task_order.get(rough_in.get("id"), 0)
            drywall_idx = task_order.get(drywall.get("id"), 0)
            if drywall_idx <= rough_idx:
                issues.append("Drywall scheduled before rough-in completion")
                why_wrong.append("Drywall must come after electrical/plumbing rough-in")
                how_to_fix.append("Move drywall task to after all rough-in tasks")
        
        return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix} if issues else None
    
    def _analyze_duration(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Optional[Dict[str, List[str]]]:
        """Analyze total duration.
        
        Args:
            output: Timeline output.
            input_data: Input data.
            
        Returns:
            Dict with issues if any found.
        """
        issues = []
        why_wrong = []
        how_to_fix = []
        
        total_duration = output.get("totalDuration", 0)
        
        if total_duration <= 0:
            issues.append("No total duration calculated")
            why_wrong.append("Duration is required for project planning")
            how_to_fix.append("Sum all task durations along critical path")
            return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix}

        # Do NOT enforce fixed remodel-duration heuristics (project timelines vary widely by scope,
        # sequencing, lead times, trade availability, and owner preferences). Only validate structural
        # completeness/consistency.

        # Check duration range exists
        duration_range = output.get("durationRange", {})
        optimistic = duration_range.get("optimistic")
        pessimistic = duration_range.get("pessimistic")

        if optimistic is None or pessimistic is None:
            issues.append("Missing optimistic/pessimistic duration range")
            why_wrong.append("Schedule risk requires duration range for planning")
            how_to_fix.append("Add optimistic (85% of base) and pessimistic (135% of base) durations")
        else:
            try:
                optimistic_i = int(optimistic)
                pessimistic_i = int(pessimistic)
                if optimistic_i <= 0 or pessimistic_i <= 0:
                    issues.append("Invalid optimistic/pessimistic duration range (must be > 0)")
                    why_wrong.append("Non-positive duration ranges are not usable for planning")
                    how_to_fix.append("Ensure optimistic and pessimistic durations are positive integers")
                elif optimistic_i > pessimistic_i:
                    issues.append("Invalid duration range (optimistic > pessimistic)")
                    why_wrong.append("Optimistic duration should be less than pessimistic duration")
                    how_to_fix.append("Swap/fix durationRange values so optimistic < pessimimistic")
                elif not (optimistic_i <= int(total_duration) <= pessimistic_i):
                    issues.append("Inconsistent duration range (totalDuration not within optimistic/pessimistic)")
                    why_wrong.append("Duration range should bound the base schedule duration")
                    how_to_fix.append("Adjust durationRange so it brackets totalDuration")
            except Exception:
                issues.append("Invalid duration range (optimistic/pessimistic must be numeric)")
                why_wrong.append("Non-numeric duration ranges cannot be used for risk planning")
                how_to_fix.append("Provide numeric optimistic/pessimistic values")
        
        return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix} if issues else None
    
    def _analyze_milestones(
        self,
        output: Dict[str, Any]
    ) -> Optional[Dict[str, List[str]]]:
        """Analyze milestones.
        
        Args:
            output: Timeline output.
            
        Returns:
            Dict with issues if any found.
        """
        issues = []
        why_wrong = []
        how_to_fix = []
        
        milestones = output.get("milestones", [])
        
        if not milestones:
            issues.append("No milestones defined")
            why_wrong.append("Milestones mark key progress points for payments and tracking")
            how_to_fix.append("Add milestones: Project Start, Rough-In Complete, Finish Start, Project Complete")
        elif len(milestones) < 3:
            issues.append(f"Only {len(milestones)} milestones - too few")
            why_wrong.append("More milestones help with progress tracking and payment scheduling")
            how_to_fix.append("Add milestones at key phase transitions")
        
        # Check for missing milestone dates
        milestones_without_dates = [m.get("name", "?") for m in milestones if not m.get("date")]
        
        if milestones_without_dates:
            issues.append(f"Milestones missing dates: {', '.join(milestones_without_dates)}")
            why_wrong.append("Milestones without dates cannot be tracked")
            how_to_fix.append("Calculate milestone dates from task schedule")
        
        return {"issues": issues, "why_wrong": why_wrong, "how_to_fix": how_to_fix} if issues else None
