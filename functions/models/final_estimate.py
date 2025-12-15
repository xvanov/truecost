"""Final Estimate Pydantic models for TrueCost.

This module defines the data models for the final estimate output
which synthesizes all agent outputs into a comprehensive report.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =============================================================================
# ENUMS
# =============================================================================


class EstimateConfidence(str, Enum):
    """Overall estimate confidence level."""
    
    HIGH = "high"           # 90%+ confidence in all components
    MEDIUM_HIGH = "medium_high"  # 80-90% confidence
    MEDIUM = "medium"       # 70-80% confidence
    MEDIUM_LOW = "medium_low"  # 60-70% confidence
    LOW = "low"             # <60% confidence


class ProjectComplexity(str, Enum):
    """Project complexity assessment."""
    
    SIMPLE = "simple"       # Standard renovation, few unknowns
    MODERATE = "moderate"   # Some custom work, moderate complexity
    COMPLEX = "complex"     # Custom design, multiple trades, high coordination
    VERY_COMPLEX = "very_complex"  # Major structural, permits, high risk


# =============================================================================
# COST BREAKDOWN SUMMARY
# =============================================================================


class CostBreakdownSummary(BaseModel):
    """Summary of cost breakdown by category."""
    
    # Direct costs
    materials: float = Field(..., ge=0, description="Total material costs")
    labor: float = Field(..., ge=0, description="Total labor costs")
    equipment: float = Field(default=0.0, ge=0, description="Total equipment costs")
    direct_costs_subtotal: float = Field(..., ge=0, description="Sum of direct costs")
    
    # Markups
    overhead: float = Field(default=0.0, ge=0, description="Overhead amount")
    profit: float = Field(default=0.0, ge=0, description="Profit amount")
    
    # Contingency
    contingency: float = Field(default=0.0, ge=0, description="Contingency amount")
    contingency_percentage: float = Field(
        default=0.0, ge=0, le=50, description="Contingency percentage"
    )
    
    # Permits and fees
    permits: float = Field(default=0.0, ge=0, description="Permit costs")
    taxes: float = Field(default=0.0, ge=0, description="Sales tax")
    
    # Totals
    total_before_contingency: float = Field(
        ..., ge=0, description="Total before contingency"
    )
    total_with_contingency: float = Field(
        ..., ge=0, description="Total including contingency"
    )


# =============================================================================
# CONFIDENCE RANGE
# =============================================================================


class ConfidenceRange(BaseModel):
    """Cost confidence range based on Monte Carlo results."""
    
    p50: float = Field(..., ge=0, description="50th percentile (median)")
    p80: float = Field(..., ge=0, description="80th percentile (conservative)")
    p90: float = Field(..., ge=0, description="90th percentile (pessimistic)")
    
    # For display
    likely_range_low: float = Field(..., ge=0, description="Likely range low end")
    likely_range_high: float = Field(..., ge=0, description="Likely range high end")
    
    # Spread metrics
    range_spread_percentage: float = Field(
        default=0.0, ge=0, description="(P90-P50)/P50 as percentage"
    )


# =============================================================================
# TIMELINE SUMMARY FOR FINAL ESTIMATE
# =============================================================================


class TimelineSummaryForEstimate(BaseModel):
    """Timeline summary included in final estimate."""
    
    total_duration_days: int = Field(..., ge=0, description="Working days")
    total_weeks: float = Field(..., ge=0, description="Duration in weeks")
    
    start_date: str = Field(..., description="Project start date")
    end_date: str = Field(..., description="Project end date")
    
    # Key milestones
    key_milestones: List[Dict[str, str]] = Field(
        default_factory=list,
        description="List of {name, date} for key milestones"
    )
    
    # Duration confidence
    duration_optimistic: int = Field(default=0, ge=0, description="Best case days")
    duration_pessimistic: int = Field(default=0, ge=0, description="Worst case days")


# =============================================================================
# RISK SUMMARY FOR FINAL ESTIMATE
# =============================================================================


class RiskSummaryForEstimate(BaseModel):
    """Risk summary included in final estimate."""
    
    risk_level: str = Field(..., description="Overall risk level")
    top_risks: List[str] = Field(
        default_factory=list, description="Top 3-5 risk names"
    )
    contingency_rationale: str = Field(
        ..., description="Why this contingency was recommended"
    )
    mitigation_strategies: List[str] = Field(
        default_factory=list,
        description="Key risk mitigation strategies"
    )


# =============================================================================
# EXECUTIVE SUMMARY
# =============================================================================


class ExecutiveSummary(BaseModel):
    """Executive summary for the final estimate.
    
    This is the high-level overview shown at the top of the estimate.
    """
    
    # Project info
    project_type: str = Field(..., description="Type of project")
    project_location: str = Field(..., description="Project location")
    project_size_sqft: float = Field(default=0.0, ge=0, description="Project size")
    finish_level: str = Field(default="", description="Finish level")
    
    # Cost summary
    total_cost: float = Field(..., ge=0, description="Total cost with contingency")
    base_cost: float = Field(..., ge=0, description="Base cost before contingency")
    contingency_amount: float = Field(default=0.0, ge=0, description="Contingency $")
    contingency_percentage: float = Field(
        default=0.0, ge=0, le=50, description="Contingency %"
    )
    
    # Cost per sqft
    cost_per_sqft: float = Field(default=0.0, ge=0, description="$/sqft")
    
    # Confidence range
    confidence_range: ConfidenceRange = Field(
        ..., description="Cost confidence range"
    )
    
    # Timeline
    duration_days: int = Field(..., ge=0, description="Project duration in days")
    duration_weeks: float = Field(..., ge=0, description="Project duration in weeks")
    start_date: str = Field(..., description="Projected start date")
    end_date: str = Field(..., description="Projected end date")
    
    # Confidence level
    estimate_confidence: EstimateConfidence = Field(
        default=EstimateConfidence.MEDIUM,
        description="Overall confidence in estimate"
    )
    project_complexity: ProjectComplexity = Field(
        default=ProjectComplexity.MODERATE,
        description="Project complexity assessment"
    )


# =============================================================================
# RECOMMENDATIONS
# =============================================================================


class Recommendation(BaseModel):
    """Individual recommendation for the project."""
    
    category: str = Field(..., description="Category (cost/schedule/risk)")
    title: str = Field(..., description="Short recommendation title")
    description: str = Field(..., description="Detailed recommendation")
    priority: str = Field(default="medium", description="Priority level")
    potential_savings: Optional[float] = Field(
        None, description="Potential cost savings if applicable"
    )


# =============================================================================
# FINAL ESTIMATE OUTPUT MODEL
# =============================================================================


class FinalEstimate(BaseModel):
    """Complete final estimate output from Final Agent.
    
    This is the comprehensive synthesis of all previous agent outputs,
    formatted as a professional estimate report.
    """
    
    # Metadata
    estimate_id: str = Field(..., description="Estimate document ID")
    generated_at: str = Field(
        default_factory=lambda: datetime.now().isoformat(),
        description="Generation timestamp"
    )
    version: str = Field(default="1.0", description="Estimate version")
    
    # Executive summary
    executive_summary: ExecutiveSummary = Field(
        ..., description="Executive summary"
    )
    
    # Detailed breakdowns
    cost_breakdown: CostBreakdownSummary = Field(
        ..., description="Detailed cost breakdown"
    )
    timeline_summary: TimelineSummaryForEstimate = Field(
        ..., description="Timeline summary"
    )
    risk_summary: RiskSummaryForEstimate = Field(
        ..., description="Risk summary"
    )
    
    # Recommendations
    recommendations: List[Recommendation] = Field(
        default_factory=list, description="Project recommendations"
    )
    
    # Assumptions and disclaimers
    key_assumptions: List[str] = Field(
        default_factory=list, description="Key assumptions made"
    )
    exclusions: List[str] = Field(
        default_factory=list, description="Items not included in estimate"
    )
    disclaimers: List[str] = Field(
        default_factory=list, description="Legal/professional disclaimers"
    )
    
    # Data quality metrics
    data_completeness: float = Field(
        default=0.0, ge=0, le=1, description="How complete the input data was"
    )
    cost_data_quality: str = Field(
        default="medium", description="Quality of cost data (low/medium/high)"
    )
    
    # Summary headline
    summary_headline: str = Field(
        ..., description="One-line summary for display"
    )
    
    def to_agent_output(self) -> Dict[str, Any]:
        """Convert to dict format for agent output storage."""
        return {
            "estimateId": self.estimate_id,
            "generatedAt": self.generated_at,
            "version": self.version,
            
            "executiveSummary": {
                "projectType": self.executive_summary.project_type,
                "location": self.executive_summary.project_location,
                "sizeSqft": self.executive_summary.project_size_sqft,
                "finishLevel": self.executive_summary.finish_level,
                "totalCost": self.executive_summary.total_cost,
                "baseCost": self.executive_summary.base_cost,
                "contingency": self.executive_summary.contingency_amount,
                "contingencyPercent": self.executive_summary.contingency_percentage,
                "costPerSqft": self.executive_summary.cost_per_sqft,
                "confidenceRange": {
                    "p50": self.executive_summary.confidence_range.p50,
                    "p80": self.executive_summary.confidence_range.p80,
                    "p90": self.executive_summary.confidence_range.p90,
                },
                "duration": self.executive_summary.duration_days,
                "durationWeeks": self.executive_summary.duration_weeks,
                "startDate": self.executive_summary.start_date,
                "endDate": self.executive_summary.end_date,
                "confidence": self.executive_summary.estimate_confidence.value,
                "complexity": self.executive_summary.project_complexity.value,
            },
            
            "costBreakdown": {
                "materials": self.cost_breakdown.materials,
                "labor": self.cost_breakdown.labor,
                "equipment": self.cost_breakdown.equipment,
                "directCostsSubtotal": self.cost_breakdown.direct_costs_subtotal,
                "overhead": self.cost_breakdown.overhead,
                "profit": self.cost_breakdown.profit,
                "contingency": self.cost_breakdown.contingency,
                "contingencyPercentage": self.cost_breakdown.contingency_percentage,
                "permits": self.cost_breakdown.permits,
                "taxes": self.cost_breakdown.taxes,
                "totalBeforeContingency": self.cost_breakdown.total_before_contingency,
                "totalWithContingency": self.cost_breakdown.total_with_contingency,
            },
            
            "timeline": {
                "totalDays": self.timeline_summary.total_duration_days,
                "totalWeeks": self.timeline_summary.total_weeks,
                "startDate": self.timeline_summary.start_date,
                "endDate": self.timeline_summary.end_date,
                "milestones": self.timeline_summary.key_milestones,
                "durationRange": {
                    "optimistic": self.timeline_summary.duration_optimistic,
                    "pessimistic": self.timeline_summary.duration_pessimistic,
                },
            },
            
            "riskSummary": {
                "riskLevel": self.risk_summary.risk_level,
                "topRisks": self.risk_summary.top_risks,
                "contingencyRationale": self.risk_summary.contingency_rationale,
                "mitigationStrategies": self.risk_summary.mitigation_strategies,
            },
            
            "recommendations": [
                {
                    "category": r.category,
                    "title": r.title,
                    "description": r.description,
                    "priority": r.priority,
                    "potentialSavings": r.potential_savings,
                }
                for r in self.recommendations
            ],
            
            "assumptions": self.key_assumptions,
            "exclusions": self.exclusions,
            "disclaimers": self.disclaimers,
            
            "dataQuality": {
                "completeness": self.data_completeness,
                "costDataQuality": self.cost_data_quality,
            },
            
            "summary": self.summary_headline,
        }




