"""Location Factors Pydantic models for TrueCost.

This module defines the data models for location-based cost factors
used by the Location Agent in the Deep Pipeline.
"""

from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# ENUMS
# =============================================================================


class Region(str, Enum):
    """Geographic regions for cost adjustment."""

    NORTHEAST = "Northeast"
    SOUTHEAST = "Southeast"
    MIDWEST = "Midwest"
    SOUTH = "South"
    SOUTHWEST = "Southwest"
    MOUNTAIN = "Mountain"
    PACIFIC = "Pacific"
    NATIONAL = "National"


class UnionStatus(str, Enum):
    """Union market status."""

    UNION = "union"
    NON_UNION = "non_union"
    MIXED = "mixed"


class WinterImpact(str, Enum):
    """Winter weather impact level."""

    NONE = "none"
    MINIMAL = "minimal"
    MODERATE = "moderate"
    SEVERE = "severe"


class SeasonalAdjustmentReason(str, Enum):
    """Reason for seasonal adjustment."""

    WINTER_WEATHER = "winter_weather"
    SUMMER_HEAT = "summer_heat"
    MONSOON_SEASON = "monsoon_season"
    HURRICANE_SEASON = "hurricane_season"
    NONE = "none"


# =============================================================================
# LABOR RATES MODEL
# =============================================================================


class LaborRates(BaseModel):
    """Hourly labor rates by trade for a location.
    
    All rates are in USD per hour.
    """

    electrician: float = Field(..., ge=0, description="Electrician hourly rate ($/hr)")
    plumber: float = Field(..., ge=0, description="Plumber hourly rate ($/hr)")
    carpenter: float = Field(..., ge=0, description="Carpenter hourly rate ($/hr)")
    hvac: float = Field(..., ge=0, description="HVAC technician hourly rate ($/hr)")
    general_labor: float = Field(..., ge=0, description="General laborer hourly rate ($/hr)")
    painter: float = Field(..., ge=0, description="Painter hourly rate ($/hr)")
    tile_setter: float = Field(..., ge=0, description="Tile setter hourly rate ($/hr)")
    roofer: float = Field(..., ge=0, description="Roofer hourly rate ($/hr)")
    concrete_finisher: float = Field(..., ge=0, description="Concrete finisher hourly rate ($/hr)")
    drywall_installer: float = Field(..., ge=0, description="Drywall installer hourly rate ($/hr)")
    
    @field_validator('*', mode='before')
    @classmethod
    def validate_rate(cls, v):
        """Ensure rates are reasonable (between $15 and $200/hr)."""
        if isinstance(v, (int, float)) and (v < 0 or v > 500):
            raise ValueError(f"Labor rate {v} is outside reasonable range (0-500)")
        return v


# =============================================================================
# PERMIT COSTS MODEL
# =============================================================================


class PermitCosts(BaseModel):
    """Permit costs for a location.
    
    Combines fixed costs and percentage-based fees.
    """

    building_permit_base: float = Field(
        ..., ge=0, description="Base building permit fee ($)"
    )
    building_permit_percentage: float = Field(
        default=0.0, ge=0, le=0.1, description="Building permit % of project value (0-10%)"
    )
    electrical_permit: float = Field(..., ge=0, description="Electrical permit fee ($)")
    plumbing_permit: float = Field(..., ge=0, description="Plumbing permit fee ($)")
    mechanical_permit: float = Field(..., ge=0, description="Mechanical/HVAC permit fee ($)")
    plan_review_fee: float = Field(
        default=0.0, ge=0, description="Plan review fee ($)"
    )
    impact_fees: float = Field(
        default=0.0, ge=0, description="Development impact fees ($)"
    )
    inspection_fees: float = Field(
        default=0.0, ge=0, description="Inspection fees ($)"
    )
    
    def calculate_total_permit_cost(self, project_value: float) -> float:
        """Calculate total permit costs for a given project value.
        
        Args:
            project_value: Estimated project value in USD.
            
        Returns:
            Total permit costs in USD.
        """
        percentage_fee = project_value * self.building_permit_percentage
        fixed_fees = (
            self.building_permit_base +
            self.electrical_permit +
            self.plumbing_permit +
            self.mechanical_permit +
            self.plan_review_fee +
            self.impact_fees +
            self.inspection_fees
        )
        return percentage_fee + fixed_fees


# =============================================================================
# WEATHER FACTORS MODEL
# =============================================================================


class WeatherFactors(BaseModel):
    """Weather and seasonal factors affecting construction.
    
    Adjustments applied to labor productivity and scheduling.
    """

    winter_impact: WinterImpact = Field(
        ..., description="Level of winter weather impact"
    )
    seasonal_adjustment: float = Field(
        ..., ge=0.8, le=1.3, description="Seasonal cost multiplier (0.8-1.3)"
    )
    seasonal_reason: SeasonalAdjustmentReason = Field(
        default=SeasonalAdjustmentReason.NONE,
        description="Reason for seasonal adjustment"
    )
    frost_line_depth_inches: Optional[int] = Field(
        None, ge=0, le=100, description="Frost line depth for foundation work (inches)"
    )
    average_rain_days_per_month: Optional[int] = Field(
        None, ge=0, le=31, description="Average rainy days per month"
    )
    extreme_heat_days: Optional[int] = Field(
        None, ge=0, le=200, description="Days per year above 100°F"
    )


# =============================================================================
# MATERIAL COST ADJUSTMENTS
# =============================================================================


class MaterialCostAdjustments(BaseModel):
    """Location-based material cost adjustments.
    
    Factors that affect material costs in a specific location.
    """

    transportation_factor: float = Field(
        ..., ge=0.9, le=1.5, description="Transportation cost multiplier"
    )
    local_availability_factor: float = Field(
        ..., ge=0.9, le=1.3, description="Local material availability multiplier"
    )
    lumber_regional_adjustment: float = Field(
        default=1.0, ge=0.8, le=1.4, description="Regional lumber price adjustment"
    )
    concrete_regional_adjustment: float = Field(
        default=1.0, ge=0.8, le=1.4, description="Regional concrete price adjustment"
    )


# =============================================================================
# MAIN LOCATION FACTORS MODEL
# =============================================================================


class LocationFactors(BaseModel):
    """Complete location factors for construction cost estimation.
    
    This is the primary output model for the Location Agent,
    containing all location-specific cost adjustments.
    """

    # Location identification
    zip_code: str = Field(..., min_length=5, max_length=10, description="ZIP code")
    city: str = Field(..., min_length=1, description="City name")
    state: str = Field(..., min_length=2, max_length=2, description="State abbreviation")
    county: Optional[str] = Field(None, description="County name")
    region: Region = Field(..., description="Geographic region")
    
    # Cost factors
    labor_rates: LaborRates = Field(..., description="Hourly labor rates by trade")
    permit_costs: PermitCosts = Field(..., description="Permit and fee costs")
    weather_factors: WeatherFactors = Field(..., description="Weather and seasonal factors")
    material_adjustments: MaterialCostAdjustments = Field(
        ..., description="Material cost adjustments"
    )
    
    # Market characteristics
    union_status: UnionStatus = Field(..., description="Union market status")
    location_factor: float = Field(
        ..., ge=0.7, le=1.6, description="Overall location cost factor"
    )
    
    # Metadata
    data_source: str = Field(
        default="truecost_mock_v1", description="Data source identifier"
    )
    confidence: float = Field(
        ..., ge=0, le=1, description="Confidence in the data (0-1)"
    )
    summary: str = Field(..., min_length=10, description="Human-readable summary")
    
    class Config:
        """Pydantic configuration."""
        
        json_schema_extra = {
            "example": {
                "zip_code": "80202",
                "city": "Denver",
                "state": "CO",
                "region": "Mountain",
                "union_status": "mixed",
                "location_factor": 1.05,
                "confidence": 0.90,
                "summary": "Denver, CO (80202) - Mountain region with mixed union market"
            }
        }
    
    def to_agent_output(self) -> Dict:
        """Convert to format expected by agent output.
        
        Returns:
            Dictionary matching the location agent output schema.
        """
        return {
            "zipCode": self.zip_code,
            "city": self.city,
            "state": self.state,
            "county": self.county,
            "region": self.region.value,
            "laborRates": {
                "electrician": self.labor_rates.electrician,
                "plumber": self.labor_rates.plumber,
                "carpenter": self.labor_rates.carpenter,
                "hvac": self.labor_rates.hvac,
                "general_labor": self.labor_rates.general_labor,
                "painter": self.labor_rates.painter,
                "tile_setter": self.labor_rates.tile_setter,
                "roofer": self.labor_rates.roofer,
                "concrete_finisher": self.labor_rates.concrete_finisher,
                "drywall_installer": self.labor_rates.drywall_installer
            },
            "isUnion": self.union_status == UnionStatus.UNION,
            "unionStatus": self.union_status.value,
            "permitCosts": {
                "buildingPermitBase": self.permit_costs.building_permit_base,
                "buildingPermitPercentage": self.permit_costs.building_permit_percentage,
                "electricalPermit": self.permit_costs.electrical_permit,
                "plumbingPermit": self.permit_costs.plumbing_permit,
                "mechanicalPermit": self.permit_costs.mechanical_permit,
                "planReviewFee": self.permit_costs.plan_review_fee,
                "impactFees": self.permit_costs.impact_fees,
                "inspectionFees": self.permit_costs.inspection_fees
            },
            "locationFactor": self.location_factor,
            "weatherFactors": {
                "winterImpact": self.weather_factors.winter_impact.value,
                "seasonalAdjustment": self.weather_factors.seasonal_adjustment,
                "seasonalReason": self.weather_factors.seasonal_reason.value,
                "frostLineDepthInches": self.weather_factors.frost_line_depth_inches
            },
            "materialAdjustments": {
                "transportationFactor": self.material_adjustments.transportation_factor,
                "localAvailabilityFactor": self.material_adjustments.local_availability_factor,
                "lumberRegionalAdjustment": self.material_adjustments.lumber_regional_adjustment,
                "concreteRegionalAdjustment": self.material_adjustments.concrete_regional_adjustment
            },
            "dataSource": self.data_source,
            "confidence": self.confidence,
            "summary": self.summary
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def get_default_location_factors() -> LocationFactors:
    """Get default/national average location factors.
    
    Used when a specific ZIP code is not found.
    
    Returns:
        LocationFactors with national averages.
    """
    return LocationFactors(
        zip_code="00000",
        city="Unknown",
        state="XX",
        region=Region.NATIONAL,
        labor_rates=LaborRates(
            electrician=50.0,
            plumber=55.0,
            carpenter=42.0,
            hvac=52.0,
            general_labor=30.0,
            painter=38.0,
            tile_setter=45.0,
            roofer=40.0,
            concrete_finisher=43.0,
            drywall_installer=40.0
        ),
        permit_costs=PermitCosts(
            building_permit_base=300.0,
            building_permit_percentage=0.01,
            electrical_permit=125.0,
            plumbing_permit=125.0,
            mechanical_permit=100.0,
            plan_review_fee=150.0,
            impact_fees=0.0,
            inspection_fees=100.0
        ),
        weather_factors=WeatherFactors(
            winter_impact=WinterImpact.MODERATE,
            seasonal_adjustment=1.0,
            seasonal_reason=SeasonalAdjustmentReason.NONE
        ),
        material_adjustments=MaterialCostAdjustments(
            transportation_factor=1.0,
            local_availability_factor=1.0,
            lumber_regional_adjustment=1.0,
            concrete_regional_adjustment=1.0
        ),
        union_status=UnionStatus.MIXED,
        location_factor=1.0,
        confidence=0.60,
        summary="National average - specific location data unavailable"
    )




