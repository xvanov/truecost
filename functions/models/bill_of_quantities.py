"""Bill of Quantities (BoQ) Pydantic models for TrueCost.

This module defines the enriched Bill of Quantities data models that the
Scope Agent produces by enriching the CSI scope from ClarificationOutput.
"""

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# ENUMS
# =============================================================================


class CostCodeSource(str, Enum):
    """Source of the cost code assignment."""

    RSMEANS = "rsmeans"
    MASTERFORMAT = "masterformat"
    FUZZY_MATCH = "fuzzy_match"
    MANUAL = "manual"
    INFERRED = "inferred"


class QuantityValidationStatus(str, Enum):
    """Status of quantity validation against CAD data."""

    VALIDATED = "validated"
    ESTIMATED = "estimated"
    NEEDS_VERIFICATION = "needs_verification"
    DISCREPANCY = "discrepancy"


class TradeCategory(str, Enum):
    """Trade category for labor assignment."""

    GENERAL_LABOR = "general_labor"
    CARPENTER = "carpenter"
    ELECTRICIAN = "electrician"
    PLUMBER = "plumber"
    HVAC = "hvac"
    PAINTER = "painter"
    TILE_SETTER = "tile_setter"
    DRYWALL_INSTALLER = "drywall_installer"
    ROOFER = "roofer"
    CONCRETE_FINISHER = "concrete_finisher"
    MASON = "mason"
    WELDER = "welder"
    FLOORING_INSTALLER = "flooring_installer"
    CABINET_INSTALLER = "cabinet_installer"
    COUNTERTOP_INSTALLER = "countertop_installer"
    APPLIANCE_INSTALLER = "appliance_installer"
    DEMOLITION = "demolition"


# =============================================================================
# COST CODE MODELS
# =============================================================================


class CostCode(BaseModel):
    """RSMeans or MasterFormat cost code with metadata."""

    code: str = Field(..., description="Cost code (e.g., '06 41 00', 'RSM-123456')")
    description: str = Field(..., description="Standard description for this code")
    subdivision: Optional[str] = Field(
        None, description="CSI subdivision code (e.g., '06 41 00')"
    )
    source: CostCodeSource = Field(..., description="Source of this cost code")
    confidence: float = Field(
        ..., ge=0, le=1, description="Confidence in cost code match"
    )


class UnitCostReference(BaseModel):
    """Unit cost reference from cost database."""

    material_cost_per_unit: float = Field(
        ..., ge=0, description="Material cost per unit ($)"
    )
    labor_hours_per_unit: float = Field(
        ..., ge=0, description="Labor hours per unit"
    )
    primary_trade: TradeCategory = Field(
        ..., description="Primary trade for this work"
    )
    secondary_trades: List[TradeCategory] = Field(
        default_factory=list, description="Secondary trades if applicable"
    )
    equipment_cost_per_unit: float = Field(
        default=0.0, ge=0, description="Equipment cost per unit ($)"
    )
    cost_code_source: str = Field(
        default="mock", description="Source of cost data (e.g., 'RSMeans 2024')"
    )


# =============================================================================
# ENRICHED LINE ITEM MODEL
# =============================================================================


class EnrichedLineItem(BaseModel):
    """An enriched line item with cost code and validation data.

    This extends the basic CSI line item with:
    - RSMeans/MasterFormat cost code
    - Unit cost reference
    - Quantity validation against CAD
    - Labor hour estimates
    """

    # Original line item fields
    id: str = Field(..., description="Original line item ID")
    item: str = Field(..., description="Item description")
    original_subdivision_code: Optional[str] = Field(
        None, description="Original CSI subdivision code from clarification"
    )
    quantity: float = Field(..., ge=0, description="Quantity")
    unit: str = Field(..., description="Unit of measurement")
    specifications: Optional[str] = Field(None, description="Specifications")
    notes: Optional[str] = Field(None, description="Notes")
    original_confidence: float = Field(
        ..., ge=0, le=1, description="Original extraction confidence"
    )
    source: str = Field(..., description="Original source of this item")

    # Enriched fields
    cost_code: CostCode = Field(..., description="Assigned cost code")
    unit_cost_reference: UnitCostReference = Field(
        ..., description="Unit cost reference from cost database"
    )
    
    # Quantity validation
    quantity_validation: QuantityValidationStatus = Field(
        ..., description="Quantity validation status"
    )
    validated_quantity: Optional[float] = Field(
        None, description="CAD-validated quantity if different from original"
    )
    quantity_discrepancy_notes: Optional[str] = Field(
        None, description="Notes about quantity discrepancy"
    )
    
    # Calculated estimates
    estimated_material_cost: float = Field(
        ..., ge=0, description="Estimated material cost ($)"
    )
    estimated_labor_hours: float = Field(
        ..., ge=0, description="Estimated labor hours"
    )
    estimated_equipment_cost: float = Field(
        default=0.0, ge=0, description="Estimated equipment cost ($)"
    )

    # Searchable product name for price comparison
    searchable_name: Optional[str] = Field(
        None, description="Searchable product name for Google Shopping"
    )
    search_category: Optional[str] = Field(
        None, description="Search category (flooring, cabinets, fixtures, etc.)"
    )
    
    @field_validator("estimated_material_cost", "estimated_labor_hours", mode="before")
    @classmethod
    def round_estimates(cls, v):
        """Round estimates to 2 decimal places."""
        if isinstance(v, (int, float)):
            return round(v, 2)
        return v


# =============================================================================
# ENRICHED DIVISION MODEL
# =============================================================================


class EnrichedDivision(BaseModel):
    """An enriched CSI division with all line items processed."""

    division_code: str = Field(..., description="CSI division code (e.g., '06')")
    division_name: str = Field(..., description="Standard CSI division name")
    status: str = Field(
        ..., description="Division status (included, excluded, etc.)"
    )
    description: str = Field(..., description="Scope description for this division")
    
    # Enriched line items
    line_items: List[EnrichedLineItem] = Field(
        default_factory=list, description="Enriched line items"
    )
    
    # Division subtotals (preliminary estimates)
    subtotal_material_cost: float = Field(
        default=0.0, ge=0, description="Division material cost subtotal ($)"
    )
    subtotal_labor_hours: float = Field(
        default=0.0, ge=0, description="Division labor hours subtotal"
    )
    subtotal_equipment_cost: float = Field(
        default=0.0, ge=0, description="Division equipment cost subtotal ($)"
    )
    
    # Division metadata
    item_count: int = Field(default=0, ge=0, description="Number of line items")
    items_with_cost_codes: int = Field(
        default=0, ge=0, description="Items with assigned cost codes"
    )
    items_validated: int = Field(
        default=0, ge=0, description="Items with validated quantities"
    )
    average_confidence: float = Field(
        default=0.0, ge=0, le=1, description="Average confidence across items"
    )

    def calculate_subtotals(self) -> None:
        """Recalculate subtotals from line items."""
        self.subtotal_material_cost = sum(
            item.estimated_material_cost for item in self.line_items
        )
        self.subtotal_labor_hours = sum(
            item.estimated_labor_hours for item in self.line_items
        )
        self.subtotal_equipment_cost = sum(
            item.estimated_equipment_cost for item in self.line_items
        )
        self.item_count = len(self.line_items)
        self.items_with_cost_codes = sum(
            1 for item in self.line_items if item.cost_code.code
        )
        self.items_validated = sum(
            1 for item in self.line_items
            if item.quantity_validation == QuantityValidationStatus.VALIDATED
        )
        if self.line_items:
            self.average_confidence = sum(
                item.cost_code.confidence for item in self.line_items
            ) / len(self.line_items)


# =============================================================================
# COMPLETENESS TRACKING MODEL
# =============================================================================


class CompletenessCheck(BaseModel):
    """Tracks completeness of the Bill of Quantities."""

    all_items_have_cost_codes: bool = Field(
        ..., description="All items have cost codes assigned"
    )
    all_items_have_quantities: bool = Field(
        ..., description="All items have valid quantities"
    )
    all_required_divisions_present: bool = Field(
        ..., description="All divisions expected for project type are present"
    )
    quantity_validation_complete: bool = Field(
        ..., description="Quantity validation against CAD is complete"
    )
    
    # Warnings and issues
    warnings: List[str] = Field(
        default_factory=list, description="Non-blocking warnings"
    )
    missing_items: List[str] = Field(
        default_factory=list, description="Items that appear to be missing"
    )
    suggested_additions: List[str] = Field(
        default_factory=list, description="Suggested items to add"
    )
    
    # Metrics
    cost_code_coverage: float = Field(
        ..., ge=0, le=1, description="Percentage of items with cost codes"
    )
    quantity_validation_coverage: float = Field(
        ..., ge=0, le=1, description="Percentage of items with validated quantities"
    )


# =============================================================================
# SCOPE ANALYSIS MODEL
# =============================================================================


class ScopeAnalysis(BaseModel):
    """LLM-generated scope analysis."""

    summary: str = Field(
        ..., description="Human-readable scope summary"
    )
    key_observations: List[str] = Field(
        default_factory=list, description="Key observations about the scope"
    )
    material_highlights: List[str] = Field(
        default_factory=list, description="Notable material selections"
    )
    complexity_factors: List[str] = Field(
        default_factory=list, description="Factors affecting project complexity"
    )
    finish_level_assessment: str = Field(
        ..., description="Assessment of finish level match"
    )
    recommendations: List[str] = Field(
        default_factory=list, description="Recommendations for scope"
    )


# =============================================================================
# BILL OF QUANTITIES ROOT MODEL
# =============================================================================


class BillOfQuantities(BaseModel):
    """Complete Bill of Quantities with all enriched divisions.

    This is the primary output of the Scope Agent, containing:
    - All CSI divisions with enriched line items
    - Cost codes assigned to every item
    - Quantity validation against CAD data
    - Preliminary cost estimates by division
    - Completeness tracking
    """

    # Metadata
    estimate_id: str = Field(..., description="Parent estimate ID")
    project_type: str = Field(..., description="Project type from clarification")
    finish_level: str = Field(..., description="Finish level from clarification")
    total_sqft: float = Field(..., ge=0, description="Total square footage")
    
    # Enriched divisions
    divisions: List[EnrichedDivision] = Field(
        default_factory=list, description="All enriched divisions"
    )
    
    # Totals
    total_line_items: int = Field(default=0, ge=0, description="Total line item count")
    total_included_divisions: int = Field(
        default=0, ge=0, description="Count of included divisions"
    )
    total_excluded_divisions: int = Field(
        default=0, ge=0, description="Count of excluded divisions"
    )
    
    # Preliminary cost estimates (before labor rates applied)
    preliminary_material_cost: float = Field(
        default=0.0, ge=0, description="Total preliminary material cost ($)"
    )
    preliminary_labor_hours: float = Field(
        default=0.0, ge=0, description="Total preliminary labor hours"
    )
    preliminary_equipment_cost: float = Field(
        default=0.0, ge=0, description="Total preliminary equipment cost ($)"
    )
    
    # Completeness and validation
    completeness: CompletenessCheck = Field(
        ..., description="Completeness tracking"
    )
    
    # Analysis
    analysis: ScopeAnalysis = Field(..., description="Scope analysis")
    
    # Confidence
    confidence: float = Field(
        ..., ge=0, le=1, description="Overall confidence in BoQ"
    )
    
    def calculate_totals(self) -> None:
        """Recalculate all totals from divisions."""
        self.total_line_items = sum(div.item_count for div in self.divisions)
        self.total_included_divisions = sum(
            1 for div in self.divisions if div.status == "included"
        )
        self.total_excluded_divisions = sum(
            1 for div in self.divisions if div.status == "excluded"
        )
        self.preliminary_material_cost = sum(
            div.subtotal_material_cost for div in self.divisions
        )
        self.preliminary_labor_hours = sum(
            div.subtotal_labor_hours for div in self.divisions
        )
        self.preliminary_equipment_cost = sum(
            div.subtotal_equipment_cost for div in self.divisions
        )

    def to_agent_output(self) -> Dict[str, Any]:
        """Convert to dict format for agent output storage."""
        return {
            "estimateId": self.estimate_id,
            "projectType": self.project_type,
            "finishLevel": self.finish_level,
            "totalSqft": self.total_sqft,
            "divisions": [
                {
                    "divisionCode": div.division_code,
                    "divisionName": div.division_name,
                    "status": div.status,
                    "description": div.description,
                    "lineItems": [
                        {
                            "id": item.id,
                            "item": item.item,
                            "quantity": item.quantity,
                            "unit": item.unit,
                            "costCode": item.cost_code.code,
                            "costCodeDescription": item.cost_code.description,
                            "costCodeConfidence": item.cost_code.confidence,
                            "materialCostPerUnit": item.unit_cost_reference.material_cost_per_unit,
                            "laborHoursPerUnit": item.unit_cost_reference.labor_hours_per_unit,
                            "primaryTrade": item.unit_cost_reference.primary_trade.value,
                            "quantityValidation": item.quantity_validation.value,
                            "estimatedMaterialCost": item.estimated_material_cost,
                            "estimatedLaborHours": item.estimated_labor_hours,
                            "estimatedEquipmentCost": item.estimated_equipment_cost,
                        }
                        for item in div.line_items
                    ],
                    "subtotalMaterialCost": div.subtotal_material_cost,
                    "subtotalLaborHours": div.subtotal_labor_hours,
                    "subtotalEquipmentCost": div.subtotal_equipment_cost,
                    "itemCount": div.item_count,
                    "averageConfidence": div.average_confidence,
                }
                for div in self.divisions
            ],
            "totalLineItems": self.total_line_items,
            "totalIncludedDivisions": self.total_included_divisions,
            "totalExcludedDivisions": self.total_excluded_divisions,
            "preliminaryMaterialCost": self.preliminary_material_cost,
            "preliminaryLaborHours": self.preliminary_labor_hours,
            "preliminaryEquipmentCost": self.preliminary_equipment_cost,
            "completeness": {
                "allItemsHaveCostCodes": self.completeness.all_items_have_cost_codes,
                "allItemsHaveQuantities": self.completeness.all_items_have_quantities,
                "allRequiredDivisionsPresent": self.completeness.all_required_divisions_present,
                "quantityValidationComplete": self.completeness.quantity_validation_complete,
                "costCodeCoverage": self.completeness.cost_code_coverage,
                "quantityValidationCoverage": self.completeness.quantity_validation_coverage,
                "warnings": self.completeness.warnings,
                "missingItems": self.completeness.missing_items,
                "suggestedAdditions": self.completeness.suggested_additions,
            },
            "analysis": {
                "summary": self.analysis.summary,
                "keyObservations": self.analysis.key_observations,
                "materialHighlights": self.analysis.material_highlights,
                "complexityFactors": self.analysis.complexity_factors,
                "finishLevelAssessment": self.analysis.finish_level_assessment,
                "recommendations": self.analysis.recommendations,
            },
            "confidence": self.confidence,
            "summary": self.analysis.summary,
        }


# =============================================================================
# CSI DIVISION MAPPING
# =============================================================================

# Standard CSI MasterFormat division names
CSI_DIVISION_NAMES = {
    "01": "General Requirements",
    "02": "Existing Conditions",
    "03": "Concrete",
    "04": "Masonry",
    "05": "Metals",
    "06": "Wood, Plastics, and Composites",
    "07": "Thermal and Moisture Protection",
    "08": "Openings",
    "09": "Finishes",
    "10": "Specialties",
    "11": "Equipment",
    "12": "Furnishings",
    "13": "Special Construction",
    "14": "Conveying Equipment",
    "21": "Fire Suppression",
    "22": "Plumbing",
    "23": "Heating, Ventilating, and Air Conditioning (HVAC)",
    "25": "Integrated Automation",
    "26": "Electrical",
    "27": "Communications",
    "28": "Electronic Safety and Security",
    "31": "Earthwork",
    "32": "Exterior Improvements",
    "33": "Utilities",
}


# Division to trade mapping for labor assignment
DIVISION_TRADE_MAPPING: Dict[str, TradeCategory] = {
    "01": TradeCategory.GENERAL_LABOR,
    "02": TradeCategory.DEMOLITION,
    "03": TradeCategory.CONCRETE_FINISHER,
    "04": TradeCategory.MASON,
    "05": TradeCategory.WELDER,
    "06": TradeCategory.CARPENTER,
    "07": TradeCategory.ROOFER,
    "08": TradeCategory.CARPENTER,
    "09": TradeCategory.PAINTER,
    "10": TradeCategory.GENERAL_LABOR,
    "11": TradeCategory.APPLIANCE_INSTALLER,
    "12": TradeCategory.CABINET_INSTALLER,
    "13": TradeCategory.GENERAL_LABOR,
    "14": TradeCategory.GENERAL_LABOR,
    "21": TradeCategory.PLUMBER,
    "22": TradeCategory.PLUMBER,
    "23": TradeCategory.HVAC,
    "25": TradeCategory.ELECTRICIAN,
    "26": TradeCategory.ELECTRICIAN,
    "27": TradeCategory.ELECTRICIAN,
    "28": TradeCategory.ELECTRICIAN,
    "31": TradeCategory.GENERAL_LABOR,
    "32": TradeCategory.GENERAL_LABOR,
    "33": TradeCategory.PLUMBER,
}


def get_division_name(code: str) -> str:
    """Get CSI division name from code."""
    return CSI_DIVISION_NAMES.get(code, f"Division {code}")


def get_primary_trade(division_code: str) -> TradeCategory:
    """Get primary trade for a division."""
    return DIVISION_TRADE_MAPPING.get(division_code, TradeCategory.GENERAL_LABOR)



