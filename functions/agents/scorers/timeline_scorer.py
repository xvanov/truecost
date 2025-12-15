"""Timeline Scorer for TrueCost.

Evaluates Timeline Agent output for scheduling validity
and completeness.
"""

from typing import Any, Dict, List, Optional
import structlog

from agents.scorers.base_scorer import BaseScorer
from services.firestore_service import FirestoreService
from services.llm_service import LLMService

logger = structlog.get_logger()


class TimelineScorer(BaseScorer):
    """Scorer for Timeline Agent output.
    
    Evaluates:
    1. Tasks defined with valid durations
    2. Dependencies are valid
    3. Critical path identified
    4. Milestones present
    5. Duration is reasonable for scope
    6. Weather impact considered
    """
    
    # Duration bounds (in working days)
    MIN_PROJECT_DURATION = 5
    MAX_PROJECT_DURATION = 365
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize TimelineScorer."""
        super().__init__(
            name="timeline_scorer",
            primary_agent_name="timeline",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
    
    def get_scoring_criteria(self) -> List[Dict[str, Any]]:
        """Get scoring criteria for timeline output.
        
        Returns:
            List of criteria with names, descriptions, and weights.
        """
        return [
            {
                "name": "tasks_valid",
                "description": "Tasks have valid structure and durations",
                "weight": 3
            },
            {
                "name": "dependencies_valid",
                "description": "Task dependencies are properly defined",
                "weight": 2
            },
            {
                "name": "critical_path_valid",
                "description": "Critical path is identified and valid",
                "weight": 2
            },
            {
                "name": "milestones_present",
                "description": "Key milestones are defined",
                "weight": 2
            },
            {
                "name": "duration_reasonable",
                "description": "Total duration is reasonable for project scope",
                "weight": 2
            },
            {
                "name": "dates_consistent",
                "description": "Start/end dates are consistent with durations",
                "weight": 1
            }
        ]
    
    async def evaluate_criterion(
        self,
        criterion: Dict[str, Any],
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate a single criterion.
        
        Args:
            criterion: The criterion to evaluate.
            output: Timeline Agent output.
            input_data: Original input data.
            
        Returns:
            Dict with score and feedback.
        """
        name = criterion.get("name")

        # If TimelineAgent explicitly returned "N/A" due to insufficient input data,
        # treat that as a valid completion (policy: never invent numbers / no canned templates).
        # The pipeline should continue and surface the N/A to the UI rather than failing the run.
        err_code = (output.get("error") or {}).get("code")
        if err_code == "INSUFFICIENT_DATA":
            return {
                "score": 100,
                "feedback": "Timeline marked N/A (INSUFFICIENT_DATA) - passing scorer so pipeline can complete"
            }
        
        if name == "tasks_valid":
            return self._check_tasks_valid(output)
        elif name == "dependencies_valid":
            return self._check_dependencies_valid(output)
        elif name == "critical_path_valid":
            return self._check_critical_path_valid(output)
        elif name == "milestones_present":
            return self._check_milestones_present(output)
        elif name == "duration_reasonable":
            return self._check_duration_reasonable(output, input_data)
        elif name == "dates_consistent":
            return self._check_dates_consistent(output)
        
        return {"score": 85, "feedback": "Unknown criterion"}
    
    def _check_tasks_valid(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check that tasks are valid.
        
        Args:
            output: Timeline Agent output.
            
        Returns:
            Score and feedback.
        """
        tasks = output.get("tasks", [])
        
        if not tasks:
            return {
                "score": 20,
                "feedback": "No tasks defined in timeline"
            }
        
        if len(tasks) < 3:
            return {
                "score": 50,
                "feedback": f"Only {len(tasks)} tasks - too few for typical project"
            }
        
        # Check task structure
        invalid_tasks = []
        for task in tasks:
            if not task.get("id"):
                invalid_tasks.append("missing ID")
            if not task.get("name"):
                invalid_tasks.append("missing name")
            duration = task.get("duration", 0)
            if duration <= 0:
                invalid_tasks.append(f"{task.get('name', 'unknown')}: invalid duration")
        
        if invalid_tasks:
            return {
                "score": 60,
                "feedback": f"Invalid tasks: {', '.join(invalid_tasks[:3])}"
            }
        
        # Check for reasonable durations
        task_durations = [t.get("duration", 0) for t in tasks]
        if any(d > 60 for d in task_durations):
            return {
                "score": 75,
                "feedback": "Some tasks have unusually long durations (>60 days)"
            }
        
        return {
            "score": 100,
            "feedback": f"{len(tasks)} valid tasks defined"
        }
    
    def _check_dependencies_valid(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check that task dependencies are valid.
        
        Args:
            output: Timeline Agent output.
            
        Returns:
            Score and feedback.
        """
        tasks = output.get("tasks", [])
        
        if not tasks:
            return {"score": 50, "feedback": "No tasks to check dependencies"}
        
        task_ids = set(t.get("id") for t in tasks)
        
        # First task should have no dependencies
        first_task = tasks[0]
        first_deps = first_task.get("dependencies", [])
        
        if first_deps:
            return {
                "score": 70,
                "feedback": "First task should not have dependencies"
            }
        
        # Check dependencies reference valid tasks
        invalid_deps = []
        for task in tasks[1:]:
            deps = task.get("dependencies", [])
            for dep in deps:
                if isinstance(dep, str):
                    dep_id = dep
                else:
                    dep_id = dep  # Could be dict in some formats
                
                if dep_id not in task_ids:
                    invalid_deps.append(f"{task.get('id')}->{dep_id}")
        
        if invalid_deps:
            return {
                "score": 60,
                "feedback": f"Invalid dependencies: {', '.join(invalid_deps[:3])}"
            }
        
        # Check that most tasks have dependencies (except first)
        tasks_with_deps = sum(1 for t in tasks[1:] if t.get("dependencies"))
        
        if tasks_with_deps < len(tasks) - 2:
            return {
                "score": 75,
                "feedback": f"Only {tasks_with_deps}/{len(tasks)-1} tasks have dependencies"
            }
        
        return {
            "score": 100,
            "feedback": "All task dependencies are valid"
        }
    
    def _check_critical_path_valid(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check that critical path is valid.
        
        Args:
            output: Timeline Agent output.
            
        Returns:
            Score and feedback.
        """
        critical_path = output.get("criticalPath", [])
        tasks = output.get("tasks", [])
        
        if not critical_path:
            return {
                "score": 40,
                "feedback": "No critical path identified"
            }
        
        task_ids = set(t.get("id") for t in tasks)
        
        # Check that critical path tasks exist
        invalid_cp = [cp for cp in critical_path if cp not in task_ids]
        
        if invalid_cp:
            return {
                "score": 60,
                "feedback": f"Critical path contains invalid tasks: {invalid_cp[:3]}"
            }
        
        # Check that critical path includes start and end
        if tasks:
            if tasks[0].get("id") not in critical_path:
                return {
                    "score": 75,
                    "feedback": "Critical path should include first task"
                }
            if tasks[-1].get("id") not in critical_path:
                return {
                    "score": 75,
                    "feedback": "Critical path should include last task"
                }
        
        # Check critical path length is reasonable
        if len(critical_path) < 3:
            return {
                "score": 70,
                "feedback": f"Critical path too short ({len(critical_path)} tasks)"
            }
        
        return {
            "score": 100,
            "feedback": f"Valid critical path with {len(critical_path)} tasks"
        }
    
    def _check_milestones_present(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check that milestones are defined.
        
        Args:
            output: Timeline Agent output.
            
        Returns:
            Score and feedback.
        """
        milestones = output.get("milestones", [])
        
        if not milestones:
            return {
                "score": 50,
                "feedback": "No milestones defined"
            }
        
        if len(milestones) < 2:
            return {
                "score": 70,
                "feedback": "Should have at least start and end milestones"
            }
        
        # Check milestone structure
        valid_milestones = 0
        for ms in milestones:
            if ms.get("name") and ms.get("date"):
                valid_milestones += 1
        
        if valid_milestones < len(milestones) * 0.8:
            return {
                "score": 75,
                "feedback": f"Some milestones missing name or date"
            }
        
        return {
            "score": 100,
            "feedback": f"{len(milestones)} milestones defined"
        }
    
    def _check_duration_reasonable(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Check that total duration is reasonable.
        
        Args:
            output: Timeline Agent output.
            input_data: Input data with scope.
            
        Returns:
            Score and feedback.
        """
        total_duration = output.get("totalDuration", 0)
        
        if total_duration <= 0:
            return {
                "score": 20,
                "feedback": "No total duration calculated"
            }
        
        if total_duration < self.MIN_PROJECT_DURATION:
            return {
                "score": 50,
                "feedback": f"Duration {total_duration} days is unrealistically short"
            }
        
        if total_duration > self.MAX_PROJECT_DURATION:
            return {
                "score": 50,
                "feedback": f"Duration {total_duration} days is unrealistically long"
            }
        
        # Get scope for comparison
        scope_output = input_data.get("scope_output", {})
        total_items = scope_output.get("totalLineItems", 10)
        
        # Rough estimate: each item takes 0.5-2 days
        min_expected = total_items * 0.5
        max_expected = total_items * 3
        
        if total_duration < min_expected:
            return {
                "score": 70,
                "feedback": f"Duration ({total_duration}d) may be too short for {total_items} items"
            }
        
        return {
            "score": 100,
            "feedback": f"Duration of {total_duration} days is reasonable"
        }
    
    def _check_dates_consistent(self, output: Dict[str, Any]) -> Dict[str, Any]:
        """Check that dates are consistent.
        
        Args:
            output: Timeline Agent output.
            
        Returns:
            Score and feedback.
        """
        start_date = output.get("startDate")
        end_date = output.get("endDate")
        total_duration = output.get("totalDuration", 0)
        calendar_days = output.get("totalCalendarDays", 0)
        
        if not start_date or not end_date:
            return {
                "score": 50,
                "feedback": "Missing start or end date"
            }
        
        # Check tasks have dates
        tasks = output.get("tasks", [])
        tasks_with_dates = sum(1 for t in tasks if t.get("start") and t.get("end"))
        
        if tasks_with_dates < len(tasks) * 0.8:
            return {
                "score": 70,
                "feedback": f"Only {tasks_with_dates}/{len(tasks)} tasks have dates"
            }
        
        # Check calendar days vs working days (rough check)
        if calendar_days > 0 and total_duration > 0:
            ratio = calendar_days / total_duration
            # Expect ~1.4 ratio (5 working days = 7 calendar days)
            if ratio < 1.0 or ratio > 2.0:
                return {
                    "score": 75,
                    "feedback": f"Calendar/working day ratio ({ratio:.1f}) unusual"
                }
        
        return {
            "score": 100,
            "feedback": "Dates are consistent"
        }
