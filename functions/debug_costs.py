#!/usr/bin/env python3
"""Debug script to trace cost calculations and find exaggeration sources."""

import asyncio
import json
import sys
from pathlib import Path
from typing import Dict, Any

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent))

from services.cost_data_service import CostDataService, MOCK_COST_CODES


async def debug_cost_lookup():
    """Debug the cost lookup for various items."""

    print("=" * 80)
    print("COST DATA SERVICE DEBUG")
    print("=" * 80)

    service = CostDataService()

    # Test items from the bathroom fixture
    test_items = [
        # (description, division, subdivision, quantity, unit)
        ("Floor tile", "09", "09 30 00", 80, "SF"),
        ("Shower wall tile", "09", "09 30 00", 90, "SF"),
        ("Wall paint - 2 coats", "09", "09 91 00", 180, "SF"),
        ("Quartz countertop", "09", "09 66 00", 8, "SF"),
        ("Bathroom vanity cabinet", "06", "06 41 00", 1, "EA"),
        ("Base trim", "06", "06 22 00", 30, "LF"),
        ("Frameless shower door", "08", "08 81 00", 1, "EA"),
        ("Toilet", "22", "22 41 00", 1, "EA"),
        ("Vanity faucets", "22", "22 41 00", 2, "EA"),
        ("GFCI outlets", "26", "26 27 00", 2, "EA"),
        ("Recessed LED light", "26", "26 51 00", 2, "EA"),
        ("Grab bars", "10", "10 28 00", 3, "EA"),
        ("Dumpster rental", "02", "02 41 00", 1, "EA"),
        ("Flooring demolition", "02", "02 41 19", 75, "SF"),
    ]

    print("\n--- COST CODE LOOKUPS ---\n")

    total_material = 0
    total_labor_hours = 0

    for desc, div, subdiv, qty, unit in test_items:
        result = await service.get_cost_code(desc, div, subdiv)

        material_cost = result.get("material_cost_per_unit", 0)
        labor_hours = result.get("labor_hours_per_unit", 0)
        confidence = result.get("confidence", 0)
        matched_code = result.get("cost_code", "N/A")
        source = result.get("source", "N/A")
        result_unit = result.get("unit", "EA")

        # Calculate line totals
        line_material = material_cost * qty
        line_labor_hours = labor_hours * qty

        total_material += line_material
        total_labor_hours += line_labor_hours

        # Check for unit mismatch
        unit_mismatch = ""
        if unit.upper() != result_unit.upper():
            if result_unit.upper() in ["ALLOWANCE", "LS", "DAY"] and qty > 1:
                unit_mismatch = " ** UNIT MISMATCH! **"

        print(f"Item: {desc}")
        print(f"  Input: Div={div}, Subdiv={subdiv}, Qty={qty} {unit}")
        print(f"  Matched: {matched_code} (conf={confidence:.2f}, source={source})")
        print(f"  Unit Cost: ${material_cost:.2f}/{result_unit}, Labor: {labor_hours:.2f} hrs/{result_unit}")
        print(f"  Line Total: Material=${line_material:.2f}, Labor={line_labor_hours:.1f} hrs{unit_mismatch}")
        print()

    print("-" * 60)
    print(f"SUBTOTALS (before labor rates, location, overhead):")
    print(f"  Total Material: ${total_material:,.2f}")
    print(f"  Total Labor Hours: {total_labor_hours:.1f} hrs")
    print("-" * 60)

    # Now calculate with labor rates
    print("\n--- LABOR RATE LOOKUPS ---\n")

    # Get labor rates for common trades
    trades_to_check = [
        "tile_setter",
        "painter",
        "cabinet_installer",
        "plumber",
        "electrician",
        "general_labor",
    ]

    from models.bill_of_quantities import TradeCategory

    for trade_name in trades_to_check:
        try:
            trade = TradeCategory(trade_name)
            rate_info = await service.get_labor_rate(trade, "80205")  # Denver ZIP
            hourly_rate = rate_info.get("hourly_rate", {})
            if hasattr(hourly_rate, "low"):
                p50 = hourly_rate.low
                p80 = hourly_rate.medium
                p90 = hourly_rate.high
            else:
                p50 = hourly_rate.get("low", 40)
                p80 = hourly_rate.get("medium", 46)
                p90 = hourly_rate.get("high", 50)
            print(f"  {trade_name:20}: P50=${p50:.2f}/hr, P80=${p80:.2f}/hr, P90=${p90:.2f}/hr")
        except Exception as e:
            print(f"  {trade_name:20}: ERROR - {e}")

    # Estimate total labor cost
    avg_rate = 50  # Rough average
    labor_cost_p50 = total_labor_hours * avg_rate
    labor_cost_p90 = total_labor_hours * avg_rate * 1.20

    print(f"\n  Estimated Labor Cost (@ avg $50/hr):")
    print(f"    P50: ${labor_cost_p50:,.2f}")
    print(f"    P90: ${labor_cost_p90:,.2f}")

    # Calculate with adjustments
    print("\n--- ADJUSTMENT STACK ---\n")

    subtotal_p50 = total_material + labor_cost_p50
    subtotal_p90 = (total_material * 1.25) + labor_cost_p90  # P90 material

    # Location factor (Denver = ~1.05)
    location_factor = 1.05
    after_location_p50 = subtotal_p50 * location_factor
    after_location_p90 = subtotal_p90 * location_factor

    # Overhead (10%)
    overhead_rate = 0.10
    after_overhead_p50 = after_location_p50 * (1 + overhead_rate)
    after_overhead_p90 = after_location_p90 * (1 + overhead_rate)

    # Profit (10%)
    profit_rate = 0.10
    after_profit_p50 = after_overhead_p50 * (1 + profit_rate)
    after_profit_p90 = after_overhead_p90 * (1 + profit_rate)

    # Contingency (10%)
    contingency_rate = 0.10
    final_p50 = after_profit_p50 * (1 + contingency_rate)
    final_p90 = after_profit_p90 * (1 + contingency_rate)

    print(f"  Raw Material:        P50=${total_material:>10,.2f}  P90=${total_material * 1.25:>10,.2f}")
    print(f"  Raw Labor:           P50=${labor_cost_p50:>10,.2f}  P90=${labor_cost_p90:>10,.2f}")
    print(f"  Subtotal:            P50=${subtotal_p50:>10,.2f}  P90=${subtotal_p90:>10,.2f}")
    print(f"  + Location (1.05x):  P50=${after_location_p50:>10,.2f}  P90=${after_location_p90:>10,.2f}")
    print(f"  + Overhead (10%):    P50=${after_overhead_p50:>10,.2f}  P90=${after_overhead_p90:>10,.2f}")
    print(f"  + Profit (10%):      P50=${after_profit_p50:>10,.2f}  P90=${after_profit_p90:>10,.2f}")
    print(f"  + Contingency (10%): P50=${final_p50:>10,.2f}  P90=${final_p90:>10,.2f}")

    print("\n" + "=" * 60)
    print(f"FINAL ESTIMATE RANGE: ${final_p50:,.2f} - ${final_p90:,.2f}")
    print(f"P90/P50 Ratio: {final_p90/final_p50:.2f}x")
    print("=" * 60)

    # Check for problem items
    print("\n--- POTENTIAL ISSUES ---\n")

    # Check for high default costs
    print("Checking default costs by division:")
    for div in ["06", "08", "10", "11", "12"]:
        default = service._get_default_cost_code(div, "test item")
        mat = default.get("material_cost_per_unit", 0)
        lab = default.get("labor_hours_per_unit", 0)
        print(f"  Division {div} default: ${mat:.2f}/unit, {lab:.2f} hrs/unit")

    # Check which items fell back to defaults
    print("\nItems that may have used defaults (low confidence):")
    for desc, div, subdiv, qty, unit in test_items:
        result = await service.get_cost_code(desc, div, subdiv)
        conf = result.get("confidence", 0)
        source = result.get("source", "")
        if conf < 0.7 or source == "inferred":
            print(f"  - {desc}: conf={conf:.2f}, source={source}")


async def check_mock_database():
    """Check what's in the mock cost code database."""

    print("\n" + "=" * 80)
    print("MOCK COST CODE DATABASE ANALYSIS")
    print("=" * 80 + "\n")

    # Group by division
    by_division = {}
    for code in MOCK_COST_CODES:
        div = code.get("division", "??")
        if div not in by_division:
            by_division[div] = []
        by_division[div].append(code)

    print(f"Total cost codes in database: {len(MOCK_COST_CODES)}")
    print(f"Divisions covered: {sorted(by_division.keys())}")
    print()

    # Show codes with high unit costs
    print("Cost codes with material > $500/unit:")
    for code in MOCK_COST_CODES:
        mat = code.get("material_cost_per_unit", 0)
        if mat > 500:
            print(f"  {code['code']}: {code['description'][:40]} - ${mat:.2f}/{code.get('unit', 'EA')}")

    print("\nCost codes with labor > 2 hrs/unit:")
    for code in MOCK_COST_CODES:
        lab = code.get("labor_hours_per_unit", 0)
        if lab > 2:
            print(f"  {code['code']}: {code['description'][:40]} - {lab:.1f} hrs/{code.get('unit', 'EA')}")


if __name__ == "__main__":
    print("Starting cost debug analysis...")
    asyncio.run(debug_cost_lookup())
    asyncio.run(check_mock_database())
    print("\nDebug complete.")
