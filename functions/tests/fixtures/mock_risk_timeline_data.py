"""Mock Risk, Timeline, and Final Agent data fixtures for testing.

Provides mock data for PR #7 agents: Risk, Timeline, and Final.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List


# =============================================================================
# MOCK COST OUTPUT (FROM COST AGENT)
# =============================================================================


def get_mock_cost_output() -> Dict[str, Any]:
    """Get sample cost output for risk and final agent tests."""
    return {
        "estimateId": "test-estimate-001",
        "boqLineItemCount": 15,
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
        "confidence": 0.85
    }


# =============================================================================
# MOCK LOCATION OUTPUT (FROM LOCATION AGENT)
# =============================================================================


def get_mock_location_output() -> Dict[str, Any]:
    """Get sample location output for tests."""
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
            "general_labor": 36.0,
        },
        "isUnion": False,
        "unionStatus": "mixed",
        "permitCosts": {
            "buildingPermitBase": 500.0,
            "electricalPermit": 175.0,
            "plumbingPermit": 175.0,
        },
        "locationFactor": 1.05,
        "weatherFactors": {
            "winterImpact": "moderate",
            "seasonalAdjustment": 1.05,
        },
        "confidence": 0.92,
        "summary": "Denver, CO (80202) - Mountain region with mixed union market."
    }


# =============================================================================
# MOCK SCOPE OUTPUT (FROM SCOPE AGENT)
# =============================================================================


def get_mock_scope_output() -> Dict[str, Any]:
    """Get sample scope output for tests."""
    return {
        "estimateId": "test-estimate-001",
        "projectType": "kitchen_remodel",
        "finishLevel": "mid-range",
        "totalSqft": 196,
        "divisions": [
            {"divisionCode": "01", "divisionName": "General Requirements", "itemCount": 2},
            {"divisionCode": "02", "divisionName": "Existing Conditions", "itemCount": 2},
            {"divisionCode": "06", "divisionName": "Wood, Plastics, Composites", "itemCount": 2},
            {"divisionCode": "11", "divisionName": "Equipment", "itemCount": 3},
            {"divisionCode": "22", "divisionName": "Plumbing", "itemCount": 2},
            {"divisionCode": "26", "divisionName": "Electrical", "itemCount": 3},
        ],
        "totalLineItems": 15,
        "totalIncludedDivisions": 7,
        "preliminaryMaterialCost": 13158,
        "preliminaryLaborHours": 192.7,
        "confidence": 0.85,
        "summary": "Kitchen remodel with 15 line items across 7 divisions."
    }


# =============================================================================
# MOCK CLARIFICATION OUTPUT
# =============================================================================


def get_mock_clarification_output() -> Dict[str, Any]:
    """Get sample clarification output for tests."""
    return {
        "estimateId": "test-estimate-001",
        "schemaVersion": "3.0.0",
        "projectBrief": {
            "projectType": "kitchen_remodel",
            "location": {
                "zipCode": "80202",
                "city": "Denver",
                "state": "CO"
            },
            "scopeSummary": {
                "totalSqft": 196,
                "finishLevel": "mid-range"
            },
            "timeline": {
                # Required by TimelineAgent (no default "2 weeks from now" fallback)
                "desiredStart": "2025-02-01",
                "flexibilityDays": 14,
            },
        }
    }


# =============================================================================
# VALID RISK OUTPUT
# =============================================================================


def get_valid_risk_output() -> Dict[str, Any]:
    """Get a complete, valid risk output."""
    return {
        "estimateId": "test-estimate-001",
        "baseCost": 29283.6,
        "monteCarlo": {
            "iterations": 1000,
            "p50": 29283.6,
            "p80": 32797.63,
            "p90": 35067.77,
            "mean": 30542.15,
            "stdDev": 3254.82,
            "min": 26355.24,
            "max": 40822.50
        },
        "contingency": {
            "recommended": 12.0,
            "dollarAmount": 3514.03,
            "rationale": "Based on P80 confidence level - industry standard conservative estimate",
            "confidenceLevel": "P80"
        },
        "topRisks": [
            {
                "id": "RF001",
                "item": "Material Price Volatility",
                "description": "Supply chain issues may affect material costs",
                "category": "material_cost",
                "impact": "high",
                "probability": 0.35,
                "costImpactLow": 585.67,
                "costImpactHigh": 4392.54,
                "varianceContribution": 0.28,
                "mitigation": "Lock in prices early with suppliers"
            },
            {
                "id": "RF005",
                "item": "Scope Changes",
                "description": "Client-requested changes during construction",
                "category": "scope_change",
                "impact": "high",
                "probability": 0.45,
                "costImpactLow": 1464.18,
                "costImpactHigh": 5856.72,
                "varianceContribution": 0.25,
                "mitigation": "Detailed scope documentation and change order process"
            },
            {
                "id": "RF002",
                "item": "Labor Availability",
                "description": "Skilled labor shortages in the area",
                "category": "labor_availability",
                "impact": "medium",
                "probability": 0.40,
                "costImpactLow": 878.51,
                "costImpactHigh": 3514.03,
                "varianceContribution": 0.18,
                "mitigation": "Book contractors early"
            },
            {
                "id": "RF003",
                "item": "Weather Delays",
                "description": "Adverse weather conditions may delay work",
                "category": "weather",
                "impact": "medium",
                "probability": 0.25,
                "costImpactLow": 292.84,
                "costImpactHigh": 2342.69,
                "varianceContribution": 0.12,
                "mitigation": "Schedule weather-sensitive work appropriately"
            },
            {
                "id": "RF004",
                "item": "Permit Delays",
                "description": "Municipal permitting may take longer",
                "category": "permit",
                "impact": "low",
                "probability": 0.30,
                "costImpactLow": 292.84,
                "costImpactHigh": 1464.18,
                "varianceContribution": 0.08,
                "mitigation": "Submit permits early"
            }
        ],
        "confidenceRange": {
            "p50": 29283.6,
            "p80": 32797.63,
            "p90": 35067.77,
            "low": 26355.24,
            "likely": 29283.6,
            "high": 35067.77
        },
        "summary": "Risk analysis: P50=$29,284, P80=$32,798, Contingency=12%",
        "riskLevel": "Medium",
        "keyFindings": [
            "Cost range from $26,355 to $35,068 (20% spread)",
            "2 high-impact risks identified with significant probability",
            "'Material Price Volatility' contributes 28% of cost variance"
        ],
        "recommendations": [
            "Lock in material prices early",
            "Establish change order process",
            "Build 2-week buffer into schedule"
        ],
        "analysisConfidence": "medium"
    }


# =============================================================================
# INVALID RISK OUTPUT (BAD PERCENTILES)
# =============================================================================


def get_invalid_percentiles_output() -> Dict[str, Any]:
    """Get risk output with invalid percentile ordering."""
    output = get_valid_risk_output()
    # Make percentiles out of order
    output["monteCarlo"]["p50"] = 35000
    output["monteCarlo"]["p80"] = 30000
    output["monteCarlo"]["p90"] = 32000
    return output


# =============================================================================
# VALID TIMELINE OUTPUT
# =============================================================================


def get_valid_timeline_output() -> Dict[str, Any]:
    """Get a complete, valid timeline output."""
    start = datetime.now() + timedelta(days=14)
    
    return {
        "estimateId": "test-estimate-001",
        "generatedDate": datetime.now().isoformat(),
        "startDate": start.isoformat(),
        "endDate": (start + timedelta(days=25)).isoformat(),
        "tasks": [
            {
                "id": "task-01",
                "name": "Permits & Planning",
                "phase": "preconstruction",
                "duration": 5,
                "start": start.isoformat(),
                "end": (start + timedelta(days=5)).isoformat(),
                "dependencies": [],
                "isCritical": True,
                "isMilestone": False,
                "trade": "general",
                "laborHours": 40
            },
            {
                "id": "task-02",
                "name": "Demolition",
                "phase": "demolition",
                "duration": 2,
                "start": (start + timedelta(days=5)).isoformat(),
                "end": (start + timedelta(days=7)).isoformat(),
                "dependencies": ["task-01"],
                "isCritical": True,
                "isMilestone": False,
                "trade": "demolition",
                "laborHours": 16
            },
            {
                "id": "task-03",
                "name": "Rough-In",
                "phase": "rough_in",
                "duration": 4,
                "start": (start + timedelta(days=7)).isoformat(),
                "end": (start + timedelta(days=11)).isoformat(),
                "dependencies": ["task-02"],
                "isCritical": True,
                "isMilestone": False,
                "trade": "plumber",
                "laborHours": 32
            },
            {
                "id": "task-04",
                "name": "Drywall",
                "phase": "drywall",
                "duration": 3,
                "start": (start + timedelta(days=11)).isoformat(),
                "end": (start + timedelta(days=14)).isoformat(),
                "dependencies": ["task-03"],
                "isCritical": True,
                "isMilestone": False,
                "trade": "drywall_installer",
                "laborHours": 24
            },
            {
                "id": "task-05",
                "name": "Finish Work",
                "phase": "finish",
                "duration": 7,
                "start": (start + timedelta(days=14)).isoformat(),
                "end": (start + timedelta(days=21)).isoformat(),
                "dependencies": ["task-04"],
                "isCritical": True,
                "isMilestone": False,
                "trade": "cabinet_installer",
                "laborHours": 56
            },
            {
                "id": "task-06",
                "name": "Final Inspection",
                "phase": "final_inspection",
                "duration": 1,
                "start": (start + timedelta(days=21)).isoformat(),
                "end": (start + timedelta(days=22)).isoformat(),
                "dependencies": ["task-05"],
                "isCritical": True,
                "isMilestone": True,
                "trade": "general",
                "laborHours": 8
            }
        ],
        "milestones": [
            {"id": "ms-1", "name": "Project Start", "date": start.isoformat()},
            {"id": "ms-2", "name": "Rough-In Complete", "date": (start + timedelta(days=11)).isoformat()},
            {"id": "ms-3", "name": "Project Complete", "date": (start + timedelta(days=22)).isoformat()}
        ],
        "criticalPath": ["task-01", "task-02", "task-03", "task-04", "task-05", "task-06"],
        "totalDuration": 22,
        "totalCalendarDays": 30,
        "durationRange": {
            "optimistic": 19,
            "expected": 22,
            "pessimistic": 30
        },
        "weatherImpact": {
            "expectedDelayDays": 2,
            "bufferDays": 4,
            "riskLevel": "low"
        },
        "summary": "Project duration: 22 working days (4.4 weeks)",
        "assumptions": [
            "Standard 5-day work week",
            "Normal weather conditions",
            "Materials available as scheduled"
        ],
        "scheduleRisks": [
            "Material lead times may vary",
            "Inspection delays possible"
        ],
        "confidence": 0.80
    }


# =============================================================================
# INVALID TIMELINE OUTPUT (NO TASKS)
# =============================================================================


def get_invalid_timeline_output() -> Dict[str, Any]:
    """Get timeline output with missing tasks."""
    return {
        "estimateId": "test-estimate-001",
        "generatedDate": datetime.now().isoformat(),
        "startDate": "",
        "endDate": "",
        "tasks": [],
        "milestones": [],
        "criticalPath": [],
        "totalDuration": 0,
        "totalCalendarDays": 0,
        "summary": "",
        "confidence": 0.0
    }


# =============================================================================
# VALID FINAL OUTPUT
# =============================================================================


def get_valid_final_output() -> Dict[str, Any]:
    """Get a complete, valid final estimate output."""
    start = datetime.now() + timedelta(days=14)
    
    return {
        "estimateId": "test-estimate-001",
        "generatedAt": datetime.now().isoformat(),
        "version": "1.0",
        "executiveSummary": {
            "projectType": "kitchen_remodel",
            "location": "Denver, CO",
            "sizeSqft": 196,
            "finishLevel": "mid-range",
            "totalCost": 35892.78,
            "baseCost": 32378.75,
            "contingency": 3514.03,
            "contingencyPercent": 12.0,
            "costPerSqft": 183.13,
            "confidenceRange": {
                "p50": 29283.6,
                "p80": 32797.63,
                "p90": 35067.77
            },
            "duration": 22,
            "durationWeeks": 4.4,
            "startDate": start.isoformat(),
            "endDate": (start + timedelta(days=22)).isoformat(),
            "confidence": "medium",
            "complexity": "moderate"
        },
        "costBreakdown": {
            "materials": 13158.0,
            "labor": 7500.0,
            "equipment": 450.0,
            "directCostsSubtotal": 21108.0,
            "overhead": 2216.34,
            "profit": 2437.97,
            "contingency": 3514.03,
            "contingencyPercentage": 12.0,
            "permits": 1125.0,
            "taxes": 0,
            "totalBeforeContingency": 32378.75,
            "totalWithContingency": 35892.78
        },
        "timeline": {
            "totalDays": 22,
            "totalWeeks": 4.4,
            "startDate": start.isoformat(),
            "endDate": (start + timedelta(days=22)).isoformat(),
            "milestones": [
                {"name": "Project Start", "date": start.isoformat()},
                {"name": "Rough-In Complete", "date": (start + timedelta(days=11)).isoformat()},
                {"name": "Project Complete", "date": (start + timedelta(days=22)).isoformat()}
            ],
            "durationRange": {
                "optimistic": 19,
                "pessimistic": 30
            }
        },
        "riskSummary": {
            "riskLevel": "Medium",
            "topRisks": ["Material Price Volatility", "Scope Changes", "Labor Availability"],
            "contingencyRationale": "Based on P80 confidence level",
            "mitigationStrategies": ["Lock in material prices", "Detailed scope documentation"]
        },
        "recommendations": [
            {
                "category": "cost",
                "title": "Lock in material prices early",
                "description": "Contact suppliers to lock pricing before project start",
                "priority": "high",
                "potentialSavings": 500
            },
            {
                "category": "schedule",
                "title": "Book contractors early",
                "description": "Secure contractor commitments 2-3 weeks before start",
                "priority": "high",
                "potentialSavings": None
            },
            {
                "category": "risk",
                "title": "Maintain contingency buffer",
                "description": "Do not allocate contingency to known costs",
                "priority": "medium",
                "potentialSavings": None
            }
        ],
        "assumptions": [
            "Standard working hours (no overtime)",
            "Materials at current market prices",
            "Normal site access and conditions"
        ],
        "exclusions": [
            "Furniture and decor",
            "Landscaping",
            "Financing costs"
        ],
        "disclaimers": [
            "This estimate is based on information provided and current market conditions.",
            "Pricing is valid for 30 days from estimate date."
        ],
        "dataQuality": {
            "completeness": 0.85,
            "costDataQuality": "high"
        },
        "summary": "Final estimate: $35,893 (Kitchen Remodel) over 4.4 weeks"
    }


# =============================================================================
# INCOMPLETE FINAL OUTPUT
# =============================================================================


def get_incomplete_final_output() -> Dict[str, Any]:
    """Get final output missing key sections."""
    return {
        "estimateId": "test-estimate-001",
        "generatedAt": datetime.now().isoformat(),
        "executiveSummary": {
            "totalCost": 35892.78,
            "location": "Denver, CO"
            # Missing many fields
        },
        "costBreakdown": {},  # Empty
        "timeline": {},  # Empty
        "riskSummary": {},  # Empty
        "recommendations": [],  # Empty
        "assumptions": [],
        "disclaimers": [],
        "summary": ""
    }


# =============================================================================
# A2A REQUEST BUILDERS
# =============================================================================


def get_risk_agent_a2a_request() -> Dict[str, Any]:
    """Build A2A request for Risk Agent."""
    return {
        "jsonrpc": "2.0",
        "method": "message/send",
        "params": {
            "message": {
                "type": "request",
                "data": {
                    "estimate_id": "test-estimate-001",
                    "clarification_output": get_mock_clarification_output(),
                    "location_output": get_mock_location_output(),
                    "scope_output": get_mock_scope_output(),
                    "cost_output": get_mock_cost_output()
                }
            }
        },
        "id": "test-risk-request-001"
    }


def get_timeline_agent_a2a_request() -> Dict[str, Any]:
    """Build A2A request for Timeline Agent."""
    return {
        "jsonrpc": "2.0",
        "method": "message/send",
        "params": {
            "message": {
                "type": "request",
                "data": {
                    "estimate_id": "test-estimate-001",
                    "clarification_output": get_mock_clarification_output(),
                    "location_output": get_mock_location_output(),
                    "scope_output": get_mock_scope_output(),
                    "cost_output": get_mock_cost_output()
                }
            }
        },
        "id": "test-timeline-request-001"
    }


def get_final_agent_a2a_request() -> Dict[str, Any]:
    """Build A2A request for Final Agent."""
    return {
        "jsonrpc": "2.0",
        "method": "message/send",
        "params": {
            "message": {
                "type": "request",
                "data": {
                    "estimate_id": "test-estimate-001",
                    "clarification_output": get_mock_clarification_output(),
                    "location_output": get_mock_location_output(),
                    "scope_output": get_mock_scope_output(),
                    "cost_output": get_mock_cost_output(),
                    "risk_output": get_valid_risk_output(),
                    "timeline_output": get_valid_timeline_output()
                }
            }
        },
        "id": "test-final-request-001"
    }



