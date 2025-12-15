"""Mock cost data fixtures for testing.

Provides mock location data for Denver, NYC, Houston, and other test cases.
"""

from typing import Dict, Any

from models.location_factors import (
    LocationFactors,
    LaborRates,
    PermitCosts,
    WeatherFactors,
    MaterialCostAdjustments,
    Region,
    UnionStatus,
    WinterImpact,
    SeasonalAdjustmentReason,
)


# =============================================================================
# DENVER, CO (80202) - Mixed market, moderate costs
# =============================================================================

DENVER_LOCATION_FACTORS = LocationFactors(
    zip_code="80202",
    city="Denver",
    state="CO",
    county="Denver",
    region=Region.MOUNTAIN,
    labor_rates=LaborRates(
        electrician=58.0,
        plumber=62.0,
        carpenter=48.0,
        hvac=60.0,
        general_labor=36.0,
        painter=42.0,
        tile_setter=52.0,
        roofer=45.0,
        concrete_finisher=46.0,
        drywall_installer=44.0
    ),
    permit_costs=PermitCosts(
        building_permit_base=500.0,
        building_permit_percentage=0.015,
        electrical_permit=175.0,
        plumbing_permit=175.0,
        mechanical_permit=150.0,
        plan_review_fee=200.0,
        impact_fees=0.0,
        inspection_fees=125.0
    ),
    weather_factors=WeatherFactors(
        winter_impact=WinterImpact.MODERATE,
        seasonal_adjustment=1.05,
        seasonal_reason=SeasonalAdjustmentReason.WINTER_WEATHER,
        frost_line_depth_inches=36,
        average_rain_days_per_month=8,
        extreme_heat_days=15
    ),
    material_adjustments=MaterialCostAdjustments(
        transportation_factor=1.02,
        local_availability_factor=0.98,
        lumber_regional_adjustment=1.05,
        concrete_regional_adjustment=1.0
    ),
    union_status=UnionStatus.MIXED,
    location_factor=1.05,
    confidence=0.92,
    summary="Denver, CO (80202) - Mountain region with mixed union market. Moderate winter impact."
)


# =============================================================================
# NEW YORK CITY (10001) - Union market, high costs
# =============================================================================

NYC_LOCATION_FACTORS = LocationFactors(
    zip_code="10001",
    city="New York",
    state="NY",
    county="New York",
    region=Region.NORTHEAST,
    labor_rates=LaborRates(
        electrician=95.0,
        plumber=100.0,
        carpenter=82.0,
        hvac=92.0,
        general_labor=55.0,
        painter=68.0,
        tile_setter=78.0,
        roofer=72.0,
        concrete_finisher=75.0,
        drywall_installer=70.0
    ),
    permit_costs=PermitCosts(
        building_permit_base=1500.0,
        building_permit_percentage=0.025,
        electrical_permit=400.0,
        plumbing_permit=400.0,
        mechanical_permit=350.0,
        plan_review_fee=500.0,
        impact_fees=250.0,
        inspection_fees=300.0
    ),
    weather_factors=WeatherFactors(
        winter_impact=WinterImpact.SEVERE,
        seasonal_adjustment=1.12,
        seasonal_reason=SeasonalAdjustmentReason.WINTER_WEATHER,
        frost_line_depth_inches=48,
        average_rain_days_per_month=11,
        extreme_heat_days=8
    ),
    material_adjustments=MaterialCostAdjustments(
        transportation_factor=1.15,
        local_availability_factor=1.10,
        lumber_regional_adjustment=1.20,
        concrete_regional_adjustment=1.15
    ),
    union_status=UnionStatus.UNION,
    location_factor=1.35,
    confidence=0.95,
    summary="New York City, NY (10001) - Northeast region with strong union market. High costs."
)


# =============================================================================
# HOUSTON, TX (77001) - Non-union market, lower costs
# =============================================================================

HOUSTON_LOCATION_FACTORS = LocationFactors(
    zip_code="77001",
    city="Houston",
    state="TX",
    county="Harris",
    region=Region.SOUTH,
    labor_rates=LaborRates(
        electrician=45.0,
        plumber=48.0,
        carpenter=38.0,
        hvac=50.0,
        general_labor=28.0,
        painter=32.0,
        tile_setter=42.0,
        roofer=38.0,
        concrete_finisher=40.0,
        drywall_installer=36.0
    ),
    permit_costs=PermitCosts(
        building_permit_base=350.0,
        building_permit_percentage=0.01,
        electrical_permit=125.0,
        plumbing_permit=125.0,
        mechanical_permit=100.0,
        plan_review_fee=150.0,
        impact_fees=0.0,
        inspection_fees=100.0
    ),
    weather_factors=WeatherFactors(
        winter_impact=WinterImpact.NONE,
        seasonal_adjustment=1.03,
        seasonal_reason=SeasonalAdjustmentReason.SUMMER_HEAT,
        frost_line_depth_inches=0,
        average_rain_days_per_month=9,
        extreme_heat_days=95
    ),
    material_adjustments=MaterialCostAdjustments(
        transportation_factor=0.95,
        local_availability_factor=0.92,
        lumber_regional_adjustment=0.95,
        concrete_regional_adjustment=0.90
    ),
    union_status=UnionStatus.NON_UNION,
    location_factor=0.92,
    confidence=0.93,
    summary="Houston, TX (77001) - South region with non-union market. Lower labor costs."
)


# =============================================================================
# UNKNOWN ZIP - Default/fallback data
# =============================================================================

UNKNOWN_LOCATION_FACTORS = LocationFactors(
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


# =============================================================================
# HELPER FUNCTIONS FOR TESTS
# =============================================================================


def get_denver_clarification_input() -> Dict[str, Any]:
    """Get sample clarification input for Denver location."""
    return {
        "clarification_output": {
            "estimateId": "est-test-denver",
            "schemaVersion": "3.0.0",
            "projectBrief": {
                "projectType": "kitchen_remodel",
                "location": {
                    "zipCode": "80202",
                    "city": "Denver",
                    "state": "CO",
                    "fullAddress": "1600 California St, Denver, CO 80202",
                    "county": "Denver"
                },
                "scopeSummary": {
                    "totalSqft": 150,
                    "finishLevel": "mid_range"
                }
            }
        }
    }


def get_nyc_clarification_input() -> Dict[str, Any]:
    """Get sample clarification input for NYC location."""
    return {
        "clarification_output": {
            "estimateId": "est-test-nyc",
            "schemaVersion": "3.0.0",
            "projectBrief": {
                "projectType": "bathroom_remodel",
                "location": {
                    "zipCode": "10001",
                    "city": "New York",
                    "state": "NY",
                    "fullAddress": "350 5th Ave, New York, NY 10001",
                    "county": "New York"
                },
                "scopeSummary": {
                    "totalSqft": 80,
                    "finishLevel": "high_end"
                }
            }
        }
    }


def get_houston_clarification_input() -> Dict[str, Any]:
    """Get sample clarification input for Houston location."""
    return {
        "clarification_output": {
            "estimateId": "est-test-houston",
            "schemaVersion": "3.0.0",
            "projectBrief": {
                "projectType": "kitchen_remodel",
                "location": {
                    "zipCode": "77001",
                    "city": "Houston",
                    "state": "TX",
                    "fullAddress": "1001 Main St, Houston, TX 77001",
                    "county": "Harris"
                },
                "scopeSummary": {
                    "totalSqft": 200,
                    "finishLevel": "mid_range"
                }
            }
        }
    }


def get_unknown_zip_clarification_input() -> Dict[str, Any]:
    """Get sample clarification input for unknown ZIP location."""
    return {
        "clarification_output": {
            "estimateId": "est-test-unknown",
            "schemaVersion": "3.0.0",
            "projectBrief": {
                "projectType": "kitchen_remodel",
                "location": {
                    "zipCode": "99999",
                    "city": "Unknown City",
                    "state": "XX",
                    "fullAddress": "123 Unknown St, Unknown City, XX 99999"
                },
                "scopeSummary": {
                    "totalSqft": 100,
                    "finishLevel": "budget"
                }
            }
        }
    }


def get_valid_location_output() -> Dict[str, Any]:
    """Get a valid location agent output for testing scorer."""
    return DENVER_LOCATION_FACTORS.to_agent_output() | {
        "analysis": "Denver is located in the Mountain region with a mixed union/non-union labor market. "
                   "The location factor of 1.05 indicates slightly above-average construction costs. "
                   "Winter weather will have moderate impact on construction schedules.",
        "keyFindings": [
            "Mixed union market provides flexibility in labor sourcing",
            "Moderate winter impact may affect scheduling in colder months",
            "Location factor 1.05 indicates slightly above-average costs",
            "Good material availability with local suppliers"
        ],
        "recommendations": [
            "Schedule outdoor work during spring through fall for optimal conditions",
            "Verify permit requirements with Denver Building Department",
            "Consider union trades for complex electrical and plumbing work"
        ],
        "riskFactors": [
            "Winter weather may delay exterior work",
            "High altitude may affect some material applications"
        ],
        "confidenceAssessment": "High confidence (92%) based on comprehensive Denver metro data"
    }


def get_incomplete_location_output() -> Dict[str, Any]:
    """Get an incomplete location output for testing scorer/critic."""
    return {
        "zipCode": "80202",
        "city": "Denver",
        "state": "CO",
        "region": "Mountain",
        "laborRates": {
            "electrician": 58.0,
            "plumber": 62.0,
            # Missing required trades: carpenter, hvac, general_labor, painter
        },
        "isUnion": False,
        "permitCosts": {
            "buildingPermitBase": 500.0,
            # Missing other permits
        },
        "locationFactor": 1.05,
        # Missing weatherFactors, materialAdjustments, analysis, keyFindings, etc.
        "confidence": 0.6,
        "summary": "Incomplete data"
    }


def get_invalid_location_output() -> Dict[str, Any]:
    """Get an invalid location output for testing scorer/critic."""
    return {
        "zipCode": "80202",
        "city": "",  # Invalid: empty
        "state": "Colorado",  # Invalid: should be 2-letter code
        "region": "Mountain",
        "laborRates": {
            "electrician": 15.0,  # Invalid: too low
            "plumber": 200.0,  # Invalid: too high
            "carpenter": "forty",  # Invalid: not a number
            "hvac": -50.0,  # Invalid: negative
            "general_labor": 30.0,
            "painter": 38.0
        },
        "isUnion": False,
        "permitCosts": {
            "buildingPermitBase": -100.0,  # Invalid: negative
            "electricalPermit": 175.0,
            "plumbingPermit": 175.0,
            "mechanicalPermit": 150.0
        },
        "locationFactor": 2.5,  # Invalid: out of range
        "weatherFactors": {
            "winterImpact": "extreme",  # Invalid: not in enum
            "seasonalAdjustment": 2.0  # Invalid: out of range
        },
        "confidence": 0.3,
        "summary": "Invalid test data"
    }


# =============================================================================
# MOCK A2A REQUESTS
# =============================================================================


def get_location_agent_a2a_request(
    estimate_id: str = "est-test-001",
    zip_code: str = "80202",
    city: str = "Denver",
    state: str = "CO"
) -> Dict[str, Any]:
    """Build a mock A2A request for the location agent."""
    return {
        "jsonrpc": "2.0",
        "id": f"req-{estimate_id}",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {
                        "type": "data",
                        "data": {
                            "estimate_id": estimate_id,
                            "input": {
                                "clarification_output": {
                                    "estimateId": estimate_id,
                                    "schemaVersion": "3.0.0",
                                    "projectBrief": {
                                        "projectType": "kitchen_remodel",
                                        "location": {
                                            "zipCode": zip_code,
                                            "city": city,
                                            "state": state,
                                            "fullAddress": f"123 Main St, {city}, {state} {zip_code}"
                                        },
                                        "scopeSummary": {
                                            "totalSqft": 150,
                                            "finishLevel": "mid_range"
                                        }
                                    }
                                }
                            }
                        }
                    }
                ]
            },
            "context": {
                "thread_id": estimate_id
            }
        }
    }


def get_scorer_a2a_request(
    estimate_id: str = "est-test-001",
    output: Dict[str, Any] = None,
    input_data: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Build a mock A2A request for the location scorer."""
    if output is None:
        output = get_valid_location_output()
    if input_data is None:
        input_data = get_denver_clarification_input()
    
    return {
        "jsonrpc": "2.0",
        "id": f"req-score-{estimate_id}",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {
                        "type": "data",
                        "data": {
                            "estimate_id": estimate_id,
                            "agent_name": "location",
                            "output": output,
                            "input": input_data
                        }
                    }
                ]
            }
        }
    }


def get_critic_a2a_request(
    estimate_id: str = "est-test-001",
    output: Dict[str, Any] = None,
    input_data: Dict[str, Any] = None,
    score: int = 65,
    scorer_feedback: str = "Below standard output"
) -> Dict[str, Any]:
    """Build a mock A2A request for the location critic."""
    if output is None:
        output = get_incomplete_location_output()
    if input_data is None:
        input_data = get_denver_clarification_input()
    
    return {
        "jsonrpc": "2.0",
        "id": f"req-critic-{estimate_id}",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {
                        "type": "data",
                        "data": {
                            "estimate_id": estimate_id,
                            "agent_name": "location",
                            "output": output,
                            "input": input_data,
                            "score": score,
                            "scorer_feedback": scorer_feedback
                        }
                    }
                ]
            }
        }
    }




