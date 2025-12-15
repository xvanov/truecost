"""Agent output models for TrueCost.

Pydantic models for agent outputs, status tracking, and pipeline state.
"""

from enum import Enum
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class AgentStatus(str, Enum):
    """Status of an agent in the pipeline."""
    
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"


class AgentOutput(BaseModel):
    """Output from a single agent execution.
    
    Stored in /estimates/{id}/agentOutputs/{agentName}
    """
    
    status: AgentStatus = Field(
        description="Current status of the agent"
    )
    output: Dict[str, Any] = Field(
        default_factory=dict,
        description="Agent's output data"
    )
    summary: Optional[str] = Field(
        default=None,
        description="Human-readable summary of the output"
    )
    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Confidence score (0-1)"
    )
    tokens_used: Optional[int] = Field(
        default=None,
        alias="tokensUsed",
        ge=0,
        description="Number of LLM tokens used"
    )
    duration_ms: Optional[int] = Field(
        default=None,
        alias="durationMs",
        ge=0,
        description="Processing duration in milliseconds"
    )
    score: Optional[int] = Field(
        default=None,
        ge=0,
        le=100,
        description="Scorer agent score (0-100)"
    )
    retry_count: int = Field(
        default=0,
        alias="retryCount",
        ge=0,
        description="Number of retry attempts"
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if failed"
    )
    created_at: Optional[datetime] = Field(
        default=None,
        alias="createdAt",
        description="When the output was created"
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        alias="updatedAt",
        description="When the output was last updated"
    )
    
    class Config:
        populate_by_name = True
        use_enum_values = True


class AgentScoreResult(BaseModel):
    """Result from a scorer agent."""
    
    score: int = Field(
        ge=0,
        le=100,
        description="Numerical score (0-100)"
    )
    passed: bool = Field(
        description="Whether the score passes threshold (>= 80)"
    )
    breakdown: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Score breakdown by criterion"
    )
    feedback: str = Field(
        default="",
        description="Overall feedback message"
    )


class CriticFeedback(BaseModel):
    """Feedback from a critic agent."""
    
    issues: List[str] = Field(
        default_factory=list,
        description="List of specific issues found"
    )
    why_wrong: str = Field(
        default="",
        alias="whyWrong",
        description="Explanation of why issues are problematic"
    )
    how_to_fix: List[str] = Field(
        default_factory=list,
        alias="howToFix",
        description="Actionable steps to fix issues"
    )
    suggestions: List[str] = Field(
        default_factory=list,
        description="Additional recommendations"
    )
    priority: str = Field(
        default="high",
        description="Priority level: high, medium, low"
    )
    score: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Original scorer score"
    )
    scorer_feedback: str = Field(
        default="",
        alias="scorerFeedback",
        description="Original feedback from scorer"
    )
    
    class Config:
        populate_by_name = True


class PipelineStatus(BaseModel):
    """Status of the entire pipeline execution.
    
    Stored in estimates/{id}.pipelineStatus
    """
    
    current_agent: Optional[str] = Field(
        default=None,
        alias="currentAgent",
        description="Name of currently executing agent"
    )
    completed_agents: List[str] = Field(
        default_factory=list,
        alias="completedAgents",
        description="List of completed agent names"
    )
    progress: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Overall progress percentage"
    )
    agent_statuses: Dict[str, str] = Field(
        default_factory=dict,
        alias="agentStatuses",
        description="Status per agent"
    )
    scores: Dict[str, int] = Field(
        default_factory=dict,
        description="Scorer results per agent"
    )
    retries: Dict[str, int] = Field(
        default_factory=dict,
        description="Retry count per agent"
    )
    started_at: Optional[datetime] = Field(
        default=None,
        alias="startedAt",
        description="When pipeline started"
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        alias="completedAt",
        description="When pipeline completed"
    )
    last_updated: Optional[datetime] = Field(
        default=None,
        alias="lastUpdated",
        description="Last status update time"
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if pipeline failed"
    )
    
    class Config:
        populate_by_name = True
    
    def get_progress_percentage(self, total_agents: int) -> int:
        """Calculate progress percentage based on completed agents.
        
        Args:
            total_agents: Total number of agents in pipeline.
            
        Returns:
            Progress percentage (0-100).
        """
        if total_agents == 0:
            return 0
        return int((len(self.completed_agents) / total_agents) * 100)
    
    def is_complete(self, agent_sequence: List[str]) -> bool:
        """Check if all agents have completed.
        
        Args:
            agent_sequence: List of all agent names.
            
        Returns:
            True if all agents completed.
        """
        return set(self.completed_agents) == set(agent_sequence)
    
    def has_failed(self) -> bool:
        """Check if pipeline has failed.
        
        Returns:
            True if any agent is in failed status.
        """
        return any(
            status == AgentStatus.FAILED.value 
            for status in self.agent_statuses.values()
        )


class PipelineResult(BaseModel):
    """Final result of pipeline execution."""
    
    success: bool = Field(
        description="Whether pipeline completed successfully"
    )
    estimate_id: str = Field(
        alias="estimateId",
        description="Estimate document ID"
    )
    status: str = Field(
        description="Final status: completed, failed, cancelled"
    )
    completed_agents: List[str] = Field(
        default_factory=list,
        alias="completedAgents",
        description="List of completed agents"
    )
    failed_agent: Optional[str] = Field(
        default=None,
        alias="failedAgent",
        description="Name of agent that caused failure"
    )
    total_duration_ms: Optional[int] = Field(
        default=None,
        alias="totalDurationMs",
        description="Total pipeline duration in milliseconds"
    )
    total_tokens_used: Optional[int] = Field(
        default=None,
        alias="totalTokensUsed",
        description="Total LLM tokens used"
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if failed"
    )
    
    class Config:
        populate_by_name = True




