"""Cost Estimate Pydantic models for TrueCost.

This module defines the data models for cost estimation with
three-tier pricing (P50/P80/P90) for Monte Carlo compatibility.
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from models.bill_of_quantities import TradeCategory


# =============================================================================
# ENUMS
# =============================================================================


class CostConfidenceLevel(str, Enum):
    """Confidence level in cost data."""

    HIGH = "high"       # Direct cost code match with recent data
    MEDIUM = "medium"   # Fuzzy match or regional estimates
    LOW = "low"         # Inferred or outdated data
    UNKNOWN = "unknown"


class AdjustmentType(str, Enum):
    """Type of cost adjustment."""

    LOCATION_FACTOR = "location_factor"
    OVERHEAD = "overhead"
    PROFIT = "profit"
    CONTINGENCY = "contingency"
    TAX = "tax"
    PERMIT = "permit"


# =============================================================================
# COST RANGE MODEL (P50/P80/P90)
# =============================================================================


class CostRange(BaseModel):
    """Three-tier cost estimate for Monte Carlo compatibility.
    
    Uses variance multipliers to generate P50/P80/P90 estimates:
    - P50 (low): Base cost (median)
    - P80 (medium): Base × 1.15 (conservative)
    - P90 (high): Base × 1.25 (pessimistic)
    
    These will be replaced by actual Monte Carlo simulation
    results when Dev 4's service is integrated.
    """

    low: float = Field(..., ge=0, description="P50 estimate - median (50th percentile)")
    medium: float = Field(..., ge=0, description="P80 estimate - conservative (80th percentile)")
    high: float = Field(..., ge=0, description="P90 estimate - pessimistic (90th percentile)")

    @model_validator(mode="after")
    def validate_order(self) -> "CostRange":
        """Ensure low <= medium <= high."""
        if not (self.low <= self.medium <= self.high):
            raise ValueError(
                f"Cost range must be low <= medium <= high, got: "
                f"low={self.low}, medium={self.medium}, high={self.high}"
            )
        return self

    @classmethod
    def from_base_cost(
        cls,
        base_cost: float,
        p80_multiplier: float = 1.15,
        p90_multiplier: float = 1.25
    ) -> "CostRange":
        """Create a cost range from a base cost using variance multipliers.
        
        Args:
            base_cost: The base (P50) cost.
            p80_multiplier: Multiplier for P80 (default 1.15 = 15% higher).
            p90_multiplier: Multiplier for P90 (default 1.25 = 25% higher).
            
        Returns:
            CostRange with P50/P80/P90 values.
        """
        return cls(
            low=round(base_cost, 2),
            medium=round(base_cost * p80_multiplier, 2),
            high=round(base_cost * p90_multiplier, 2)
        )

    @classmethod
    def zero(cls) -> "CostRange":
        """Create a zero cost range."""
        return cls(low=0.0, medium=0.0, high=0.0)

    def __add__(self, other: "CostRange") -> "CostRange":
        """Add two cost ranges."""
        return CostRange(
            low=round(self.low + other.low, 2),
            medium=round(self.medium + other.medium, 2),
            high=round(self.high + other.high, 2)
        )

    def __mul__(self, factor: float) -> "CostRange":
        """Multiply cost range by a factor."""
        return CostRange(
            low=round(self.low * factor, 2),
            medium=round(self.medium * factor, 2),
            high=round(self.high * factor, 2)
        )

    def to_dict(self) -> Dict[str, float]:
        """Convert to dictionary for JSON serialization."""
        return {
            "low": self.low,
            "medium": self.medium,
            "high": self.high
        }


# =============================================================================
# UNIT COST WITH RANGE
# =============================================================================


class UnitCostWithRange(BaseModel):
    """Unit cost data with P50/P80/P90 ranges.
    
    Used for looking up costs from the cost database.
    """

    cost_code: str = Field(..., description="Cost code (e.g., '09 30 00')")
    description: str = Field(..., description="Item description")
    unit: str = Field(..., description="Unit of measurement")
    material_cost_per_unit: CostRange = Field(
        ..., description="Material cost per unit (P50/P80/P90)"
    )
    labor_hours_per_unit: float = Field(
        ..., ge=0, description="Labor hours per unit"
    )
    equipment_cost_per_unit: CostRange = Field(
        default_factory=CostRange.zero,
        description="Equipment cost per unit (P50/P80/P90)"
    )
    primary_trade: TradeCategory = Field(
        ..., description="Primary trade for this work"
    )
    confidence: CostConfidenceLevel = Field(
        default=CostConfidenceLevel.MEDIUM,
        description="Confidence level in cost data"
    )


# =============================================================================
# LINE ITEM COST MODEL
# =============================================================================


class LineItemCost(BaseModel):
    """Cost breakdown for a single line item.
    
    Contains material, labor, and equipment costs with P50/P80/P90 ranges.
    """

    # Identification
    line_item_id: str = Field(..., description="Reference to BoQ line item ID")
    cost_code: str = Field(..., description="Cost code")
    description: str = Field(..., description="Item description")
    
    # Quantity
    quantity: float = Field(..., ge=0, description="Quantity")
    unit: str = Field(..., description="Unit of measurement")
    
    # Unit costs
    unit_material_cost: CostRange = Field(
        ..., description="Material cost per unit (P50/P80/P90)"
    )
    unit_labor_hours: float = Field(
        ..., ge=0, description="Labor hours per unit"
    )
    unit_equipment_cost: CostRange = Field(
        default_factory=CostRange.zero,
        description="Equipment cost per unit (P50/P80/P90)"
    )
    
    # Labor details
    primary_trade: TradeCategory = Field(
        ..., description="Primary trade for labor calculation"
    )
    labor_rate: CostRange = Field(
        ..., description="Labor rate per hour (P50/P80/P90)"
    )
    
    # Calculated costs
    material_cost: CostRange = Field(
        ..., description="Total material cost = quantity × unit_material_cost"
    )
    labor_hours: float = Field(
        ..., ge=0, description="Total labor hours = quantity × unit_labor_hours"
    )
    labor_cost: CostRange = Field(
        ..., description="Total labor cost = labor_hours × labor_rate"
    )
    equipment_cost: CostRange = Field(
        default_factory=CostRange.zero,
        description="Total equipment cost"
    )
    
    # Line item total
    total_cost: CostRange = Field(
        ..., description="Total cost = material + labor + equipment"
    )
    
    # Metadata
    confidence: CostConfidenceLevel = Field(
        default=CostConfidenceLevel.MEDIUM,
        description="Confidence in cost calculation"
    )
    notes: Optional[str] = Field(None, description="Cost calculation notes")

    @classmethod
    def calculate(
        cls,
        line_item_id: str,
        cost_code: str,
        description: str,
        quantity: float,
        unit: str,
        unit_material_cost: CostRange,
        unit_labor_hours: float,
        labor_rate: CostRange,
        primary_trade: TradeCategory,
        unit_equipment_cost: Optional[CostRange] = None,
        confidence: CostConfidenceLevel = CostConfidenceLevel.MEDIUM,
        notes: Optional[str] = None
    ) -> "LineItemCost":
        """Calculate line item cost from unit costs and quantity.
        
        Args:
            line_item_id: Reference to BoQ line item.
            cost_code: Cost code.
            description: Item description.
            quantity: Quantity of item.
            unit: Unit of measurement.
            unit_material_cost: Material cost per unit range.
            unit_labor_hours: Labor hours per unit.
            labor_rate: Labor rate per hour range.
            primary_trade: Primary trade category.
            unit_equipment_cost: Equipment cost per unit range (optional).
            confidence: Confidence level in cost data.
            notes: Additional notes.
            
        Returns:
            Calculated LineItemCost.
        """
        unit_equipment = unit_equipment_cost or CostRange.zero()
        
        # Calculate totals
        material_cost = unit_material_cost * quantity
        labor_hours = round(unit_labor_hours * quantity, 2)
        labor_cost = labor_rate * labor_hours
        equipment_cost = unit_equipment * quantity
        
        # Sum all costs
        total_cost = material_cost + labor_cost + equipment_cost
        
        return cls(
            line_item_id=line_item_id,
            cost_code=cost_code,
            description=description,
            quantity=quantity,
            unit=unit,
            unit_material_cost=unit_material_cost,
            unit_labor_hours=unit_labor_hours,
            unit_equipment_cost=unit_equipment,
            primary_trade=primary_trade,
            labor_rate=labor_rate,
            material_cost=material_cost,
            labor_hours=labor_hours,
            labor_cost=labor_cost,
            equipment_cost=equipment_cost,
            total_cost=total_cost,
            confidence=confidence,
            notes=notes
        )


# =============================================================================
# DIVISION COST MODEL
# =============================================================================


class DivisionCost(BaseModel):
    """Cost breakdown for a CSI division."""

    division_code: str = Field(..., description="CSI division code (e.g., '06')")
    division_name: str = Field(..., description="Division name")
    
    # Line items
    line_items: List[LineItemCost] = Field(
        default_factory=list, description="Costed line items"
    )
    
    # Division subtotals
    material_subtotal: CostRange = Field(
        default_factory=CostRange.zero,
        description="Division material subtotal"
    )
    labor_hours_subtotal: float = Field(
        default=0.0, ge=0, description="Division labor hours subtotal"
    )
    labor_subtotal: CostRange = Field(
        default_factory=CostRange.zero,
        description="Division labor cost subtotal"
    )
    equipment_subtotal: CostRange = Field(
        default_factory=CostRange.zero,
        description="Division equipment subtotal"
    )
    division_total: CostRange = Field(
        default_factory=CostRange.zero,
        description="Division total (material + labor + equipment)"
    )
    
    # Metadata
    item_count: int = Field(default=0, ge=0, description="Number of line items")
    
    def calculate_subtotals(self) -> None:
        """Recalculate division subtotals from line items."""
        self.material_subtotal = CostRange.zero()
        self.labor_subtotal = CostRange.zero()
        self.equipment_subtotal = CostRange.zero()
        self.labor_hours_subtotal = 0.0
        
        for item in self.line_items:
            self.material_subtotal = self.material_subtotal + item.material_cost
            self.labor_subtotal = self.labor_subtotal + item.labor_cost
            self.equipment_subtotal = self.equipment_subtotal + item.equipment_cost
            self.labor_hours_subtotal += item.labor_hours
        
        self.division_total = (
            self.material_subtotal + 
            self.labor_subtotal + 
            self.equipment_subtotal
        )
        self.item_count = len(self.line_items)


# =============================================================================
# COST SUBTOTALS MODEL
# =============================================================================


class CostSubtotals(BaseModel):
    """Cost subtotals by category with P50/P80/P90 ranges."""

    materials: CostRange = Field(..., description="Total material costs")
    labor: CostRange = Field(..., description="Total labor costs")
    equipment: CostRange = Field(
        default_factory=CostRange.zero,
        description="Total equipment costs"
    )
    subtotal: CostRange = Field(..., description="Sum of materials + labor + equipment")
    
    # Labor hours (not a cost, but useful for tracking)
    total_labor_hours: float = Field(..., ge=0, description="Total labor hours")


# =============================================================================
# COST ADJUSTMENT MODEL
# =============================================================================


class CostAdjustment(BaseModel):
    """A single cost adjustment with range."""

    adjustment_type: AdjustmentType = Field(..., description="Type of adjustment")
    description: str = Field(..., description="Human-readable description")
    
    # Either a factor or a fixed amount
    factor: Optional[float] = Field(
        None, ge=0, description="Multiplier factor (e.g., 1.15 for location)"
    )
    percentage: Optional[float] = Field(
        None, ge=0, le=1, description="Percentage (e.g., 0.10 for 10% overhead)"
    )
    fixed_amount: Optional[CostRange] = Field(
        None, description="Fixed amount (e.g., permit costs)"
    )
    
    # Calculated amount
    calculated_amount: CostRange = Field(
        ..., description="Calculated adjustment amount"
    )


class CostAdjustments(BaseModel):
    """All cost adjustments applied to the estimate."""

    # Location factor
    location_factor: float = Field(
        ..., ge=0.7, le=1.6, description="Location cost multiplier"
    )
    location_adjusted_subtotal: CostRange = Field(
        ..., description="Subtotal after location factor applied"
    )
    
    # Standard markups
    overhead_percentage: float = Field(
        default=0.10, ge=0, le=0.30, description="Overhead percentage (default 10%)"
    )
    overhead_amount: CostRange = Field(
        ..., description="Overhead amount"
    )
    
    profit_percentage: float = Field(
        default=0.10, ge=0, le=0.30, description="Profit percentage (default 10%)"
    )
    profit_amount: CostRange = Field(
        ..., description="Profit amount"
    )
    
    # Optional adjustments
    contingency_percentage: float = Field(
        default=0.05, ge=0, le=0.20, description="Contingency percentage (default 5%)"
    )
    contingency_amount: CostRange = Field(
        default_factory=CostRange.zero,
        description="Contingency amount"
    )
    
    permit_costs: CostRange = Field(
        default_factory=CostRange.zero,
        description="Total permit costs"
    )
    
    tax_percentage: float = Field(
        default=0.0, ge=0, le=0.15, description="Sales tax percentage"
    )
    tax_amount: CostRange = Field(
        default_factory=CostRange.zero,
        description="Sales tax amount (on materials)"
    )
    
    # Total adjustments
    total_adjustments: CostRange = Field(
        ..., description="Sum of all adjustment amounts"
    )


# =============================================================================
# COST ESTIMATE SUMMARY
# =============================================================================


class CostSummary(BaseModel):
    """Human-readable cost summary."""

    headline: str = Field(
        ..., description="One-line summary (e.g., 'Kitchen remodel: $28,200 - $36,240')"
    )
    range_explanation: str = Field(
        ..., description="Explanation of the cost range"
    )
    key_cost_drivers: List[str] = Field(
        default_factory=list, description="Top cost drivers"
    )
    cost_saving_opportunities: List[str] = Field(
        default_factory=list, description="Potential cost savings"
    )
    assumptions: List[str] = Field(
        default_factory=list, description="Key assumptions made"
    )
    disclaimers: List[str] = Field(
        default_factory=list, description="Important disclaimers"
    )


# =============================================================================
# MAIN COST ESTIMATE MODEL
# =============================================================================


class CostEstimate(BaseModel):
    """Complete cost estimate with P50/P80/P90 ranges.
    
    This is the primary output model for the Cost Agent, containing:
    - Detailed line item costs by division
    - Subtotals by category (material, labor, equipment)
    - All adjustments (location, overhead, profit, etc.)
    - Grand total with P50/P80/P90 ranges
    """

    # Metadata
    estimate_id: str = Field(..., description="Parent estimate ID")
    boq_line_item_count: int = Field(..., ge=0, description="Number of BoQ items processed")
    
    # Detailed costs by division
    divisions: List[DivisionCost] = Field(
        default_factory=list, description="Costs by CSI division"
    )
    
    # Subtotals
    subtotals: CostSubtotals = Field(..., description="Category subtotals")
    
    # Adjustments
    adjustments: CostAdjustments = Field(..., description="All cost adjustments")
    
    # Grand total with P50/P80/P90
    total: CostRange = Field(
        ..., description="Grand total estimate (P50/P80/P90)"
    )
    
    # Confidence and summary
    confidence: float = Field(
        ..., ge=0, le=1, description="Overall confidence in estimate"
    )
    summary: CostSummary = Field(..., description="Human-readable summary")
    
    # Analysis metadata
    items_with_exact_costs: int = Field(
        default=0, ge=0, description="Items with exact cost code matches"
    )
    items_with_estimated_costs: int = Field(
        default=0, ge=0, description="Items with estimated costs"
    )
    average_cost_confidence: CostConfidenceLevel = Field(
        default=CostConfidenceLevel.MEDIUM,
        description="Average confidence level"
    )

    def to_agent_output(self) -> Dict[str, Any]:
        """Convert to dict format for agent output storage."""
        return {
            "estimateId": self.estimate_id,
            "boqLineItemCount": self.boq_line_item_count,
            "divisions": [
                {
                    "divisionCode": div.division_code,
                    "divisionName": div.division_name,
                    "lineItems": [
                        {
                            "lineItemId": item.line_item_id,
                            "costCode": item.cost_code,
                            "description": item.description,
                            "quantity": item.quantity,
                            "unit": item.unit,
                            "primaryTrade": item.primary_trade.value,
                            "unitMaterialCost": item.unit_material_cost.to_dict(),
                            "unitLaborHours": item.unit_labor_hours,
                            "laborRate": item.labor_rate.to_dict(),
                            "materialCost": item.material_cost.to_dict(),
                            "laborHours": item.labor_hours,
                            "laborCost": item.labor_cost.to_dict(),
                            "equipmentCost": item.equipment_cost.to_dict(),
                            "totalCost": item.total_cost.to_dict(),
                            "confidence": item.confidence.value,
                        }
                        for item in div.line_items
                    ],
                    "materialSubtotal": div.material_subtotal.to_dict(),
                    "laborHoursSubtotal": div.labor_hours_subtotal,
                    "laborSubtotal": div.labor_subtotal.to_dict(),
                    "equipmentSubtotal": div.equipment_subtotal.to_dict(),
                    "divisionTotal": div.division_total.to_dict(),
                    "itemCount": div.item_count,
                }
                for div in self.divisions
            ],
            "subtotals": {
                "materials": self.subtotals.materials.to_dict(),
                "labor": self.subtotals.labor.to_dict(),
                "equipment": self.subtotals.equipment.to_dict(),
                "subtotal": self.subtotals.subtotal.to_dict(),
                "totalLaborHours": self.subtotals.total_labor_hours,
            },
            "adjustments": {
                "locationFactor": self.adjustments.location_factor,
                "locationAdjustedSubtotal": self.adjustments.location_adjusted_subtotal.to_dict(),
                "overheadPercentage": self.adjustments.overhead_percentage,
                "overhead": self.adjustments.overhead_amount.to_dict(),
                "profitPercentage": self.adjustments.profit_percentage,
                "profit": self.adjustments.profit_amount.to_dict(),
                "contingencyPercentage": self.adjustments.contingency_percentage,
                "contingency": self.adjustments.contingency_amount.to_dict(),
                "permitCosts": self.adjustments.permit_costs.to_dict(),
                "taxPercentage": self.adjustments.tax_percentage,
                "tax": self.adjustments.tax_amount.to_dict(),
                "totalAdjustments": self.adjustments.total_adjustments.to_dict(),
            },
            "total": self.total.to_dict(),
            "confidence": self.confidence,
            "summary": {
                "headline": self.summary.headline,
                "rangeExplanation": self.summary.range_explanation,
                "keyCostDrivers": self.summary.key_cost_drivers,
                "costSavingOpportunities": self.summary.cost_saving_opportunities,
                "assumptions": self.summary.assumptions,
                "disclaimers": self.summary.disclaimers,
            },
            "itemsWithExactCosts": self.items_with_exact_costs,
            "itemsWithEstimatedCosts": self.items_with_estimated_costs,
            "averageCostConfidence": self.average_cost_confidence.value,
        }




