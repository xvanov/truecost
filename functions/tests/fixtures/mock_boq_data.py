"""Mock Bill of Quantities data fixtures for testing.

Provides mock BoQ data for kitchen and bathroom remodel test cases.
"""

from typing import Dict, Any, List


# =============================================================================
# KITCHEN REMODEL CSI SCOPE (FROM CLARIFICATION OUTPUT)
# =============================================================================

def get_kitchen_csi_scope() -> Dict[str, Any]:
    """Get sample CSI scope for kitchen remodel."""
    return {
        "div01_general_requirements": {
            "code": "01",
            "name": "General Requirements",
            "status": "included",
            "description": "Project management, cleanup, and protection.",
            "items": [
                {
                    "id": "01-001",
                    "item": "Project supervision and coordination",
                    "subdivisionCode": "01 31 00",
                    "quantity": 1,
                    "unit": "allowance",
                    "specifications": "Daily site coordination",
                    "notes": None,
                    "confidence": 1.0,
                    "source": "standard_allowance"
                },
                {
                    "id": "01-002",
                    "item": "Floor protection",
                    "subdivisionCode": "01 56 00",
                    "quantity": 200,
                    "unit": "sf",
                    "specifications": "Ram board for adjacent areas",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "inferred"
                },
                {
                    "id": "01-003",
                    "item": "Daily cleanup",
                    "subdivisionCode": "01 74 00",
                    "quantity": 15,
                    "unit": "days",
                    "specifications": "End of day debris removal",
                    "notes": None,
                    "confidence": 0.90,
                    "source": "inferred"
                }
            ]
        },
        "div02_existing_conditions": {
            "code": "02",
            "name": "Existing Conditions",
            "status": "included",
            "description": "Demolition of existing kitchen elements.",
            "items": [
                {
                    "id": "02-001",
                    "item": "Cabinet demolition and removal",
                    "subdivisionCode": "02 41 19",
                    "quantity": 30,
                    "unit": "lf",
                    "specifications": "Remove all existing cabinets",
                    "notes": None,
                    "confidence": 0.92,
                    "source": "cad_extraction"
                },
                {
                    "id": "02-002",
                    "item": "Countertop demolition",
                    "subdivisionCode": "02 41 19",
                    "quantity": 45,
                    "unit": "sf",
                    "specifications": "Remove existing countertops",
                    "notes": None,
                    "confidence": 0.88,
                    "source": "cad_extraction"
                },
                {
                    "id": "02-003",
                    "item": "Flooring demolition",
                    "subdivisionCode": "02 41 19",
                    "quantity": 196,
                    "unit": "sf",
                    "specifications": "Remove vinyl flooring",
                    "notes": None,
                    "confidence": 0.85,
                    "source": "user_input"
                }
            ]
        },
        "div03_concrete": {
            "code": "03",
            "name": "Concrete",
            "status": "excluded",
            "exclusionReason": "No concrete work required",
            "description": "",
            "items": []
        },
        "div04_masonry": {
            "code": "04",
            "name": "Masonry",
            "status": "excluded",
            "exclusionReason": "No masonry work in scope",
            "description": "",
            "items": []
        },
        "div05_metals": {
            "code": "05",
            "name": "Metals",
            "status": "excluded",
            "exclusionReason": "No structural steel required",
            "description": "",
            "items": []
        },
        "div06_wood_plastics_composites": {
            "code": "06",
            "name": "Wood, Plastics, and Composites",
            "status": "included",
            "description": "New kitchen cabinets and trim.",
            "items": [
                {
                    "id": "06-001",
                    "item": "Base cabinets",
                    "subdivisionCode": "06 41 00",
                    "quantity": 16,
                    "unit": "lf",
                    "specifications": "Shaker style, maple, painted white",
                    "notes": "Kraftmaid or equivalent",
                    "confidence": 0.94,
                    "source": "user_input"
                },
                {
                    "id": "06-002",
                    "item": "Upper cabinets",
                    "subdivisionCode": "06 41 00",
                    "quantity": 14,
                    "unit": "lf",
                    "specifications": "42-inch height, soft-close",
                    "notes": None,
                    "confidence": 0.94,
                    "source": "user_input"
                },
                {
                    "id": "06-003",
                    "item": "Island base cabinet",
                    "subdivisionCode": "06 41 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "60x36 inch island",
                    "notes": None,
                    "confidence": 0.92,
                    "source": "cad_extraction"
                },
                {
                    "id": "06-004",
                    "item": "Crown molding",
                    "subdivisionCode": "06 22 00",
                    "quantity": 30,
                    "unit": "lf",
                    "specifications": "3.5-inch crown molding",
                    "notes": None,
                    "confidence": 0.90,
                    "source": "inferred"
                }
            ]
        },
        "div07_thermal_moisture": {
            "code": "07",
            "name": "Thermal and Moisture Protection",
            "status": "excluded",
            "exclusionReason": "No insulation work required",
            "description": "",
            "items": []
        },
        "div08_openings": {
            "code": "08",
            "name": "Openings",
            "status": "included",
            "description": "Cabinet hardware.",
            "items": [
                {
                    "id": "08-001",
                    "item": "Cabinet hardware - pulls",
                    "subdivisionCode": "08 71 00",
                    "quantity": 28,
                    "unit": "each",
                    "specifications": "Brushed nickel bar pulls",
                    "notes": None,
                    "confidence": 0.85,
                    "source": "user_input"
                },
                {
                    "id": "08-002",
                    "item": "Cabinet hardware - knobs",
                    "subdivisionCode": "08 71 00",
                    "quantity": 18,
                    "unit": "each",
                    "specifications": "Brushed nickel knobs",
                    "notes": None,
                    "confidence": 0.85,
                    "source": "user_input"
                }
            ]
        },
        "div09_finishes": {
            "code": "09",
            "name": "Finishes",
            "status": "included",
            "description": "Flooring, paint, and backsplash.",
            "items": [
                {
                    "id": "09-001",
                    "item": "Engineered hardwood flooring",
                    "subdivisionCode": "09 64 00",
                    "quantity": 210,
                    "unit": "sf",
                    "specifications": "5-inch plank, medium oak",
                    "notes": None,
                    "confidence": 0.92,
                    "source": "cad_extraction"
                },
                {
                    "id": "09-002",
                    "item": "Wall paint",
                    "subdivisionCode": "09 91 00",
                    "quantity": 450,
                    "unit": "sf",
                    "specifications": "2 coats, eggshell finish",
                    "notes": None,
                    "confidence": 0.88,
                    "source": "cad_extraction"
                },
                {
                    "id": "09-003",
                    "item": "Subway tile backsplash",
                    "subdivisionCode": "09 30 00",
                    "quantity": 35,
                    "unit": "sf",
                    "specifications": "3x6 white ceramic",
                    "notes": None,
                    "confidence": 0.90,
                    "source": "user_input"
                }
            ]
        },
        "div10_specialties": {
            "code": "10",
            "name": "Specialties",
            "status": "included",
            "description": "Kitchen accessories.",
            "items": [
                {
                    "id": "10-001",
                    "item": "Paper towel holder",
                    "subdivisionCode": "10 28 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "Wall-mounted, brushed nickel",
                    "notes": None,
                    "confidence": 0.70,
                    "source": "inferred"
                }
            ]
        },
        "div11_equipment": {
            "code": "11",
            "name": "Equipment",
            "status": "included",
            "description": "Kitchen appliances.",
            "items": [
                {
                    "id": "11-001",
                    "item": "Refrigerator",
                    "subdivisionCode": "11 31 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "36-inch french door, stainless",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "user_input"
                },
                {
                    "id": "11-002",
                    "item": "Gas range",
                    "subdivisionCode": "11 31 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "30-inch freestanding, 5-burner",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "user_input"
                },
                {
                    "id": "11-003",
                    "item": "Dishwasher",
                    "subdivisionCode": "11 31 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "24-inch built-in, quiet",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "user_input"
                },
                {
                    "id": "11-004",
                    "item": "Range hood",
                    "subdivisionCode": "11 31 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "30-inch wall-mount chimney",
                    "notes": None,
                    "confidence": 0.92,
                    "source": "cad_extraction"
                }
            ]
        },
        "div12_furnishings": {
            "code": "12",
            "name": "Furnishings",
            "status": "included",
            "description": "Countertops and sink.",
            "items": [
                {
                    "id": "12-001",
                    "item": "Granite countertops",
                    "subdivisionCode": "12 36 00",
                    "quantity": 70,
                    "unit": "sf",
                    "specifications": "Level 2 granite, eased edge",
                    "notes": None,
                    "confidence": 0.92,
                    "source": "user_input"
                },
                {
                    "id": "12-002",
                    "item": "Undermount kitchen sink",
                    "subdivisionCode": "12 36 40",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "32-inch double bowl, stainless",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "user_input"
                }
            ]
        },
        "div22_plumbing": {
            "code": "22",
            "name": "Plumbing",
            "status": "included",
            "description": "Plumbing fixtures.",
            "items": [
                {
                    "id": "22-001",
                    "item": "Kitchen faucet",
                    "subdivisionCode": "22 41 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "Pull-down sprayer, chrome",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "user_input"
                },
                {
                    "id": "22-002",
                    "item": "Garbage disposal",
                    "subdivisionCode": "22 41 00",
                    "quantity": 1,
                    "unit": "each",
                    "specifications": "3/4 HP, continuous feed",
                    "notes": None,
                    "confidence": 0.95,
                    "source": "user_input"
                }
            ]
        },
        "div26_electrical": {
            "code": "26",
            "name": "Electrical",
            "status": "included",
            "description": "Lighting and outlets.",
            "items": [
                {
                    "id": "26-001",
                    "item": "Recessed LED lights",
                    "subdivisionCode": "26 51 00",
                    "quantity": 6,
                    "unit": "each",
                    "specifications": "6-inch, 3000K, dimmable",
                    "notes": None,
                    "confidence": 0.90,
                    "source": "user_input"
                },
                {
                    "id": "26-002",
                    "item": "Under-cabinet LED lighting",
                    "subdivisionCode": "26 51 00",
                    "quantity": 14,
                    "unit": "lf",
                    "specifications": "Hardwired LED strip",
                    "notes": None,
                    "confidence": 0.85,
                    "source": "user_input"
                },
                {
                    "id": "26-003",
                    "item": "GFCI outlets",
                    "subdivisionCode": "26 27 00",
                    "quantity": 4,
                    "unit": "each",
                    "specifications": "20A GFCI",
                    "notes": None,
                    "confidence": 0.92,
                    "source": "cad_extraction"
                }
            ]
        }
    }


def get_kitchen_clarification_input() -> Dict[str, Any]:
    """Get complete clarification input for kitchen remodel."""
    return {
        "clarification_output": {
            "estimateId": "est-test-kitchen",
            "schemaVersion": "3.0.0",
            "projectBrief": {
                "projectType": "kitchen_remodel",
                "location": {
                    "zipCode": "80202",
                    "city": "Denver",
                    "state": "CO",
                    "fullAddress": "1234 Main St, Denver, CO 80202"
                },
                "scopeSummary": {
                    "totalSqft": 196,
                    "finishLevel": "mid_range",
                    "rooms": ["kitchen"],
                    "includedDivisions": ["01", "02", "06", "08", "09", "10", "11", "12", "22", "26"]
                }
            },
            "csiScope": get_kitchen_csi_scope(),
            "cadData": {
                "spaceModel": {
                    "totalSqft": 196,
                    "rooms": [
                        {"id": "room_1", "name": "Kitchen", "sqft": 196}
                    ],
                    "walls": [
                        {"id": "wall_north", "length": 14, "height": 9},
                        {"id": "wall_east", "length": 14, "height": 9},
                        {"id": "wall_south", "length": 14, "height": 9},
                        {"id": "wall_west", "length": 14, "height": 9}
                    ]
                }
            }
        }
    }


# =============================================================================
# VALID SCOPE OUTPUT
# =============================================================================

def get_valid_scope_output() -> Dict[str, Any]:
    """Get a valid scope agent output for testing scorer."""
    return {
        "estimateId": "est-test-kitchen",
        "projectType": "kitchen_remodel",
        "finishLevel": "mid_range",
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
                        "quantity": 1,
                        "unit": "allowance",
                        "costCode": "01-3100-0100",
                        "costCodeDescription": "Project supervision",
                        "costCodeConfidence": 0.95,
                        "materialCostPerUnit": 0,
                        "laborHoursPerUnit": 8.0,
                        "primaryTrade": "general_labor",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 0,
                        "estimatedLaborHours": 8.0,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 0,
                "subtotalLaborHours": 8.0,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0.95
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
                        "quantity": 30,
                        "unit": "lf",
                        "costCode": "02-4119-0100",
                        "costCodeDescription": "Cabinet demolition",
                        "costCodeConfidence": 0.92,
                        "materialCostPerUnit": 2.0,
                        "laborHoursPerUnit": 0.5,
                        "primaryTrade": "demolition",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 60,
                        "estimatedLaborHours": 15.0,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 60,
                "subtotalLaborHours": 15.0,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0.92
            },
            {
                "divisionCode": "06",
                "divisionName": "Wood, Plastics, Composites",
                "status": "included",
                "description": "Cabinets",
                "lineItems": [
                    {
                        "id": "06-001",
                        "item": "Base cabinets",
                        "quantity": 16,
                        "unit": "lf",
                        "costCode": "06-4100-0100",
                        "costCodeDescription": "Base cabinets",
                        "costCodeConfidence": 0.94,
                        "materialCostPerUnit": 175.0,
                        "laborHoursPerUnit": 1.0,
                        "primaryTrade": "cabinet_installer",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 2800,
                        "estimatedLaborHours": 16.0,
                        "estimatedEquipmentCost": 0
                    },
                    {
                        "id": "06-002",
                        "item": "Upper cabinets",
                        "quantity": 14,
                        "unit": "lf",
                        "costCode": "06-4100-0200",
                        "costCodeDescription": "Upper cabinets",
                        "costCodeConfidence": 0.94,
                        "materialCostPerUnit": 150.0,
                        "laborHoursPerUnit": 0.85,
                        "primaryTrade": "cabinet_installer",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 2100,
                        "estimatedLaborHours": 11.9,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 4900,
                "subtotalLaborHours": 27.9,
                "subtotalEquipmentCost": 0,
                "itemCount": 2,
                "averageConfidence": 0.94
            },
            {
                "divisionCode": "09",
                "divisionName": "Finishes",
                "status": "included",
                "description": "Flooring and paint",
                "lineItems": [
                    {
                        "id": "09-001",
                        "item": "Engineered hardwood",
                        "quantity": 210,
                        "unit": "sf",
                        "costCode": "09-6400-0100",
                        "costCodeDescription": "Hardwood flooring",
                        "costCodeConfidence": 0.92,
                        "materialCostPerUnit": 7.5,
                        "laborHoursPerUnit": 0.08,
                        "primaryTrade": "flooring_installer",
                        "quantityValidation": "validated",
                        "estimatedMaterialCost": 1575,
                        "estimatedLaborHours": 16.8,
                        "estimatedEquipmentCost": 0
                    },
                    {
                        "id": "09-002",
                        "item": "Wall paint",
                        "quantity": 450,
                        "unit": "sf",
                        "costCode": "09-9100-0100",
                        "costCodeDescription": "Interior paint",
                        "costCodeConfidence": 0.88,
                        "materialCostPerUnit": 0.45,
                        "laborHoursPerUnit": 0.02,
                        "primaryTrade": "painter",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 202.5,
                        "estimatedLaborHours": 9.0,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 1777.5,
                "subtotalLaborHours": 25.8,
                "subtotalEquipmentCost": 0,
                "itemCount": 2,
                "averageConfidence": 0.90
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
                        "quantity": 1,
                        "unit": "each",
                        "costCode": "11-3100-0100",
                        "costCodeDescription": "Refrigerator",
                        "costCodeConfidence": 0.95,
                        "materialCostPerUnit": 1800.0,
                        "laborHoursPerUnit": 1.0,
                        "primaryTrade": "appliance_installer",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 1800,
                        "estimatedLaborHours": 1.0,
                        "estimatedEquipmentCost": 0
                    },
                    {
                        "id": "11-002",
                        "item": "Gas range",
                        "quantity": 1,
                        "unit": "each",
                        "costCode": "11-3100-0200",
                        "costCodeDescription": "Gas range",
                        "costCodeConfidence": 0.95,
                        "materialCostPerUnit": 900.0,
                        "laborHoursPerUnit": 1.5,
                        "primaryTrade": "appliance_installer",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 900,
                        "estimatedLaborHours": 1.5,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 2700,
                "subtotalLaborHours": 2.5,
                "subtotalEquipmentCost": 0,
                "itemCount": 2,
                "averageConfidence": 0.95
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
                        "quantity": 70,
                        "unit": "sf",
                        "costCode": "12-3600-0100",
                        "costCodeDescription": "Granite countertops",
                        "costCodeConfidence": 0.92,
                        "materialCostPerUnit": 55.0,
                        "laborHoursPerUnit": 0.2,
                        "primaryTrade": "countertop_installer",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 3850,
                        "estimatedLaborHours": 14.0,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 3850,
                "subtotalLaborHours": 14.0,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0.92
            },
            {
                "divisionCode": "22",
                "divisionName": "Plumbing",
                "status": "included",
                "description": "Fixtures",
                "lineItems": [
                    {
                        "id": "22-001",
                        "item": "Kitchen faucet",
                        "quantity": 1,
                        "unit": "each",
                        "costCode": "22-4100-0100",
                        "costCodeDescription": "Kitchen faucet",
                        "costCodeConfidence": 0.95,
                        "materialCostPerUnit": 275.0,
                        "laborHoursPerUnit": 1.5,
                        "primaryTrade": "plumber",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 275,
                        "estimatedLaborHours": 1.5,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 275,
                "subtotalLaborHours": 1.5,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0.95
            },
            {
                "divisionCode": "26",
                "divisionName": "Electrical",
                "status": "included",
                "description": "Lighting",
                "lineItems": [
                    {
                        "id": "26-001",
                        "item": "Recessed LED lights",
                        "quantity": 6,
                        "unit": "each",
                        "costCode": "26-5100-0100",
                        "costCodeDescription": "Recessed LED",
                        "costCodeConfidence": 0.90,
                        "materialCostPerUnit": 75.0,
                        "laborHoursPerUnit": 0.75,
                        "primaryTrade": "electrician",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 450,
                        "estimatedLaborHours": 4.5,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 450,
                "subtotalLaborHours": 4.5,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0.90
            }
        ],
        "totalLineItems": 32,
        "totalIncludedDivisions": 8,
        "totalExcludedDivisions": 4,
        "preliminaryMaterialCost": 14012.5,
        "preliminaryLaborHours": 99.2,
        "preliminaryEquipmentCost": 0,
        "completeness": {
            "allItemsHaveCostCodes": True,
            "allItemsHaveQuantities": True,
            "allRequiredDivisionsPresent": True,
            "quantityValidationComplete": False,
            "costCodeCoverage": 1.0,
            "quantityValidationCoverage": 0.15,
            "warnings": [],
            "missingItems": [],
            "suggestedAdditions": []
        },
        "analysis": {
            "summary": "Kitchen remodel with 32 line items across 8 CSI divisions. Mid-range finish level with granite countertops, custom cabinets, and new appliances. Standard scope for 196 sqft kitchen.",
            "keyObservations": [
                "Complete cabinet replacement including base, upper, and island units",
                "Mid-range appliances selected - Whirlpool/GE tier",
                "Level 2 granite countertops match mid-range finish level",
                "Full electrical update with LED lighting"
            ],
            "materialHighlights": [
                "Granite countertops - Level 2",
                "Shaker style maple cabinets",
                "Engineered hardwood flooring"
            ],
            "complexityFactors": [
                "Standard L-shaped layout with island",
                "No plumbing relocation required"
            ],
            "finishLevelAssessment": "Material selections are appropriate for mid-range finish level. Granite countertops, quality cabinetry, and mid-range appliances all align with stated budget tier.",
            "recommendations": [
                "Verify cabinet dimensions against final layout",
                "Confirm appliance selections with client before ordering"
            ]
        },
        "confidence": 0.89,
        "summary": "Kitchen remodel with 32 line items across 8 CSI divisions. Mid-range finish level."
    }


# =============================================================================
# INCOMPLETE SCOPE OUTPUT (FOR TESTING SCORER/CRITIC)
# =============================================================================

def get_incomplete_scope_output() -> Dict[str, Any]:
    """Get an incomplete scope output for testing scorer/critic."""
    return {
        "estimateId": "est-test-incomplete",
        "projectType": "kitchen_remodel",
        "finishLevel": "mid_range",
        "totalSqft": 196,
        "divisions": [
            {
                "divisionCode": "06",
                "divisionName": "Wood, Plastics, Composites",
                "status": "included",
                "description": "Cabinets",
                "lineItems": [
                    {
                        "id": "06-001",
                        "item": "Base cabinets",
                        "quantity": 16,
                        "unit": "lf",
                        "costCode": "GEN-06-001",  # Generic code
                        "costCodeDescription": "General cabinet work",
                        "costCodeConfidence": 0.5,
                        "materialCostPerUnit": 175.0,
                        "laborHoursPerUnit": 1.0,
                        "primaryTrade": "carpenter",
                        "quantityValidation": "estimated",
                        "estimatedMaterialCost": 2800,
                        "estimatedLaborHours": 16.0,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 2800,
                "subtotalLaborHours": 16.0,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0.5
            },
            {
                "divisionCode": "09",
                "divisionName": "Finishes",
                "status": "included",
                "description": "Flooring",
                "lineItems": [
                    {
                        "id": "09-001",
                        "item": "Flooring",
                        "quantity": 0,  # Missing quantity!
                        "unit": "sf",
                        "costCode": "",  # Missing cost code!
                        "costCodeDescription": "",
                        "costCodeConfidence": 0,
                        "materialCostPerUnit": 0,
                        "laborHoursPerUnit": 0,
                        "primaryTrade": "flooring_installer",
                        "quantityValidation": "needs_verification",
                        "estimatedMaterialCost": 0,
                        "estimatedLaborHours": 0,
                        "estimatedEquipmentCost": 0
                    }
                ],
                "subtotalMaterialCost": 0,
                "subtotalLaborHours": 0,
                "subtotalEquipmentCost": 0,
                "itemCount": 1,
                "averageConfidence": 0
            }
        ],
        "totalLineItems": 2,
        "totalIncludedDivisions": 2,
        "totalExcludedDivisions": 0,
        "preliminaryMaterialCost": 2800,
        "preliminaryLaborHours": 16.0,
        "preliminaryEquipmentCost": 0,
        "completeness": {
            "allItemsHaveCostCodes": False,
            "allItemsHaveQuantities": False,
            "allRequiredDivisionsPresent": False,
            "quantityValidationComplete": False,
            "costCodeCoverage": 0.5,
            "quantityValidationCoverage": 0,
            "warnings": [
                "Missing expected divisions for kitchen_remodel: 01, 02, 11, 12, 22, 26",
                "Only 50% of items have cost codes assigned"
            ],
            "missingItems": [],
            "suggestedAdditions": []
        },
        "analysis": {
            "summary": "Incomplete kitchen scope.",
            "keyObservations": [],
            "materialHighlights": [],
            "complexityFactors": [],
            "finishLevelAssessment": "",
            "recommendations": []
        },
        "confidence": 0.35,
        "summary": "Incomplete kitchen scope."
    }


# =============================================================================
# A2A REQUEST HELPERS
# =============================================================================

def get_scope_agent_a2a_request(
    estimate_id: str = "est-test-001"
) -> Dict[str, Any]:
    """Build a mock A2A request for the scope agent."""
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
                            "input": get_kitchen_clarification_input()
                        }
                    }
                ]
            },
            "context": {
                "thread_id": estimate_id
            }
        }
    }


def get_scope_scorer_a2a_request(
    estimate_id: str = "est-test-001",
    output: Dict[str, Any] = None,
    input_data: Dict[str, Any] = None
) -> Dict[str, Any]:
    """Build a mock A2A request for the scope scorer."""
    if output is None:
        output = get_valid_scope_output()
    if input_data is None:
        input_data = get_kitchen_clarification_input()
    
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
                            "agent_name": "scope",
                            "output": output,
                            "input": input_data
                        }
                    }
                ]
            }
        }
    }


def get_scope_critic_a2a_request(
    estimate_id: str = "est-test-001",
    output: Dict[str, Any] = None,
    input_data: Dict[str, Any] = None,
    score: int = 55,
    scorer_feedback: str = "Below standard output"
) -> Dict[str, Any]:
    """Build a mock A2A request for the scope critic."""
    if output is None:
        output = get_incomplete_scope_output()
    if input_data is None:
        input_data = get_kitchen_clarification_input()
    
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
                            "agent_name": "scope",
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




