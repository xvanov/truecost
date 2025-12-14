# Dev 2 → Dev 4 Integration Specification

**Version:** 1.0.0
**Date:** 2025-12-10
**Author:** Paige (Technical Writer)
**Purpose:** Define the exact output format Dev 2's Deep Agent Pipeline must produce for seamless integration with Dev 4's PDF Generation (Story 4.3) and Monte Carlo (Story 4.2) services.

---

## Overview

This document specifies the **exact data structures** that Dev 2's Final Agent must output so that Dev 4's services work **plug-and-play** without modification.

**Integration Flow:**
```
Dev 2 Pipeline → Firestore `/estimates/{id}` → Dev 4 PDF Generator
                                             ↓
                Dev 4 Monte Carlo ← Final Agent Inputs
```

---

## Quick Reference: Required Fields

| Field Path | Type | Required | Description |
|------------|------|----------|-------------|
| `projectName` | string | Yes | Display name for estimate |
| `address` | string | Yes | Full project address |
| `projectType` | string | Yes | e.g., "Residential Renovation" |
| `totalCost` | number | Yes | Base estimate (P50) |
| `p50` | number | Yes | 50th percentile from Monte Carlo |
| `p80` | number | Yes | 80th percentile |
| `p90` | number | Yes | 90th percentile |
| `contingencyPct` | number | Yes | Recommended contingency % |
| `timelineWeeks` | number | Yes | Project duration |
| `laborAnalysis` | object | Yes | Trades breakdown |
| `schedule` | object | Yes | Task list |
| `cost_breakdown` | object | Yes | CSI division costs |
| `risk_analysis` | object | Yes | Monte Carlo results |
| `bill_of_quantities` | object | Yes | Line items |
| `assumptions` | object | Yes | Inclusions/exclusions |

---

## Detailed Schema Specifications

### 1. Root Estimate Document

Store at: **`/estimates/{estimateId}`**

```python
{
    # Identification
    "estimate_id": "demo_kitchen_2024",  # string, unique ID

    # Project Information (Required for PDF header)
    "projectName": "Kitchen Remodel - 123 Main St",     # string
    "address": "123 Main Street, Denver, CO 80202",     # string, full address
    "projectType": "Residential Renovation",            # string
    "scope": "Full kitchen remodel including...",       # string, description
    "squareFootage": 200,                               # number

    # Cost Summary (Required for Executive Summary)
    "totalCost": 34500.00,           # number, base estimate (use P50)
    "p50": 34500.00,                 # number, 50th percentile
    "p80": 37950.00,                 # number, 80th percentile
    "p90": 39675.00,                 # number, 90th percentile
    "contingencyPct": 10.0,          # number, recommended %
    "timelineWeeks": 6,              # number, project duration
    "monteCarloIterations": 1000,    # number, iterations run

    # Internal Notes (hidden in client-ready PDF)
    "internalNotes": "Client prefers modern farmhouse style...",  # string, optional

    # Cost Drivers (for summary chart)
    "costDrivers": [
        {"name": "Cabinetry", "cost": 4500, "percentage": 10},
        {"name": "Appliances", "cost": 3500, "percentage": 8},
        {"name": "Countertops", "cost": 3400, "percentage": 8},
        {"name": "Labor", "cost": 12075, "percentage": 35}
    ],

    # Sub-objects (detailed below)
    "laborAnalysis": {...},
    "schedule": {...},
    "cost_breakdown": {...},
    "risk_analysis": {...},
    "bill_of_quantities": {...},
    "assumptions": {...},
    "cad_data": null  # or CAD object if available
}
```

---

### 2. Labor Analysis Object

**Path:** `laborAnalysis`

```python
{
    "total_hours": 240,           # number, total labor hours
    "base_total": 11536,          # number, base labor cost (no burden)
    "burden_total": 4038,         # number, benefits burden (35%)
    "total": 15574,               # number, base + burden
    "labor_pct": 35,              # number, % of total estimate
    "estimated_days": 30,         # number, working days

    "trades": [
        {
            "name": "Carpenter",           # string, trade name
            "hours": 80.0,                 # number, hours
            "rate": 52.00,                 # number, hourly rate
            "base_cost": 4160,             # number, hours * rate
            "burden": 1456,                # number, 35% of base
            "total": 5616                  # number, base + burden
        },
        {
            "name": "Electrician",
            "hours": 32.0,
            "rate": 65.00,
            "base_cost": 2080,
            "burden": 728,
            "total": 2808
        },
        {
            "name": "Plumber",
            "hours": 24.0,
            "rate": 62.00,
            "base_cost": 1488,
            "burden": 521,
            "total": 2009
        },
        {
            "name": "Painter",
            "hours": 40.0,
            "rate": 40.00,
            "base_cost": 1600,
            "burden": 560,
            "total": 2160
        },
        {
            "name": "Tile Setter",
            "hours": 16.0,
            "rate": 48.00,
            "base_cost": 768,
            "burden": 269,
            "total": 1037
        },
        {
            "name": "General Labor",
            "hours": 48.0,
            "rate": 30.00,
            "base_cost": 1440,
            "burden": 504,
            "total": 1944
        }
    ],

    "location_factors": {
        "is_union": false,         # boolean
        "union_premium": 1.0       # number, multiplier (1.0 = no premium)
    }
}
```

**Trade Names (Standardized):**
- Carpenter
- Electrician
- Plumber
- HVAC Tech
- Roofer
- Painter
- Tile Setter
- General Labor

---

### 3. Schedule Object

**Path:** `schedule`

```python
{
    "total_weeks": 6,                        # number
    "start_date": "Upon contract signing",   # string
    "end_date": "6 weeks from start",        # string

    "tasks": [
        {
            "number": 1,                          # int or string (1, "1.1", etc.)
            "name": "Pre-Construction",           # string, task name
            "duration": "1 week",                 # string, human-readable
            "start": "Week 1",                    # string
            "end": "Week 1",                      # string
            "is_milestone": true,                 # boolean, optional
            "dependencies": []                    # list of strings
        },
        {
            "number": "1.1",
            "name": "Permits & Approvals",
            "duration": "3-5 days",
            "start": "Day 1",
            "end": "Day 5",
            "dependencies": ["Contract signed"]
        },
        {
            "number": 2,
            "name": "Demolition",
            "duration": "2-3 days",
            "start": "Week 2",
            "end": "Week 2",
            "is_milestone": true,
            "dependencies": ["Pre-construction"]
        }
        # ... continue for all tasks
    ],

    "notes": [
        "Schedule assumes normal weather conditions",
        "Permit timeline may vary (typically 3-10 business days)",
        "Cabinet lead time: 2-3 weeks (order placed during pre-construction)",
        "Appliance delivery coordinated for Week 5"
    ]
}
```

---

### 4. Cost Breakdown Object

**Path:** `cost_breakdown`

```python
{
    # Summary totals
    "total_material": 18975.00,      # number
    "total_labor": 12075.00,         # number
    "permits": 1035.00,              # number
    "overhead": 2415.00,             # number (for O&P line - hidden in client mode)

    # Percentages
    "material_pct": 55,              # number
    "labor_pct": 35,                 # number
    "permits_pct": 3,                # number
    "overhead_pct": 7,               # number

    # Breakdown by CSI Division
    "divisions": [
        {
            "code": "06",                              # string, CSI code
            "name": "Wood, Plastics, and Composites",  # string
            "total": 4900,                             # number
            "material_subtotal": 3600,                 # number
            "labor_subtotal": 1300,                    # number
            "items": [
                {
                    "description": "Hardwood Flooring",   # string
                    "quantity": 200,                      # number
                    "unit": "sf",                         # string
                    "unit_cost": 12.00,                   # number
                    "material_cost": 2400,                # number
                    "labor_cost": 800                     # number
                },
                {
                    "description": "Trim and Molding",
                    "quantity": 60,
                    "unit": "lf",
                    "unit_cost": 3.50,
                    "material_cost": 210,
                    "labor_cost": 200
                }
            ]
        },
        {
            "code": "09",
            "name": "Finishes",
            "total": 1300,
            "material_subtotal": 880,
            "labor_subtotal": 420,
            "items": [
                {
                    "description": "Interior Paint, 2 coats",
                    "quantity": 500,
                    "unit": "sf",
                    "unit_cost": 1.25,
                    "material_cost": 625,
                    "labor_cost": 300
                },
                {
                    "description": "Backsplash Tile",
                    "quantity": 30,
                    "unit": "sf",
                    "unit_cost": 8.50,
                    "material_cost": 255,
                    "labor_cost": 120
                }
            ]
        },
        {
            "code": "12",
            "name": "Furnishings",
            "total": 7900,
            "material_subtotal": 6400,
            "labor_subtotal": 1500,
            "items": [
                {
                    "description": "Kitchen Cabinets",
                    "quantity": 20,
                    "unit": "lf",
                    "unit_cost": 225.00,
                    "material_cost": 4500,
                    "labor_cost": 1000
                },
                {
                    "description": "Granite Countertops",
                    "quantity": 40,
                    "unit": "sf",
                    "unit_cost": 85.00,
                    "material_cost": 3400,
                    "labor_cost": 500
                }
            ]
        }
    ]
}
```

**CSI Division Codes:**
- 01 - General Requirements
- 02 - Existing Conditions (Demolition)
- 03 - Concrete
- 06 - Wood, Plastics, and Composites
- 07 - Thermal and Moisture Protection
- 08 - Openings (Doors & Windows)
- 09 - Finishes
- 10 - Specialties
- 11 - Equipment (Appliances)
- 12 - Furnishings (Cabinets)
- 22 - Plumbing
- 23 - HVAC
- 26 - Electrical

---

### 5. Risk Analysis Object

**Path:** `risk_analysis`

This is the **most critical** object for PDF generation. The Monte Carlo service produces this exact structure.

```python
{
    "iterations": 1000,              # number, simulations run
    "p50": 34500.00,                 # number, median
    "p80": 37950.00,                 # number, 80th percentile
    "p90": 39675.00,                 # number, 90th percentile
    "contingency_pct": 10.0,         # number, recommended contingency
    "contingency_amount": 3450.00,   # number, p50 * contingency_pct / 100
    "min": 29000.00,                 # number, minimum from simulation
    "max": 48000.00,                 # number, maximum from simulation
    "max_percentage": 18.5,          # number, highest histogram bin % (for chart scaling)

    # Histogram data for chart visualization
    "histogram": [
        {
            "range_low": 29000.00,     # number
            "range_high": 30900.00,    # number
            "count": 15,               # number, iterations in this bin
            "percentage": 1.5          # number, % of total
        },
        {
            "range_low": 30900.00,
            "range_high": 32800.00,
            "count": 45,
            "percentage": 4.5
        },
        # ... 20 bins total (default)
        {
            "range_low": 46100.00,
            "range_high": 48000.00,
            "count": 8,
            "percentage": 0.8
        }
    ],

    # Top 5 risk factors sorted by impact
    "top_risks": [
        {
            "item": "Appliance package",         # string, line item description
            "impact": 2000.00,                   # number, $ impact
            "probability": 0.33,                 # number, 0-1
            "sensitivity": 0.85                  # number, correlation coefficient
        },
        {
            "item": "Cabinet installation",
            "impact": 1500.00,
            "probability": 0.33,
            "sensitivity": 0.78
        },
        {
            "item": "Electrical rough-in",
            "impact": 1000.00,
            "probability": 0.33,
            "sensitivity": 0.72
        },
        {
            "item": "Plumbing rough-in",
            "impact": 800.00,
            "probability": 0.33,
            "sensitivity": 0.68
        },
        {
            "item": "Countertop materials (granite)",
            "impact": 700.00,
            "probability": 0.33,
            "sensitivity": 0.65
        }
    ]
}
```

**Monte Carlo Input Format:**

To generate this data, call Dev 4's Monte Carlo service with:

```python
from services.monte_carlo import run_simulation, LineItemInput

line_items = [
    LineItemInput(
        id="1",                     # string, unique ID
        description="Cabinet installation",  # string, for risk display
        quantity=20.0,              # number, quantity
        unit_cost_low=175.0,        # number, optimistic
        unit_cost_likely=225.0,     # number, most likely
        unit_cost_high=350.0        # number, pessimistic
    ),
    LineItemInput(
        id="2",
        description="Countertop materials (granite)",
        quantity=40.0,
        unit_cost_low=65.0,
        unit_cost_likely=85.0,
        unit_cost_high=125.0
    ),
    # ... all line items
]

result = run_simulation(line_items, iterations=1000)

# result contains: p50, p80, p90, recommended_contingency, top_risks, histogram
```

---

### 6. Bill of Quantities Object

**Path:** `bill_of_quantities`

```python
{
    "items": [
        {
            "line_number": 1,                                    # int
            "description": "Kitchen Cabinets, wood, standard",   # string
            "quantity": 20.0,                                    # number
            "unit": "lf",                                        # string
            "unit_cost": 225.00,                                 # number
            "total": 4500,                                       # number
            "csi_division": "12"                                 # string
        },
        {
            "line_number": 2,
            "description": "Countertops, granite, standard",
            "quantity": 40.0,
            "unit": "sf",
            "unit_cost": 85.00,
            "total": 3400,
            "csi_division": "12"
        },
        {
            "line_number": 3,
            "description": "Interior Paint, latex, 2 coats",
            "quantity": 500.0,
            "unit": "sf",
            "unit_cost": 1.25,
            "total": 625,
            "csi_division": "09"
        },
        # ... all line items
        {
            "line_number": 20,
            "description": "Contingency Allowance",
            "quantity": 1.0,
            "unit": "ls",
            "unit_cost": 1500.00,
            "total": 1500,
            "csi_division": "01"
        }
    ],

    "subtotal": 31050.00,        # number, sum of all items
    "permits": 1035.00,          # number
    "overhead": 2415.00,         # number (O&P)
    "markup_pct": 7              # number
}
```

**Unit Abbreviations:**
- `sf` - square feet
- `lf` - linear feet
- `ea` - each
- `ls` - lump sum
- `set` - set
- `hr` - hour
- `cy` - cubic yard

---

### 7. Assumptions Object

**Path:** `assumptions`

```python
{
    "items": [
        "Site access is adequate for material delivery and crew parking",
        "Work performed during normal business hours (8am-5pm, Monday-Friday)",
        "No hidden damage, asbestos, lead paint, or mold present",
        "All required permits will be obtainable within 5 business days",
        "Existing electrical panel has adequate capacity for new loads",
        "Existing plumbing can support new fixture locations",
        "Material prices valid for 30 days from estimate date",
        "Client will make timely decisions on selections"
    ],

    "inclusions": [
        "All materials, labor, and equipment as specified",
        "Project management and site supervision",
        "Permit fees and inspection costs",
        "Standard 1-year workmanship warranty",
        "Daily cleanup and final construction cleaning",
        "Dumpster rental and debris disposal",
        "Protection of adjacent surfaces during construction"
    ],

    "exclusions": [
        {
            "category": "Structural Work",      # string
            "items": [                          # list of strings
                "Load-bearing wall modifications",
                "Foundation repairs",
                "Structural engineering"
            ]
        },
        {
            "category": "Hazardous Materials",
            "items": [
                "Asbestos abatement",
                "Lead paint remediation",
                "Mold remediation"
            ]
        },
        {
            "category": "HVAC",
            "items": [
                "HVAC system replacement",
                "Ductwork modifications"
            ]
        },
        {
            "category": "Appliances",
            "items": [
                "Appliance delivery beyond curb",
                "Installation of owner-supplied appliances"
            ]
        }
    ]
}
```

---

### 8. CAD Data Object (Optional)

**Path:** `cad_data`

Set to `null` if no CAD is available. If present:

```python
{
    "file_url": "gs://bucket/cad/est123/floor_plan.pdf",  # string
    "extracted_measurements": {
        "rooms": [
            {"name": "Kitchen", "sqft": 200, "width": 15, "length": 13.3}
        ],
        "walls": [
            {"length": 15, "height": 9, "type": "interior"}
        ],
        "openings": [
            {"type": "window", "width": 4, "height": 3}
        ]
    },
    "image_url": "gs://bucket/cad/est123/annotated.png",  # for PDF inclusion
    "extraction_method": "vision"  # or "ezdxf"
}
```

---

## Validation Checklist

Before calling PDF generation, verify:

- [ ] `projectName` is set (non-empty string)
- [ ] `address` is set (non-empty string)
- [ ] `p50`, `p80`, `p90` are all numbers > 0
- [ ] `p50 <= p80 <= p90` (valid percentile order; ties are possible depending on rounding/discrete outputs)
- [ ] `contingencyPct` is between 0 and 50
- [ ] `laborAnalysis.trades` has at least 1 trade
- [ ] `schedule.tasks` has at least 1 task
- [ ] `cost_breakdown.divisions` has at least 1 division
- [ ] `risk_analysis.histogram` has 10-30 bins
- [ ] `risk_analysis.top_risks` has 1-5 items
- [ ] `bill_of_quantities.items` has at least 1 item
- [ ] `assumptions.items` has at least 1 assumption

---

## API Call to Generate PDF

After storing the estimate document in Firestore:

```python
from services.pdf_generator import generate_pdf

# Generate contractor PDF
result = await generate_pdf(
    estimate_id="est_12345",
    sections=None,  # All sections
    client_ready=False
)

print(result.pdf_url)  # Download URL

# Generate client PDF
client_result = await generate_pdf(
    estimate_id="est_12345",
    sections=None,
    client_ready=True  # Hides O&P, Monte Carlo details
)
```

---

## Testing the Integration

Run the demo script to verify your data works:

```bash
cd functions

# Generate sample PDF with mock data
python3 demo_pdf_generator.py

# View generated file
open sample_estimate.pdf
```

To test with your actual data, modify `demo_pdf_generator.py` or create a test script that:
1. Builds your estimate object matching the schema above
2. Calls `generate_pdf_local(estimate_data, output_path)`
3. Opens the resulting PDF to verify all sections render

---

## Summary

**Key Points for Dev 2:**

1. **Output all fields** - Every field in this spec is used by the PDF templates
2. **Use exact field names** - Templates reference these exact keys (snake_case)
3. **Run Monte Carlo** - Call Dev 4's `run_simulation()` to get P50/P80/P90 and histogram
4. **Include all sections** - laborAnalysis, schedule, cost_breakdown, risk_analysis, bill_of_quantities, assumptions
5. **Store in Firestore** - At `/estimates/{estimateId}` with the complete object

**Client-Ready Mode Differences:**
- Cover page shows single "Total Estimate" (P80 value) instead of P50/P80/P90
- No Monte Carlo methodology mentions
- O&P hidden (baked into line item prices)
- Risk section simplified (no histogram)

---

**Contact:** For questions about this spec, see the implementation in:
- `functions/services/pdf_generator.py`
- `functions/demo_pdf_generator.py` (complete working example)
- `functions/services/monte_carlo.py` (risk analysis)
