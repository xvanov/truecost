"""Estimate document models for TrueCost.

Pydantic models for the main estimate document stored in Firestore.
"""

from enum import Enum
from typing import Dict, Any, Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

from models.agent_output import PipelineStatus


class EstimateStatus(str, Enum):
    """Status of an estimate document."""
    
    DRAFT = "draft"
    CLARIFYING = "clarifying"
    PROCESSING = "processing"
    PLAN_REVIEW = "plan_review"
    FINAL = "final"
    EXPORTED = "exported"


class EstimateDocument(BaseModel):
    """Main estimate document model.
    
    Represents the full estimate document stored in /estimates/{id}
    """
    
    id: Optional[str] = Field(
        default=None,
        description="Document ID"
    )
    user_id: str = Field(
        alias="userId",
        description="Owner user ID"
    )
    status: EstimateStatus = Field(
        default=EstimateStatus.DRAFT,
        description="Current estimate status"
    )
    
    # ClarificationOutput from Dev 3
    clarification_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="clarificationOutput",
        description="ClarificationOutput v3.0.0 from clarification agent"
    )
    
    # Pipeline tracking
    pipeline_status: Optional[PipelineStatus] = Field(
        default=None,
        alias="pipelineStatus",
        description="Current pipeline execution status"
    )
    
    # Agent outputs (flattened on main document for quick access)
    location_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="locationOutput",
        description="Location agent output"
    )
    scope_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="scopeOutput",
        description="Scope agent output"
    )
    cost_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="costOutput",
        description="Cost agent output"
    )
    risk_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="riskOutput",
        description="Risk agent output"
    )
    timeline_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="timelineOutput",
        description="Timeline agent output"
    )
    final_output: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="finalOutput",
        description="Final agent output"
    )
    
    # Timestamps
    created_at: Optional[datetime] = Field(
        default=None,
        alias="createdAt",
        description="When the estimate was created"
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        alias="updatedAt",
        description="When the estimate was last updated"
    )
    
    class Config:
        populate_by_name = True
        use_enum_values = True
    
    def get_agent_output(self, agent_name: str) -> Optional[Dict[str, Any]]:
        """Get output for a specific agent.
        
        Args:
            agent_name: Name of the agent.
            
        Returns:
            Agent output dict or None.
        """
        output_map = {
            "location": self.location_output,
            "scope": self.scope_output,
            "cost": self.cost_output,
            "risk": self.risk_output,
            "timeline": self.timeline_output,
            "final": self.final_output,
        }
        return output_map.get(agent_name)
    
    def is_pipeline_complete(self) -> bool:
        """Check if the pipeline has completed.
        
        Returns:
            True if all agents have outputs.
        """
        return all([
            self.location_output,
            self.scope_output,
            self.cost_output,
            self.risk_output,
            self.timeline_output,
            self.final_output,
        ])
    
    def to_firestore_dict(self) -> Dict[str, Any]:
        """Convert to Firestore-compatible dict.
        
        Returns:
            Dict with camelCase keys for Firestore.
        """
        return self.model_dump(by_alias=True, exclude_none=True)


class EstimateCreateRequest(BaseModel):
    """Request to create a new estimate."""
    
    user_id: str = Field(
        alias="userId",
        description="User ID creating the estimate"
    )
    clarification_output: Dict[str, Any] = Field(
        alias="clarificationOutput",
        description="ClarificationOutput v3.0.0 data"
    )
    
    class Config:
        populate_by_name = True


class EstimateSummary(BaseModel):
    """Summary view of an estimate for listings."""
    
    id: str = Field(description="Estimate ID")
    user_id: str = Field(alias="userId", description="Owner user ID")
    status: EstimateStatus = Field(description="Current status")
    project_type: Optional[str] = Field(
        default=None,
        alias="projectType",
        description="Type of project"
    )
    total_cost: Optional[float] = Field(
        default=None,
        alias="totalCost",
        description="Total estimated cost"
    )
    created_at: Optional[datetime] = Field(
        default=None,
        alias="createdAt",
        description="Creation timestamp"
    )
    updated_at: Optional[datetime] = Field(
        default=None,
        alias="updatedAt",
        description="Last update timestamp"
    )
    
    class Config:
        populate_by_name = True
        use_enum_values = True




