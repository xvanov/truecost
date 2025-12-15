#!/usr/bin/env python3
"""Debug the full pipeline to find exaggerated numbers."""

import asyncio
import json
import sys
from pathlib import Path
from typing import Dict, Any, List

sys.path.insert(0, str(Path(__file__).parent))

from services.cost_data_service import CostDataService
from models.cost_estimate import CostRange


class MockFirestoreService:
    """In-memory mock Firestore."""

    def __init__(self):
        self.estimates = {}
        self.cost_items = {}

    async def get_estimate(self, estimate_id: str):
        return self.estimates.get(estimate_id)

    async def update_estimate(self, estimate_id: str, data: Dict):
        if estimate_id not in self.estimates:
            self.estimates[estimate_id] = {}
        self.estimates[estimate_id].update(data)

    async def create_estimate(self, estimate_id: str, user_id: str, clarification_output: Dict):
        self.estimates[estimate_id] = {
            "id": estimate_id,
            "userId": user_id,
            "clarificationOutput": clarification_output
        }
        return estimate_id

    async def save_agent_output(self, estimate_id, agent_name, output, **kwargs):
        if estimate_id not in self.estimates:
            self.estimates[estimate_id] = {}
        self.estimates[estimate_id][f"{agent_name}Output"] = output

    async def save_cost_items(self, estimate_id: str, items: List[Dict]):
        if estimate_id not in self.cost_items:
            self.cost_items[estimate_id] = []
        self.cost_items[estimate_id].extend(items)

    async def list_cost_items(self, estimate_id: str):
        return self.cost_items.get(estimate_id, [])


class MockLLMService:
    """Mock LLM that returns canned responses."""

    async def generate_json(self, system_prompt: str, user_message: str) -> Dict:
        return {
            "tokens_used": 100,
            "content": {
                "analysis": "Test analysis",
                "key_findings": ["Finding 1"],
                "recommendations": ["Rec 1"],
                "risk_factors": ["Risk 1"],
                "confidence_assessment": "High"
            }
        }


async def run_cost_calculation():
    """Run the cost calculation with the bathroom fixture."""

    print("=" * 80)
    print("FULL PIPELINE COST CALCULATION DEBUG")
    print("=" * 80)

    # Load bathroom fixture
    fixture_path = Path(__file__).parent / "tests" / "fixtures" / "clarification_output_bathroom.json"
    with open(fixture_path) as f:
        clarification = json.load(f)

    print(f"\nProject: {clarification['projectBrief']['projectType']}")
    print(f"Location: {clarification['projectBrief']['location']['fullAddress']}")
    print(f"Total SqFt: {clarification['projectBrief']['scopeSummary']['totalSqft']}")

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

    print(f"\nTotal line items: {len(all_items)}")

    # Initialize services
    cost_service = CostDataService()
    firestore = MockFirestoreService()
    llm = MockLLMService()

    # Get location factors
    zip_code = clarification["projectBrief"]["location"]["zipCode"]
    location_factors = await cost_service.get_location_factors(zip_code)

    print(f"\n--- LOCATION FACTORS ---")
    print(f"ZIP: {zip_code}")
    print(f"Location Factor: {location_factors.location_factor}")
    print(f"Union Status: {location_factors.union_status.value}")

    # Calculate costs for each item
    print(f"\n--- LINE ITEM CALCULATIONS ---\n")

    total_material = CostRange.zero()
    total_labor = CostRange.zero()
    total_labor_hours = 0.0

    for item in all_items:
        desc = item.get("item", "Unknown")
        div_code = item.get("divisionCode", "00")
        subdiv = item.get("subdivisionCode", "")
        qty = float(item.get("quantity", 1))
        unit = item.get("unit", "EA")

        # Get cost code
        cost_result = await cost_service.get_cost_code(desc, div_code, subdiv)

        material_unit = cost_result.get("material_cost_per_unit", 0)
        labor_hours_unit = cost_result.get("labor_hours_per_unit", 0)
        cost_code = cost_result.get("cost_code", "N/A")
        source = cost_result.get("source", "N/A")
        confidence = cost_result.get("confidence", 0)
        result_unit = cost_result.get("unit", "EA")

        # Check for unit mismatch - apply normalization
        original_qty = qty
        unit_normalized = False
        allowance_units = {"allowance", "ls", "lump_sum", "lumpsum", "lump sum", "day"}
        if result_unit.lower() in allowance_units and unit.lower() not in allowance_units:
            qty = 1.0
            unit_normalized = True

        # Calculate line totals
        material_cost = CostRange.from_base_cost(material_unit * qty)
        labor_hours = labor_hours_unit * qty

        # Get labor rate for trade
        primary_trade = cost_result.get("primary_trade", "general_labor")
        from models.bill_of_quantities import TradeCategory
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

        # Print details
        line_total = material_cost.low + labor_cost.low
        warning = ""
        if confidence < 0.7:
            warning = " [LOW CONF]"
        if unit_normalized:
            warning += f" [NORMALIZED: {original_qty} {unit} -> 1 {result_unit}]"
        if line_total > 2000:
            warning += " [HIGH COST]"

        print(f"[{div_code}] {desc[:50]}")
        print(f"    Qty: {qty} {result_unit} | Code: {cost_code} | Conf: {confidence:.2f}")
        print(f"    Material: ${material_unit:.2f}/{result_unit} x {qty} = ${material_cost.low:.2f}")
        print(f"    Labor: {labor_hours_unit:.2f}hrs x {qty} x ${labor_rate.low:.2f}/hr = ${labor_cost.low:.2f}")
        print(f"    Line Total (P50): ${line_total:.2f}{warning}")
        print()

    # Calculate totals
    print("-" * 60)
    print("SUBTOTALS (Direct Costs)")
    print("-" * 60)
    print(f"Material:     P50=${total_material.low:>10,.2f}  P80=${total_material.medium:>10,.2f}  P90=${total_material.high:>10,.2f}")
    print(f"Labor:        P50=${total_labor.low:>10,.2f}  P80=${total_labor.medium:>10,.2f}  P90=${total_labor.high:>10,.2f}")
    print(f"Labor Hours:  {total_labor_hours:.1f} hrs")

    subtotal = total_material + total_labor
    print(f"Subtotal:     P50=${subtotal.low:>10,.2f}  P80=${subtotal.medium:>10,.2f}  P90=${subtotal.high:>10,.2f}")

    # Apply adjustments
    print("\n" + "-" * 60)
    print("ADJUSTMENTS")
    print("-" * 60)

    location_factor = location_factors.location_factor
    after_location = subtotal * location_factor
    print(f"Location Factor ({location_factor}x):  P50=${after_location.low:>10,.2f}")

    overhead_pct = 0.10
    overhead = after_location * overhead_pct
    after_overhead = after_location + overhead
    print(f"+ Overhead (10%):        P50=${after_overhead.low:>10,.2f}")

    profit_pct = 0.10
    profit = after_overhead * profit_pct
    after_profit = after_overhead + profit
    print(f"+ Profit (10%):          P50=${after_profit.low:>10,.2f}")

    contingency_pct = 0.05
    contingency = after_profit * contingency_pct
    after_contingency = after_profit + contingency
    print(f"+ Contingency (5%):      P50=${after_contingency.low:>10,.2f}")

    # Permits
    permit_base = 300
    permit_pct_val = subtotal.low * 0.01
    permits = permit_base + permit_pct_val + 125 + 125 + 100
    print(f"+ Permits (~${permits:.0f}):    P50=${(after_contingency.low + permits):>10,.2f}")

    grand_total_p50 = after_contingency.low + permits
    grand_total_p90 = after_contingency.high + permits * 1.1

    print("\n" + "=" * 60)
    print(f"GRAND TOTAL: P50=${grand_total_p50:,.2f}  P90=${grand_total_p90:,.2f}")
    print(f"P90/P50 Ratio: {grand_total_p90/grand_total_p50:.2f}x")
    print("=" * 60)

    # Reasonableness check
    sqft = clarification['projectBrief']['scopeSummary']['totalSqft']
    cost_per_sqft = grand_total_p50 / sqft
    print(f"\nCost per Sq Ft: ${cost_per_sqft:.2f}/SF")
    print(f"(Typical bathroom remodel: $200-$400/SF)")

    if cost_per_sqft < 100:
        print("WARNING: Cost seems LOW - might be missing items")
    elif cost_per_sqft > 500:
        print("WARNING: Cost seems HIGH - might have exaggerated items")
    else:
        print("Cost per SF is within reasonable range")


if __name__ == "__main__":
    asyncio.run(run_cost_calculation())
