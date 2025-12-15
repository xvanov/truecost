"""Mock Cost Estimate data fixtures for testing.

Provides mock data for Cost Agent, Scorer, and Critic tests.
"""

from typing import Dict, Any, List


# =============================================================================
# MOCK LOCATION OUTPUT (FROM LOCATION AGENT)
# =============================================================================

def get_mock_location_output() -> Dict[str, Any]:
    """Get sample location output for Denver, CO."""
    return {
        "zipCode": "80202",
        "city": "Denver",
        "state": "CO",
        "county": "Denver",
        "region": "Mountain",
        "laborRates": {
            "electrician": 58.0,
            "plumber": 62.0,
            "carpenter": 48.0,
            "hvac": 60.0,
            "general_labor": 36.0,
            "painter": 42.0,
            "tile_setter": 52.0,
            "roofer": 45.0,
            "concrete_finisher": 46.0,
            "drywall_installer": 44.0
        },
        "isUnion": False,
        "unionStatus": "mixed",
        "permitCosts": {
            "buildingPermitBase": 500.0,
            "buildingPermitPercentage": 0.015,
            "electricalPermit": 175.0,
            "plumbingPermit": 175.0,
            "mechanicalPermit": 150.0,
            "planReviewFee": 200.0,
            "impactFees": 0.0,
            "inspectionFees": 125.0
        },
        "locationFactor": 1.05,
        "weatherFactors": {
            "winterImpact": "moderate",
            "seasonalAdjustment": 1.05,
            "seasonalReason": "winter_weather",
            "frostLineDepthInches": 36
        },
        "materialAdjustments": {
            "transportationFactor": 1.02,
            "localAvailabilityFactor": 0.98,
            "lumberRegionalAdjustment": 1.05,
            "concreteRegionalAdjustment": 1.0
        },
        "dataSource": "truecost_mock_v1",
        "confidence": 0.92,
        "summary": "Denver, CO (80202) - Mountain region with mixed union market."
    }


# =============================================================================
# MOCK SCOPE OUTPUT (FROM SCOPE AGENT)
# =============================================================================

def get_mock_scope_output() -> Dict[str, Any]:
    """Get sample scope output (Bill of Quantities) for kitchen remodel."""
    return {
        "estimateId": "test-estimate-001",
        "projectType": "kitchen_remodel",
        "finishLevel": "mid-range",
        "totalSqft": 196,
        "divisions": [
            {
                "divisionCode": "01",
                "divisionName": "General Requirements",
                "status": "included",
                "description": "Project management and cleanup",
                "lineItems": [
                    {
                        "id": "01-001",
                        "item": "Project supervision",
                        "costCode": "01-3100-0100",
                        "quantity": 10,
                        "unit": "day",
                        "primaryTrade": "general_labor",
                        "estimatedMaterialCost": 0,
                        "estimatedLaborHours": 80.0
                    },
                    {
                        "id": "01-002",
                        "item": "Daily cleanup",
                        "costCode": "01-7400-0100",
                        "quantity": 15,
                        "unit": "day",
                        "primaryTrade": "general_labor",
                        "estimatedMaterialCost": 375,
                        "estimatedLaborHours": 30.0
                    }
                ],
                "subtotalMaterialCost": 375,
                "subtotalLaborHours": 110,
                "itemCount": 2
            },
            {
                "divisionCode": "02",
                "divisionName": "Existing Conditions",
                "status": "included",
                "description": "Demolition",
                "lineItems": [
                    {
                        "id": "02-001",
                        "item": "Cabinet demolition",
                        "costCode": "02-4119-0100",
                        "quantity": 30,
                        "unit": "LF",
                        "primaryTrade": "demolition",
                        "estimatedMaterialCost": 60,
                        "estimatedLaborHours": 15.0
                    },
                    {
                        "id": "02-002",
                        "item": "Flooring demolition",
                        "costCode": "02-4119-0300",
                        "quantity": 196,
                        "unit": "SF",
                        "primaryTrade": "demolition",
                        "estimatedMaterialCost": 98,
                        "estimatedLaborHours": 9.8
                    }
                ],
                "subtotalMaterialCost": 158,
                "subtotalLaborHours": 24.8,
                "itemCount": 2
            },
            {
                "divisionCode": "06",
                "divisionName": "Wood, Plastics, Composites",
                "status": "included",
                "description": "Cabinets and trim",
                "lineItems": [
                    {
                        "id": "06-001",
                        "item": "Base cabinets",
                        "costCode": "06-4100-0100",
                        "quantity": 18,
                        "unit": "LF",
                        "primaryTrade": "cabinet_installer",
                        "estimatedMaterialCost": 3150,
                        "estimatedLaborHours": 18.0
                    },
                    {
                        "id": "06-002",
                        "item": "Upper cabinets",
                        "costCode": "06-4100-0200",
                        "quantity": 14,
                        "unit": "LF",
                        "primaryTrade": "cabinet_installer",
                        "estimatedMaterialCost": 2100,
                        "estimatedLaborHours": 11.9
                    }
                ],
                "subtotalMaterialCost": 5250,
                "subtotalLaborHours": 29.9,
                "itemCount": 2
            },
            {
                "divisionCode": "12",
                "divisionName": "Furnishings",
                "status": "included",
                "description": "Countertops",
                "lineItems": [
                    {
                        "id": "12-001",
                        "item": "Granite countertops",
                        "costCode": "12-3600-0100",
                        "quantity": 45,
                        "unit": "SF",
                        "primaryTrade": "countertop_installer",
                        "estimatedMaterialCost": 2475,
                        "estimatedLaborHours": 9.0
                    }
                ],
                "subtotalMaterialCost": 2475,
                "subtotalLaborHours": 9.0,
                "itemCount": 1
            },
            {
                "divisionCode": "11",
                "divisionName": "Equipment",
                "status": "included",
                "description": "Appliances",
                "lineItems": [
                    {
                        "id": "11-001",
                        "item": "Refrigerator",
                        "costCode": "11-3100-0100",
                        "quantity": 1,
                        "unit": "EA",
                        "primaryTrade": "appliance_installer",
                        "estimatedMaterialCost": 1800,
                        "estimatedLaborHours": 1.0
                    },
                    {
                        "id": "11-002",
                        "item": "Gas range",
                        "costCode": "11-3100-0200",
                        "quantity": 1,
                        "unit": "EA",
                        "primaryTrade": "appliance_installer",
                        "estimatedMaterialCost": 900,
                        "estimatedLaborHours": 1.5
                    },
                    {
                        "id": "11-003",
                        "item": "Dishwasher",
                        "costCode": "11-3100-0300",
                        "quantity": 1,
                        "unit": "EA",
                        "primaryTrade": "appliance_installer",
                        "estimatedMaterialCost": 750,
                        "estimatedLaborHours": 2.0
                    }
                ],
                "subtotalMaterialCost": 3450,
                "subtotalLaborHours": 4.5,
                "itemCount": 3
            },
            {
                "divisionCode": "22",
                "divisionName": "Plumbing",
                "status": "included",
                "description": "Sink and faucet",
                "lineItems": [
                    {
                        "id": "22-001",
                        "item": "Kitchen faucet",
                        "costCode": "22-4100-0100",
                        "quantity": 1,
                        "unit": "EA",
                        "primaryTrade": "plumber",
                        "estimatedMaterialCost": 275,
                        "estimatedLaborHours": 1.5
                    },
                    {
                        "id": "22-002",
                        "item": "Garbage disposal",
                        "costCode": "22-4100-0200",
                        "quantity": 1,
                        "unit": "EA",
                        "primaryTrade": "plumber",
                        "estimatedMaterialCost": 225,
                        "estimatedLaborHours": 1.5
                    }
                ],
                "subtotalMaterialCost": 500,
                "subtotalLaborHours": 3.0,
                "itemCount": 2
            },
            {
                "divisionCode": "26",
                "divisionName": "Electrical",
                "status": "included",
                "description": "Lighting and outlets",
                "lineItems": [
                    {
                        "id": "26-001",
                        "item": "Recessed LED lights",
                        "costCode": "26-5100-0100",
                        "quantity": 8,
                        "unit": "EA",
                        "primaryTrade": "electrician",
                        "estimatedMaterialCost": 600,
                        "estimatedLaborHours": 6.0
                    },
                    {
                        "id": "26-002",
                        "item": "Under-cabinet lighting",
                        "costCode": "26-5100-0300",
                        "quantity": 14,
                        "unit": "LF",
                        "primaryTrade": "electrician",
                        "estimatedMaterialCost": 210,
                        "estimatedLaborHours": 3.5
                    },
                    {
                        "id": "26-003",
                        "item": "GFCI outlets",
                        "costCode": "26-2700-0100",
                        "quantity": 4,
                        "unit": "EA",
                        "primaryTrade": "electrician",
                        "estimatedMaterialCost": 140,
                        "estimatedLaborHours": 2.0
                    }
                ],
                "subtotalMaterialCost": 950,
                "subtotalLaborHours": 11.5,
                "itemCount": 3
            }
        ],
        "totalLineItems": 15,
        "totalIncludedDivisions": 7,
        "totalExcludedDivisions": 0,
        "preliminaryMaterialCost": 13158,
        "preliminaryLaborHours": 192.7,
        "confidence": 0.85,
        "summary": "Kitchen remodel with 15 line items across 7 divisions."
    }


# =============================================================================
# VALID COST OUTPUT (COMPLETE, CORRECT RANGES)
# =============================================================================

def get_valid_cost_output() -> Dict[str, Any]:
    """Get a complete, valid cost output with correct P50/P80/P90 ranges."""
    return {
        "estimateId": "test-estimate-001",
        "boqLineItemCount": 15,
        "divisions": [
            {
                "divisionCode": "06",
                "divisionName": "Wood, Plastics, Composites",
                "lineItems": [
                    {
                        "lineItemId": "06-001",
                        "costCode": "06-4100-0100",
                        "description": "Base cabinets",
                        "quantity": 18,
                        "unit": "LF",
                        "primaryTrade": "cabinet_installer",
                        "unitMaterialCost": {"low": 175.0, "medium": 201.25, "high": 218.75},
                        "unitLaborHours": 1.0,
                        "laborRate": {"low": 48.0, "medium": 53.76, "high": 57.6},
                        "materialCost": {"low": 3150.0, "medium": 3622.5, "high": 3937.5},
                        "laborHours": 18.0,
                        "laborCost": {"low": 864.0, "medium": 967.68, "high": 1036.8},
                        "equipmentCost": {"low": 0, "medium": 0, "high": 0},
                        "totalCost": {"low": 4014.0, "medium": 4590.18, "high": 4974.3},
                        "confidence": "high"
                    }
                ],
                "materialSubtotal": {"low": 3150.0, "medium": 3622.5, "high": 3937.5},
                "laborHoursSubtotal": 18.0,
                "laborSubtotal": {"low": 864.0, "medium": 967.68, "high": 1036.8},
                "equipmentSubtotal": {"low": 0, "medium": 0, "high": 0},
                "divisionTotal": {"low": 4014.0, "medium": 4590.18, "high": 4974.3},
                "itemCount": 1
            },
            {
                "divisionCode": "11",
                "divisionName": "Equipment",
                "lineItems": [
                    {
                        "lineItemId": "11-001",
                        "costCode": "11-3100-0100",
                        "description": "Refrigerator",
                        "quantity": 1,
                        "unit": "EA",
                        "primaryTrade": "appliance_installer",
                        "unitMaterialCost": {"low": 1800.0, "medium": 2070.0, "high": 2250.0},
                        "unitLaborHours": 1.0,
                        "laborRate": {"low": 36.0, "medium": 40.32, "high": 43.2},
                        "materialCost": {"low": 1800.0, "medium": 2070.0, "high": 2250.0},
                        "laborHours": 1.0,
                        "laborCost": {"low": 36.0, "medium": 40.32, "high": 43.2},
                        "equipmentCost": {"low": 0, "medium": 0, "high": 0},
                        "totalCost": {"low": 1836.0, "medium": 2110.32, "high": 2293.2},
                        "confidence": "high"
                    }
                ],
                "materialSubtotal": {"low": 1800.0, "medium": 2070.0, "high": 2250.0},
                "laborHoursSubtotal": 1.0,
                "laborSubtotal": {"low": 36.0, "medium": 40.32, "high": 43.2},
                "equipmentSubtotal": {"low": 0, "medium": 0, "high": 0},
                "divisionTotal": {"low": 1836.0, "medium": 2110.32, "high": 2293.2},
                "itemCount": 1
            }
        ],
        "subtotals": {
            "materials": {"low": 13158.0, "medium": 15131.7, "high": 16447.5},
            "labor": {"low": 7500.0, "medium": 8400.0, "high": 9000.0},
            "equipment": {"low": 450.0, "medium": 495.0, "high": 531.0},
            "subtotal": {"low": 21108.0, "medium": 24026.7, "high": 25978.5},
            "totalLaborHours": 192.7
        },
        "adjustments": {
            "locationFactor": 1.05,
            "locationAdjustedSubtotal": {"low": 22163.4, "medium": 25228.04, "high": 27277.43},
            "overheadPercentage": 0.10,
            "overhead": {"low": 2216.34, "medium": 2522.8, "high": 2727.74},
            "profitPercentage": 0.10,
            "profit": {"low": 2437.97, "medium": 2775.08, "high": 3000.52},
            "contingencyPercentage": 0.05,
            "contingency": {"low": 1340.89, "medium": 1526.3, "high": 1650.28},
            "permitCosts": {"low": 1125.0, "medium": 1181.25, "high": 1237.5},
            "taxPercentage": 0.0,
            "tax": {"low": 0, "medium": 0, "high": 0},
            "totalAdjustments": {"low": 7120.2, "medium": 8005.43, "high": 8616.04}
        },
        "total": {
            "low": 29283.6,
            "medium": 33233.47,
            "high": 35893.47
        },
        "confidence": 0.85,
        "summary": {
            "headline": "Total estimate: $29,284 - $35,893 (15 items)",
            "rangeExplanation": "P50 ($29,284) is median expected, P80 ($33,233) is conservative, P90 ($35,893) covers most contingencies.",
            "keyCostDrivers": [
                "Cabinets: $4,014 - $4,974",
                "Countertops: $2,475 - $3,094",
                "Appliances: $3,450 - $4,313"
            ],
            "costSavingOpportunities": [
                "Consider standard-grade countertops vs premium",
                "Bundle appliance purchase for package discount"
            ],
            "assumptions": [
                "Standard working hours (no overtime)",
                "Materials at current market prices",
                "Normal site access"
            ],
            "disclaimers": [
                "Estimate based on provided scope",
                "Verify permits with local building department"
            ]
        },
        "itemsWithExactCosts": 12,
        "itemsWithEstimatedCosts": 3,
        "averageCostConfidence": "high"
    }


# =============================================================================
# INVALID COST OUTPUT (BAD RANGES)
# =============================================================================

def get_invalid_ranges_output() -> Dict[str, Any]:
    """Get cost output with invalid ranges (high < low)."""
    output = get_valid_cost_output()
    
    # Make total range invalid (low > high)
    output["total"] = {"low": 40000.0, "medium": 35000.0, "high": 30000.0}
    
    # Make a division total invalid too
    output["divisions"][0]["divisionTotal"] = {"low": 5000.0, "medium": 4000.0, "high": 3500.0}
    
    return output


# =============================================================================
# INCOMPLETE COST OUTPUT (MISSING ITEMS)
# =============================================================================

def get_incomplete_cost_output() -> Dict[str, Any]:
    """Get cost output missing many line items."""
    output = get_valid_cost_output()
    
    # Remove most divisions (only keep 2 items)
    output["divisions"] = output["divisions"][:1]
    output["divisions"][0]["lineItems"] = output["divisions"][0]["lineItems"][:1]
    output["divisions"][0]["itemCount"] = 1
    output["boqLineItemCount"] = 1
    
    # Update subtotals to be low
    output["subtotals"]["materials"] = {"low": 3150.0, "medium": 3622.5, "high": 3937.5}
    output["subtotals"]["labor"] = {"low": 864.0, "medium": 967.68, "high": 1036.8}
    output["subtotals"]["subtotal"] = {"low": 4014.0, "medium": 4590.18, "high": 4974.3}
    
    # Update totals
    output["total"] = {"low": 5000.0, "medium": 5750.0, "high": 6250.0}
    
    return output


# =============================================================================
# MISSING LOCATION FACTOR OUTPUT
# =============================================================================

def get_missing_location_factor_output() -> Dict[str, Any]:
    """Get cost output with missing/wrong location factor."""
    output = get_valid_cost_output()
    
    # Set wrong location factor
    output["adjustments"]["locationFactor"] = 1.0  # Should be 1.05
    
    # Remove locationAdjustedSubtotal
    del output["adjustments"]["locationAdjustedSubtotal"]
    
    return output


# =============================================================================
# WIDE RANGE OUTPUT (RATIO > 2)
# =============================================================================

def get_wide_range_output() -> Dict[str, Any]:
    """Get cost output with too-wide range spread."""
    output = get_valid_cost_output()
    
    # Make range very wide (3x ratio)
    output["total"] = {"low": 20000.0, "medium": 45000.0, "high": 60000.0}
    
    return output


# =============================================================================
# NARROW RANGE OUTPUT (RATIO < 1.1)
# =============================================================================

def get_narrow_range_output() -> Dict[str, Any]:
    """Get cost output with too-narrow range spread."""
    output = get_valid_cost_output()
    
    # Make range very narrow
    output["total"] = {"low": 30000.0, "medium": 30500.0, "high": 31000.0}
    
    return output


# =============================================================================
# A2A REQUEST BUILDERS
# =============================================================================

def get_cost_agent_a2a_request() -> Dict[str, Any]:
    """Build A2A request for Cost Agent."""
    return {
        "jsonrpc": "2.0",
        "method": "message/send",
        "params": {
            "message": {
                "type": "request",
                "data": {
                    "estimate_id": "test-estimate-001",
                    "clarification_output": {
                        "projectBrief": {
                            "location": {
                                "zipCode": "80202",
                                "city": "Denver",
                                "state": "CO"
                            },
                            "projectType": "kitchen_remodel",
                            "scopeSummary": {
                                "totalSqft": 196,
                                "finishLevel": "mid-range"
                            }
                        }
                    },
                    "location_output": get_mock_location_output(),
                    "scope_output": get_mock_scope_output()
                }
            }
        },
        "id": "test-request-001"
    }


def get_cost_scorer_a2a_request(cost_output: Dict[str, Any] = None) -> Dict[str, Any]:
    """Build A2A request for Cost Scorer."""
    return {
        "jsonrpc": "2.0",
        "method": "message/send",
        "params": {
            "message": {
                "type": "score_request",
                "data": {
                    "estimate_id": "test-estimate-001",
                    "output": cost_output or get_valid_cost_output(),
                    "input_data": {
                        "scope_output": get_mock_scope_output(),
                        "location_output": get_mock_location_output()
                    }
                }
            }
        },
        "id": "test-scorer-001"
    }


def get_cost_critic_a2a_request(
    cost_output: Dict[str, Any] = None,
    score: int = 65,
    scorer_feedback: str = "Cost ranges need review"
) -> Dict[str, Any]:
    """Build A2A request for Cost Critic."""
    return {
        "jsonrpc": "2.0",
        "method": "message/send",
        "params": {
            "message": {
                "type": "critique_request",
                "data": {
                    "estimate_id": "test-estimate-001",
                    "output": cost_output or get_valid_cost_output(),
                    "input_data": {
                        "scope_output": get_mock_scope_output(),
                        "location_output": get_mock_location_output()
                    },
                    "score": score,
                    "scorer_feedback": scorer_feedback
                }
            }
        },
        "id": "test-critic-001"
    }




