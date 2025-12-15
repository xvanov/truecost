#!/usr/bin/env python3
"""Debug the actual input1.json to find exaggerated numbers."""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services.cost_data_service import CostDataService
from models.cost_estimate import CostRange
from models.bill_of_quantities import TradeCategory


async def analyze_input():
    """Analyze the actual input file."""

    print("=" * 80)
    print("ANALYZING INPUT1.JSON - AUSTIN TX BATHROOM REMODEL")
    print("=" * 80)

    # Load input file
    input_path = Path("c:/Users/athar/Desktop/deep-agents-true-cost-input-output/input1.json")
    with open(input_path) as f:
        clarification = json.load(f)

    total_sqft = clarification['projectBrief']['scopeSummary']['totalSqft']
    print(f"\nProject: {clarification['projectBrief']['projectType']}")
    print(f"Location: {clarification['projectBrief']['location']['fullAddress']}")
    print(f"Total SqFt: {total_sqft:.2f}")

    # Extract all line items from csiScope
    all_items = []
    for key, div_data in clarification.get("csiScope", {}).items():
        if isinstance(div_data, dict) and div_data.get("status") == "included":
            div_code = div_data.get("code", "00")
            div_name = div_data.get("name", f"Division {div_code}")
            items = div_data.get("items", [])
            for item in items:
                all_items.append({
                    "divisionCode": div_code,
                    "divisionName": div_name,
                    **item
                })

    print(f"Total line items: {len(all_items)}")

    # Analyze quantities relative to floor area
    print("\n--- QUANTITY ANALYSIS (check for inflated quantities) ---\n")

    suspicious_items = []
    for item in all_items:
        desc = item.get("item", "Unknown")
        qty = float(item.get("quantity", 1))
        unit = item.get("unit", "EA")

        # Flag items where quantity is much larger than floor area
        if unit.lower() in ["sf", "sqft"] and qty > total_sqft * 2:
            ratio = qty / total_sqft
            suspicious_items.append({
                "desc": desc,
                "qty": qty,
                "unit": unit,
                "ratio": ratio
            })
            print(f"  ** {desc}: {qty:.1f} {unit} = {ratio:.1f}x floor area")

    if not suspicious_items:
        print("  No suspicious quantities found")

    # Initialize services
    cost_service = CostDataService()

    # Get location factors for Austin, TX
    zip_code = clarification["projectBrief"]["location"]["zipCode"]
    location_factors = await cost_service.get_location_factors(zip_code)

    print(f"\n--- LOCATION FACTORS (Austin, TX {zip_code}) ---")
    print(f"Location Factor: {location_factors.location_factor}")
    print(f"Union Status: {location_factors.union_status.value}")

    # Calculate costs for each item
    print(f"\n--- LINE ITEM COST BREAKDOWN ---\n")

    total_material = CostRange.zero()
    total_labor = CostRange.zero()
    total_labor_hours = 0.0

    high_cost_items = []

    for item in all_items:
        desc = item.get("item", "Unknown")
        div_code = item.get("divisionCode", "00")
        subdiv = item.get("subdivisionCode", "")
        qty = float(item.get("quantity", 1))
        unit = item.get("unit", "EA")

        # Get cost code - pass input unit for better matching
        cost_result = await cost_service.get_cost_code(desc, div_code, subdiv, input_unit=unit)

        material_unit = cost_result.get("material_cost_per_unit", 0)
        labor_hours_unit = cost_result.get("labor_hours_per_unit", 0)
        cost_code = cost_result.get("cost_code", "N/A")
        source = cost_result.get("source", "N/A")
        confidence = cost_result.get("confidence", 0)
        result_unit = cost_result.get("unit", "EA")

        # Apply unit normalization
        original_qty = qty
        unit_normalized = False
        allowance_units = {"allowance", "ls", "lump_sum", "lumpsum", "lump sum", "day"}
        if result_unit.lower() in allowance_units and unit.lower() not in allowance_units:
            qty = 1.0
            unit_normalized = True

        # Calculate costs
        material_cost = CostRange.from_base_cost(material_unit * qty)
        labor_hours = labor_hours_unit * qty

        # Get labor rate
        primary_trade = cost_result.get("primary_trade", "general_labor")
        try:
            trade = TradeCategory(primary_trade)
        except:
            trade = TradeCategory.GENERAL_LABOR

        labor_rate_data = await cost_service.get_labor_rate(trade, zip_code)
        labor_rate = labor_rate_data.get("hourly_rate", CostRange.from_base_cost(40))
        labor_cost = labor_rate * labor_hours

        total_material = total_material + material_cost
        total_labor = total_labor + labor_cost
        total_labor_hours += labor_hours

        line_total = material_cost.low + labor_cost.low

        # Track high cost items
        if line_total > 500:
            high_cost_items.append({
                "desc": desc,
                "qty": qty,
                "unit": result_unit,
                "material": material_cost.low,
                "labor": labor_cost.low,
                "total": line_total,
                "confidence": confidence
            })

        # Print each item
        warning = ""
        if confidence < 0.7:
            warning = " [LOW CONF]"
        if unit_normalized:
            warning += f" [NORMALIZED: {original_qty:.1f} {unit} -> 1]"

        print(f"[{div_code}] {desc[:45]}")
        print(f"    {qty:.1f} {result_unit} @ ${material_unit:.2f}/unit + {labor_hours_unit:.2f}hr @ ${labor_rate.low:.0f}/hr")
        print(f"    = Material ${material_cost.low:.0f} + Labor ${labor_cost.low:.0f} = ${line_total:.0f}{warning}")
        print()

    # Show high cost items
    print("-" * 60)
    print("TOP COST DRIVERS (items > $500)")
    print("-" * 60)
    high_cost_items.sort(key=lambda x: x['total'], reverse=True)
    for item in high_cost_items[:10]:
        pct = (item['total'] / (total_material.low + total_labor.low)) * 100
        print(f"  ${item['total']:>8,.0f} ({pct:4.1f}%) - {item['desc'][:40]} ({item['qty']:.0f} {item['unit']})")

    # Calculate totals
    subtotal = total_material + total_labor

    print("\n" + "=" * 60)
    print("SUBTOTALS")
    print("=" * 60)
    print(f"Material:     P50=${total_material.low:>10,.2f}  P90=${total_material.high:>10,.2f}")
    print(f"Labor:        P50=${total_labor.low:>10,.2f}  P90=${total_labor.high:>10,.2f}")
    print(f"Labor Hours:  {total_labor_hours:.1f} hrs")
    print(f"Subtotal:     P50=${subtotal.low:>10,.2f}  P90=${subtotal.high:>10,.2f}")

    # Apply adjustments
    location_factor = location_factors.location_factor
    after_location = subtotal * location_factor

    overhead_pct = 0.10
    overhead = after_location * overhead_pct
    after_overhead = after_location + overhead

    profit_pct = 0.10
    profit = after_overhead * profit_pct
    after_profit = after_overhead + profit

    contingency_pct = 0.05
    contingency = after_profit * contingency_pct
    after_contingency = after_profit + contingency

    permits = 700  # Estimated
    grand_total_p50 = after_contingency.low + permits
    grand_total_p90 = after_contingency.high + permits * 1.1

    print("\n" + "=" * 60)
    print("FINAL TOTALS (with adjustments)")
    print("=" * 60)
    print(f"+ Location ({location_factor}x):    P50=${after_location.low:>10,.2f}")
    print(f"+ Overhead (10%):         P50=${after_overhead.low:>10,.2f}")
    print(f"+ Profit (10%):           P50=${after_profit.low:>10,.2f}")
    print(f"+ Contingency (5%):       P50=${after_contingency.low:>10,.2f}")
    print(f"+ Permits (~$700):        P50=${grand_total_p50:>10,.2f}")
    print()
    print(f"GRAND TOTAL: P50=${grand_total_p50:,.0f}  P90=${grand_total_p90:,.0f}")

    cost_per_sqft = grand_total_p50 / total_sqft
    print(f"\nCost per Sq Ft: ${cost_per_sqft:.2f}/SF")
    print(f"(Typical bathroom remodel: $200-$400/SF)")

    if cost_per_sqft > 500:
        print("\n** WARNING: Cost per SF is HIGH - likely exaggerated quantities **")
        print("\nPotential issues:")
        for item in suspicious_items:
            print(f"  - {item['desc']}: {item['qty']:.0f} {item['unit']} ({item['ratio']:.1f}x floor area)")


if __name__ == "__main__":
    asyncio.run(analyze_input())
