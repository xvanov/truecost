"""Timeline Pydantic models for TrueCost.

This module defines the data models for project timeline generation
including tasks, dependencies, and critical path analysis.
"""

from datetime import date, datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# =============================================================================
# ENUMS
# =============================================================================


class TaskStatus(str, Enum):
    """Task status in timeline."""
    
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DELAYED = "delayed"
    ON_HOLD = "on_hold"


class TaskPriority(str, Enum):
    """Task priority level."""
    
    CRITICAL = "critical"  # On critical path
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PhaseType(str, Enum):
    """Construction phase types."""
    
    PRECONSTRUCTION = "preconstruction"
    DEMOLITION = "demolition"
    SITE_PREP = "site_prep"
    FOUNDATION = "foundation"
    FRAMING = "framing"
    ROUGH_IN = "rough_in"
    INSULATION = "insulation"
    DRYWALL = "drywall"
    FINISH = "finish"
    FIXTURES = "fixtures"
    FINAL_INSPECTION = "final_inspection"
    PUNCH_LIST = "punch_list"


class DependencyType(str, Enum):
    """Task dependency types."""
    
    FINISH_TO_START = "FS"   # Task B starts after Task A finishes
    START_TO_START = "SS"    # Task B starts when Task A starts
    FINISH_TO_FINISH = "FF"  # Task B finishes when Task A finishes
    START_TO_FINISH = "SF"   # Task B finishes when Task A starts (rare)


# =============================================================================
# TASK DEPENDENCY MODEL
# =============================================================================


class TaskDependency(BaseModel):
    """Dependency relationship between tasks."""
    
    predecessor_id: str = Field(..., description="ID of predecessor task")
    dependency_type: DependencyType = Field(
        default=DependencyType.FINISH_TO_START,
        description="Type of dependency"
    )
    lag_days: int = Field(
        default=0, ge=-30, le=30,
        description="Lag time in days (can be negative for lead)"
    )


# =============================================================================
# TIMELINE TASK MODEL
# =============================================================================


class TimelineTask(BaseModel):
    """Individual task in the project timeline.
    
    Contains duration, dependencies, and scheduling information.
    """
    
    # Identification
    id: str = Field(..., description="Unique task identifier")
    name: str = Field(..., description="Task name")
    description: Optional[str] = Field(None, description="Task description")
    
    # Categorization
    phase: PhaseType = Field(..., description="Construction phase")
    csi_division: Optional[str] = Field(None, description="Related CSI division")
    primary_trade: Optional[str] = Field(None, description="Primary trade responsible")
    
    # Duration
    duration_days: int = Field(..., ge=0, description="Task duration in working days")
    duration_range_low: int = Field(
        default=0, ge=0, description="Optimistic duration"
    )
    duration_range_high: int = Field(
        default=0, ge=0, description="Pessimistic duration"
    )
    
    # Scheduling
    start_date: Optional[str] = Field(None, description="Scheduled start date (ISO format)")
    end_date: Optional[str] = Field(None, description="Scheduled end date (ISO format)")
    
    # Dependencies
    dependencies: List[TaskDependency] = Field(
        default_factory=list, description="Task dependencies"
    )
    
    # Slack/Float
    total_float: int = Field(
        default=0, ge=0,
        description="Total float in days (0 = critical path)"
    )
    free_float: int = Field(
        default=0, ge=0,
        description="Free float in days"
    )
    
    # Status and priority
    status: TaskStatus = Field(
        default=TaskStatus.NOT_STARTED, description="Current status"
    )
    priority: TaskPriority = Field(
        default=TaskPriority.MEDIUM, description="Task priority"
    )
    is_milestone: bool = Field(default=False, description="Is this a milestone?")
    is_critical: bool = Field(
        default=False, description="Is on critical path?"
    )
    
    # Resources
    labor_hours: float = Field(default=0.0, ge=0, description="Estimated labor hours")
    crew_size: int = Field(default=1, ge=1, description="Number of workers needed")
    
    # Notes
    notes: Optional[str] = Field(None, description="Additional notes")
    weather_sensitive: bool = Field(
        default=False, description="Is task weather-sensitive?"
    )

    @model_validator(mode="after")
    def set_duration_range(self) -> "TimelineTask":
        """Set duration range defaults if not provided."""
        if self.duration_range_low == 0:
            self.duration_range_low = max(1, int(self.duration_days * 0.8))
        if self.duration_range_high == 0:
            self.duration_range_high = int(self.duration_days * 1.3)
        return self


# =============================================================================
# MILESTONE MODEL
# =============================================================================


class Milestone(BaseModel):
    """Project milestone marker."""
    
    id: str = Field(..., description="Milestone ID")
    name: str = Field(..., description="Milestone name")
    date: str = Field(..., description="Target date (ISO format)")
    description: Optional[str] = Field(None, description="Milestone description")
    related_task_id: Optional[str] = Field(
        None, description="Related task that triggers this milestone"
    )
    is_payment_milestone: bool = Field(
        default=False, description="Is this a payment milestone?"
    )


# =============================================================================
# CRITICAL PATH MODEL
# =============================================================================


class CriticalPath(BaseModel):
    """Critical path analysis results."""
    
    path_task_ids: List[str] = Field(
        ..., description="Task IDs in critical path order"
    )
    total_duration: int = Field(
        ..., ge=0, description="Total critical path duration in days"
    )
    bottlenecks: List[str] = Field(
        default_factory=list,
        description="Task IDs that are bottlenecks"
    )


# =============================================================================
# WEATHER FACTOR MODEL
# =============================================================================


class WeatherImpact(BaseModel):
    """Weather impact on timeline."""
    
    expected_weather_days: int = Field(
        default=0, ge=0, description="Expected weather delay days"
    )
    weather_buffer_days: int = Field(
        default=0, ge=0, description="Buffer added for weather"
    )
    season: str = Field(default="", description="Primary season for work")
    weather_risk_level: str = Field(
        default="low", description="Weather risk level (low/medium/high)"
    )
    notes: str = Field(default="", description="Weather-related notes")


# =============================================================================
# TIMELINE SUMMARY MODEL
# =============================================================================


class TimelineSummary(BaseModel):
    """Human-readable timeline summary."""
    
    headline: str = Field(..., description="One-line summary")
    total_working_days: int = Field(..., ge=0, description="Total working days")
    total_calendar_days: int = Field(..., ge=0, description="Total calendar days")
    weeks: float = Field(..., ge=0, description="Duration in weeks")
    key_phases: List[str] = Field(
        default_factory=list, description="Key project phases"
    )
    assumptions: List[str] = Field(
        default_factory=list, description="Scheduling assumptions"
    )
    risks: List[str] = Field(
        default_factory=list, description="Schedule risks"
    )


# =============================================================================
# MAIN PROJECT TIMELINE MODEL
# =============================================================================


class ProjectTimeline(BaseModel):
    """Complete project timeline output from Timeline Agent.
    
    Contains all tasks, dependencies, critical path, and schedule analysis.
    """
    
    # Metadata
    estimate_id: str = Field(..., description="Parent estimate ID")
    generated_date: str = Field(
        default_factory=lambda: datetime.now().isoformat(),
        description="When timeline was generated"
    )
    
    # Project dates
    project_start_date: str = Field(..., description="Project start date (ISO)")
    project_end_date: str = Field(..., description="Project end date (ISO)")
    
    # Tasks
    tasks: List[TimelineTask] = Field(
        default_factory=list, description="All project tasks"
    )
    
    # Milestones
    milestones: List[Milestone] = Field(
        default_factory=list, description="Project milestones"
    )
    
    # Critical path
    critical_path: CriticalPath = Field(
        ..., description="Critical path analysis"
    )
    
    # Duration breakdown
    total_duration_days: int = Field(
        ..., ge=0, description="Total project duration in working days"
    )
    total_calendar_days: int = Field(
        ..., ge=0, description="Total project duration in calendar days"
    )
    
    # Duration ranges (for risk analysis)
    duration_optimistic: int = Field(
        default=0, ge=0, description="Optimistic duration (best case)"
    )
    duration_pessimistic: int = Field(
        default=0, ge=0, description="Pessimistic duration (worst case)"
    )
    
    # Weather impact
    weather_impact: WeatherImpact = Field(
        default_factory=WeatherImpact,
        description="Weather impact analysis"
    )
    
    # Summary
    summary: TimelineSummary = Field(
        ..., description="Human-readable summary"
    )
    
    # Confidence
    schedule_confidence: float = Field(
        default=0.75, ge=0, le=1,
        description="Confidence in schedule (0-1)"
    )
    
    def to_agent_output(self) -> Dict[str, Any]:
        """Convert to dict format for agent output storage."""
        return {
            "estimateId": self.estimate_id,
            "generatedDate": self.generated_date,
            "startDate": self.project_start_date,
            "endDate": self.project_end_date,
            "tasks": [
                {
                    "id": task.id,
                    "name": task.name,
                    "phase": task.phase.value,
                    "duration": task.duration_days,
                    "start": task.start_date,
                    "end": task.end_date,
                    "dependencies": [dep.predecessor_id for dep in task.dependencies],
                    "isCritical": task.is_critical,
                    "isMilestone": task.is_milestone,
                    "trade": task.primary_trade,
                    "laborHours": task.labor_hours,
                }
                for task in self.tasks
            ],
            "milestones": [
                {
                    "id": m.id,
                    "name": m.name,
                    "date": m.date,
                    "description": m.description,
                }
                for m in self.milestones
            ],
            "criticalPath": self.critical_path.path_task_ids,
            "totalDuration": self.total_duration_days,
            "totalCalendarDays": self.total_calendar_days,
            "durationRange": {
                "optimistic": self.duration_optimistic,
                "expected": self.total_duration_days,
                "pessimistic": self.duration_pessimistic,
            },
            "weatherImpact": {
                "expectedDelayDays": self.weather_impact.expected_weather_days,
                "bufferDays": self.weather_impact.weather_buffer_days,
                "riskLevel": self.weather_impact.weather_risk_level,
            },
            "summary": self.summary.headline,
            "assumptions": self.summary.assumptions,
            "scheduleRisks": self.summary.risks,
            "confidence": self.schedule_confidence,
        }




