"""Cost Agent for TrueCost.

Calculates material, labor, and equipment costs with P50/P80/P90 ranges
for Monte Carlo compatibility.
"""

from typing import Dict, Any, Optional, List
import json
import math
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from services.cost_data_service import CostDataService
from models.cost_estimate import (
    CostRange,
    CostEstimate,
    CostSubtotals,
    CostAdjustments,
    CostSummary,
    DivisionCost,
    LineItemCost,
    CostConfidenceLevel,
)
from models.bill_of_quantities import TradeCategory

logger = structlog.get_logger()


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

COST_AGENT_SYSTEM_PROMPT = """You are an expert construction cost estimator specializing in residential remodeling.

Your role is to analyze cost calculations and provide insights about the estimate.

## Your Expertise Includes:
- Material cost estimation for kitchen and bathroom remodels
- Labor hour estimation by trade
- Equipment rental and tool costs
- Overhead and profit calculations
- Cost range analysis (P50/P80/P90 percentiles)

## Input You Will Receive:
1. Bill of Quantities with line items and cost codes
2. Location factors (labor rates, location factor multiplier)
3. Calculated costs with P50/P80/P90 ranges

## Your Output Must Include:
1. **key_cost_drivers**: Top 3-5 items/categories driving the cost
2. **cost_saving_opportunities**: List of 2-3 potential cost savings
3. **assumptions**: Key assumptions made in the estimate
4. **range_explanation**: Explain what the low/medium/high range means
5. **confidence_notes**: Notes on confidence in the estimate

## Response Format:
You MUST respond with valid JSON only. No markdown, no explanation.

{
    "key_cost_drivers": ["Driver 1", "Driver 2", "Driver 3"],
    "cost_saving_opportunities": ["Opportunity 1", "Opportunity 2"],
    "assumptions": ["Assumption 1", "Assumption 2"],
    "range_explanation": "Explanation of the P50/P80/P90 ranges...",
    "confidence_notes": "Notes on estimate confidence..."
}

## Guidelines:
- Focus on actionable insights
- Be specific about cost drivers
- Highlight realistic cost saving opportunities
- Explain the range clearly for the homeowner
"""


# =============================================================================
# COST AGENT CLASS
# =============================================================================


class CostAgent(BaseA2AAgent):
    """Cost Agent - calculates material, labor, and equipment costs.
    
    This agent:
    1. Reads Bill of Quantities from Scope Agent output
    2. Reads location factors from Location Agent output
    3. Looks up unit costs from CostDataService
    4. Calculates P50/P80/P90 cost ranges for each line item
    5. Applies location factor, overhead, and profit adjustments
    6. Generates CostEstimate with total ranges
    """
    
    # Default markup percentages
    DEFAULT_OVERHEAD_PCT = 0.10
    DEFAULT_PROFIT_PCT = 0.10
    DEFAULT_CONTINGENCY_PCT = 0.05

    # Heuristic conversion assumptions for granular takeoffs
    # (These are intentionally simple defaults; refine with real product catalogs later.)
    DEFAULT_WASTE_FACTOR = 1.10
    DEFAULT_PLANK_SQFT = 1.667  # ~5" x 48" engineered hardwood plank

    def _extract_user_cost_preferences(self, clarification: Dict[str, Any]) -> Dict[str, float]:
        """Extract user-selected costing preferences from ClarificationOutput.

        Expected to be provided by the UI during scope definition.

        Supported locations (for backward/forward compatibility):
        - clarification["projectBrief"]["costPreferences"]
        - clarification["costPreferences"]

        Supported keys (either camelCase or snake_case):
        - overheadPct / overhead_pct  (decimal or percent)
        - profitPct / profit_pct      (decimal or percent)
        - contingencyPct / contingency_pct (decimal or percent)
        - wasteFactor / waste_factor  (multiplier or percent)
        """

        prefs = {}
        if isinstance(clarification.get("projectBrief"), dict):
            prefs = clarification["projectBrief"].get("costPreferences") or {}
        if not prefs:
            prefs = clarification.get("costPreferences") or {}

        def _pct(val: Any, default: float) -> float:
            try:
                f = float(val)
            except Exception:
                return default
            # Accept percent inputs like 10 (meaning 10%) as well as decimals like 0.10.
            if f > 1.0 and f <= 100.0:
                return f / 100.0
            # Clamp to sensible range.
            if f < 0:
                return default
            if f > 1.0:
                return min(f, 1.0)
            return f

        def _waste(val: Any, default: float) -> float:
            try:
                f = float(val)
            except Exception:
                return default
            # Accept waste given as percent (0.10 or 10) meaning +10% waste.
            if f > 0 and f < 1.0:
                return 1.0 + f
            if f >= 1.0 and f <= 2.0:
                return f
            if f > 2.0 and f <= 100.0:
                return 1.0 + (f / 100.0)
            return default

        overhead_pct = _pct(prefs.get("overheadPct", prefs.get("overhead_pct")), self.DEFAULT_OVERHEAD_PCT)
        profit_pct = _pct(prefs.get("profitPct", prefs.get("profit_pct")), self.DEFAULT_PROFIT_PCT)
        contingency_pct = _pct(prefs.get("contingencyPct", prefs.get("contingency_pct")), self.DEFAULT_CONTINGENCY_PCT)
        waste_factor = _waste(prefs.get("wasteFactor", prefs.get("waste_factor")), self.DEFAULT_WASTE_FACTOR)

        return {
            "overhead_pct": overhead_pct,
            "profit_pct": profit_pct,
            "contingency_pct": contingency_pct,
            "waste_factor": waste_factor,
        }
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
        cost_data_service: Optional[CostDataService] = None
    ):
        """Initialize CostAgent.
        
        Args:
            firestore_service: Optional Firestore service instance.
            llm_service: Optional LLM service instance.
            cost_data_service: Optional cost data service instance.
        """
        super().__init__(
            name="cost",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
        self.cost_data_service = cost_data_service or CostDataService()
    
    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run cost calculation.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing scope_output and location_output.
            feedback: Optional critic feedback for retry.
            
        Returns:
            Cost estimate breakdown with P50/P80/P90 ranges.
        """
        logger.info(
            "cost_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )
        
        # Step 1: Extract inputs from previous agents
        scope_output = input_data.get("scope_output", {})
        location_output = input_data.get("location_output", {})
        clarification = input_data.get("clarification_output", {})

        user_prefs = self._extract_user_cost_preferences(clarification if isinstance(clarification, dict) else {})
        
        location_factor = location_output.get("locationFactor", 1.0)
        zip_code = location_output.get("zipCode", "00000")
        
        # Extract project_id for price comparison service
        # Try from clarification first, then use estimate_id as fallback
        project_id = None
        if isinstance(clarification, dict):
            project_id = (
                clarification.get("projectId") or
                clarification.get("project_id") or
                (clarification.get("projectBrief", {}) or {}).get("projectId") or
                (clarification.get("projectBrief", {}) or {}).get("project_id")
            )
        # Use estimate_id as project_id if not found (they may be the same)
        if not project_id:
            project_id = estimate_id
        
        logger.info(
            "cost_agent_inputs",
            estimate_id=estimate_id,
            location_factor=location_factor,
            zip_code=zip_code,
            division_count=len(scope_output.get("divisions", []))
        )
        
        # Step 2: Calculate costs for each line item
        division_costs, total_items, exact_matches = await self._calculate_division_costs(
            estimate_id=estimate_id,
            scope_output=scope_output,
            zip_code=zip_code,
            waste_factor=user_prefs["waste_factor"],
            project_id=project_id,
        )
        
        # Step 3: Calculate subtotals
        subtotals = self._calculate_subtotals(division_costs)
        
        # Step 4: Apply adjustments (location, overhead, profit)
        adjustments = self._calculate_adjustments(
            subtotals=subtotals,
            location_factor=location_factor,
            location_output=location_output,
            overhead_pct=user_prefs["overhead_pct"],
            profit_pct=user_prefs["profit_pct"],
            contingency_pct=user_prefs["contingency_pct"],
        )
        
        # Step 5: Calculate grand total
        grand_total = self._calculate_grand_total(subtotals, adjustments)
        
        # Step 6: Calculate confidence
        confidence = self._calculate_confidence(
            total_items=total_items,
            exact_matches=exact_matches,
            location_confidence=location_output.get("confidence", 0.7),
            scope_confidence=scope_output.get("confidence", 0.7)
        )
        
        # Step 7: Generate summary with LLM
        llm_analysis = await self._analyze_with_llm(
            estimate_id=estimate_id,
            division_costs=division_costs,
            subtotals=subtotals,
            adjustments=adjustments,
            grand_total=grand_total,
            feedback=feedback
        )
        
        # Step 8: Build summary
        summary = self._build_summary(
            grand_total=grand_total,
            total_items=total_items,
            llm_analysis=llm_analysis
        )
        
        # Step 9: Build CostEstimate
        cost_estimate = CostEstimate(
            estimate_id=estimate_id,
            boq_line_item_count=total_items,
            divisions=division_costs,
            subtotals=subtotals,
            adjustments=adjustments,
            total=grand_total,
            confidence=confidence,
            summary=summary,
            items_with_exact_costs=exact_matches,
            items_with_estimated_costs=total_items - exact_matches,
            average_cost_confidence=CostConfidenceLevel.HIGH if exact_matches / max(total_items, 1) > 0.7 else CostConfidenceLevel.MEDIUM
        )
        
        # Convert to output dict
        output = cost_estimate.to_agent_output()
        
        # Step 10: Save output to Firestore
        await self.firestore.save_agent_output(
            estimate_id=estimate_id,
            agent_name=self.name,
            output=output,
            summary=summary.headline,
            confidence=confidence,
            tokens_used=self._tokens_used,
            duration_ms=self.duration_ms
        )
        
        logger.info(
            "cost_agent_completed",
            estimate_id=estimate_id,
            total_low=grand_total.low,
            total_high=grand_total.high,
            total_items=total_items,
            confidence=confidence,
            duration_ms=self.duration_ms
        )
        
        return output
    
    async def _calculate_division_costs(
        self,
        estimate_id: str,
        scope_output: Dict[str, Any],
        zip_code: str,
        waste_factor: float,
        project_id: Optional[str] = None,
    ) -> tuple[List[DivisionCost], int, int]:
        """Calculate costs for all divisions and line items.
        
        Args:
            estimate_id: Estimate document ID.
            scope_output: Bill of Quantities from Scope Agent.
            zip_code: Project ZIP code for labor rates.
            waste_factor: Waste factor multiplier.
            project_id: Optional project ID for price comparison service.
            
        Returns:
            Tuple of (division_costs, total_items, exact_matches).
        """
        # Batch pre-fetch prices for all products if project_id provided
        if project_id:
            product_descriptions = []
            for div_data in scope_output.get("divisions", []):
                for item in div_data.get("lineItems", []):
                    description = item.get("item", item.get("description", ""))
                    if description:
                        product_descriptions.append(description)
            
            if product_descriptions:
                await self.cost_data_service.batch_prefetch_prices(
                    product_descriptions=product_descriptions,
                    project_id=project_id,
                    zip_code=zip_code
                )
        
        division_costs = []
        total_items = 0
        exact_matches = 0
        
        for div_data in scope_output.get("divisions", []):
            div_code = div_data.get("divisionCode", "00")
            div_name = div_data.get("divisionName", f"Division {div_code}")
            
            line_item_costs = []
            granular_items: List[Dict[str, Any]] = []
            
            for item in div_data.get("lineItems", []):
                item_cost, is_exact = await self._calculate_line_item_cost(
                    item=item,
                    zip_code=zip_code,
                    project_id=project_id
                )
                
                if item_cost:
                    line_item_costs.append(item_cost)
                    total_items += 1
                    if is_exact:
                        exact_matches += 1

                    # Persist granular cost components incrementally (per line item)
                    granular_items.extend(
                        self._build_granular_cost_items(
                            estimate_id=estimate_id,
                            division_code=div_code,
                            division_name=div_name,
                            item_cost=item_cost,
                            waste_factor=waste_factor,
                        )
                    )

            # Save granular items for this division in a batch to reduce write calls
            if granular_items:
                try:
                    await self.firestore.save_cost_items(estimate_id, granular_items)
                except Exception as e:
                    # Non-fatal: pipeline can still succeed without granular ledger.
                    logger.warning(
                        "save_granular_cost_items_failed",
                        estimate_id=estimate_id,
                        division_code=div_code,
                        error=str(e)
                    )
            
            # Create division cost
            div_cost = DivisionCost(
                division_code=div_code,
                division_name=div_name,
                line_items=line_item_costs
            )
            div_cost.calculate_subtotals()
            
            division_costs.append(div_cost)
        
        return division_costs, total_items, exact_matches

    def _build_granular_cost_items(
        self,
        estimate_id: str,
        division_code: str,
        division_name: str,
        item_cost: LineItemCost,
        waste_factor: float,
    ) -> List[Dict[str, Any]]:
        """Build granular cost items (materials/labor/equipment + optional takeoff conversions).

        This produces a "ledger" of components that can be stored in Firestore under
        `/estimates/{estimateId}/costItems`.

        Notes:
        - We intentionally keep this aggregated (e.g., "planks: 120") rather than writing
          one document per individual plank.
        - For now, conversions are heuristics; totals are preserved by computing
          unit_cost = total_cost / quantity for each component.
        """
        items: List[Dict[str, Any]] = []

        li_id = item_cost.line_item_id
        base = {
            "estimateId": estimate_id,
            "divisionCode": division_code,
            "divisionName": division_name,
            "lineItemId": li_id,
            "costCode": item_cost.cost_code,
            "description": item_cost.description,
        }

        def _safe_unit_cost(total: CostRange, qty: float) -> Dict[str, float]:
            if qty <= 0:
                return CostRange.zero().to_dict()
            return CostRange(
                low=round(total.low / qty, 2),
                medium=round(total.medium / qty, 2),
                high=round(total.high / qty, 2),
            ).to_dict()

        # 1) Material component (as-estimated)
        items.append({
            **base,
            "id": f"{li_id}__material",
            "category": "material",
            "name": f"{item_cost.description} (material)",
            "quantity": round(item_cost.quantity, 4),
            "unit": item_cost.unit,
            "unitCost": item_cost.unit_material_cost.to_dict(),
            "totalCost": item_cost.material_cost.to_dict(),
            "source": "cost_agent",
        })

        # 2) Labor component (hours)
        if item_cost.labor_hours > 0:
            items.append({
                **base,
                "id": f"{li_id}__labor",
                "category": "labor",
                "name": f"{item_cost.primary_trade.value} labor",
                "quantity": round(item_cost.labor_hours, 2),
                "unit": "hr",
                "unitCost": item_cost.labor_rate.to_dict(),
                "totalCost": item_cost.labor_cost.to_dict(),
                "source": "cost_agent",
            })

        # 3) Equipment component
        if item_cost.equipment_cost and (item_cost.equipment_cost.low > 0 or item_cost.equipment_cost.medium > 0 or item_cost.equipment_cost.high > 0):
            items.append({
                **base,
                "id": f"{li_id}__equipment",
                "category": "equipment",
                "name": "Equipment / tools",
                "quantity": round(item_cost.quantity, 4),
                "unit": item_cost.unit,
                "unitCost": item_cost.unit_equipment_cost.to_dict(),
                "totalCost": item_cost.equipment_cost.to_dict(),
                "source": "cost_agent",
            })

        # 4) Heuristic conversion: flooring SF -> planks
        desc = (item_cost.description or "").lower()
        unit = (item_cost.unit or "").lower()
        is_flooring = ("floor" in desc or "hardwood" in desc or "plank" in desc) and unit in {"sf", "sqft", "square feet", "square_feet"}
        if is_flooring and item_cost.quantity > 0:
            plank_sqft = self.DEFAULT_PLANK_SQFT
            waste = waste_factor or self.DEFAULT_WASTE_FACTOR
            planks = int(math.ceil((item_cost.quantity / plank_sqft) * waste))
            if planks > 0:
                items.append({
                    **base,
                    "id": f"{li_id}__planks",
                    "category": "material_component",
                    "name": "Flooring planks (estimated count)",
                    "quantity": planks,
                    "unit": "plank",
                    "unitCost": _safe_unit_cost(item_cost.material_cost, planks),
                    "totalCost": item_cost.material_cost.to_dict(),
                    "source": "heuristic",
                    "assumptions": {
                        "plank_sqft": plank_sqft,
                        "waste_factor": waste,
                        "derived_from_unit": item_cost.unit,
                    }
                })

        return items
    
    async def _calculate_line_item_cost(
        self,
        item: Dict[str, Any],
        zip_code: str,
        project_id: Optional[str] = None
    ) -> tuple[Optional[LineItemCost], bool]:
        """Calculate cost for a single line item.
        
        Args:
            item: Line item data from BoQ.
            zip_code: Project ZIP code for labor rates.
            project_id: Optional project ID for price comparison service.
            
        Returns:
            Tuple of (LineItemCost, is_exact_match).
        """
        try:
            # Extract item details
            line_item_id = item.get("id", item.get("lineItemId", "unknown"))
            cost_code = item.get("costCode", "")
            description = item.get("item", item.get("description", "Unknown item"))
            quantity = float(item.get("quantity", 1))
            unit = item.get("unit", "EA")
            
            # Get primary trade (from BoQ or infer from cost code)
            primary_trade_str = item.get("primaryTrade", "general_labor")
            try:
                primary_trade = TradeCategory(primary_trade_str)
            except ValueError:
                primary_trade = TradeCategory.GENERAL_LABOR
            
            # Look up material cost (with price comparison if project_id provided)
            material_data = await self.cost_data_service.get_material_cost(
                cost_code=cost_code,
                item_description=description,
                project_id=project_id,
                zip_code=zip_code
            )
            
            is_exact = material_data.get("confidence_score", 0) >= 0.85
            
            # Get labor rate for the trade
            labor_data = await self.cost_data_service.get_labor_rate(
                trade=primary_trade,
                zip_code=zip_code
            )
            
            # Calculate line item cost
            line_item_cost = LineItemCost.calculate(
                line_item_id=line_item_id,
                cost_code=material_data.get("cost_code", cost_code),
                description=description,
                quantity=quantity,
                unit=unit,
                unit_material_cost=material_data.get("unit_cost", CostRange.from_base_cost(50.0)),
                unit_labor_hours=material_data.get("labor_hours_per_unit", 0.5),
                labor_rate=labor_data.get("hourly_rate", CostRange.from_base_cost(40.0)),
                primary_trade=primary_trade,
                unit_equipment_cost=material_data.get("equipment_cost"),
                confidence=material_data.get("confidence", CostConfidenceLevel.MEDIUM),
                notes=None
            )
            
            return line_item_cost, is_exact
            
        except Exception as e:
            logger.warning(
                "line_item_cost_calculation_failed",
                item_id=item.get("id", "unknown"),
                error=str(e)
            )
            return None, False
    
    def _calculate_subtotals(
        self,
        division_costs: List[DivisionCost]
    ) -> CostSubtotals:
        """Calculate subtotals from division costs.
        
        Args:
            division_costs: List of division costs.
            
        Returns:
            CostSubtotals with material, labor, and equipment totals.
        """
        materials = CostRange.zero()
        labor = CostRange.zero()
        equipment = CostRange.zero()
        total_labor_hours = 0.0
        
        for div in division_costs:
            materials = materials + div.material_subtotal
            labor = labor + div.labor_subtotal
            equipment = equipment + div.equipment_subtotal
            total_labor_hours += div.labor_hours_subtotal
        
        subtotal = materials + labor + equipment
        
        return CostSubtotals(
            materials=materials,
            labor=labor,
            equipment=equipment,
            subtotal=subtotal,
            total_labor_hours=round(total_labor_hours, 2)
        )
    
    def _calculate_adjustments(
        self,
        subtotals: CostSubtotals,
        location_factor: float,
        location_output: Dict[str, Any],
        overhead_pct: float,
        profit_pct: float,
        contingency_pct: float,
    ) -> CostAdjustments:
        """Calculate cost adjustments.
        
        Args:
            subtotals: Cost subtotals.
            location_factor: Location cost multiplier.
            location_output: Full location output for permit costs.
            
        Returns:
            CostAdjustments with all adjustments.
        """
        # Apply location factor to subtotal
        location_adjusted = subtotals.subtotal * location_factor
        
        # Calculate overhead (on location-adjusted subtotal)
        overhead_amount = location_adjusted * overhead_pct
        
        # Calculate profit (on location-adjusted subtotal + overhead)
        pre_profit = location_adjusted + overhead_amount
        profit_amount = pre_profit * profit_pct
        
        # Calculate contingency (on total before contingency)
        pre_contingency = pre_profit + profit_amount
        contingency_amount = pre_contingency * contingency_pct
        
        # Get permit costs from location output
        permit_data = location_output.get("permitCosts", {})
        base_permit = permit_data.get("buildingPermitBase", 300.0)
        permit_pct = permit_data.get("buildingPermitPercentage", 0.01)
        electrical = permit_data.get("electricalPermit", 125.0)
        plumbing = permit_data.get("plumbingPermit", 125.0)
        mechanical = permit_data.get("mechanicalPermit", 100.0)
        
        # Calculate total permit cost (use P50 subtotal for percentage)
        project_value = subtotals.subtotal.low
        permit_total = (
            base_permit +
            (project_value * permit_pct) +
            electrical + plumbing + mechanical
        )
        permit_costs = CostRange.from_base_cost(permit_total, p80_multiplier=1.05, p90_multiplier=1.10)
        
        # Sum all adjustments
        total_adjustments = (
            overhead_amount +
            profit_amount +
            contingency_amount +
            permit_costs
        )
        
        return CostAdjustments(
            location_factor=location_factor,
            location_adjusted_subtotal=location_adjusted,
            overhead_percentage=overhead_pct,
            overhead_amount=overhead_amount,
            profit_percentage=profit_pct,
            profit_amount=profit_amount,
            contingency_percentage=contingency_pct,
            contingency_amount=contingency_amount,
            permit_costs=permit_costs,
            tax_percentage=0.0,
            tax_amount=CostRange.zero(),
            total_adjustments=total_adjustments
        )
    
    def _calculate_grand_total(
        self,
        subtotals: CostSubtotals,
        adjustments: CostAdjustments
    ) -> CostRange:
        """Calculate grand total with adjustments.
        
        Args:
            subtotals: Cost subtotals.
            adjustments: Cost adjustments.
            
        Returns:
            Grand total CostRange.
        """
        return adjustments.location_adjusted_subtotal + adjustments.total_adjustments
    
    def _calculate_confidence(
        self,
        total_items: int,
        exact_matches: int,
        location_confidence: float,
        scope_confidence: float
    ) -> float:
        """Calculate overall confidence in the estimate.
        
        Args:
            total_items: Total number of line items.
            exact_matches: Items with exact cost code matches.
            location_confidence: Confidence from Location Agent.
            scope_confidence: Confidence from Scope Agent.
            
        Returns:
            Overall confidence (0-1).
        """
        if total_items == 0:
            return 0.5
        
        # Cost code match ratio
        match_ratio = exact_matches / total_items
        
        # Weight the factors
        confidence = (
            0.3 * match_ratio +          # Cost code accuracy
            0.3 * location_confidence +   # Location data quality
            0.2 * scope_confidence +      # Scope quality
            0.2 * min(1.0, total_items / 20)  # Completeness bonus
        )
        
        return round(min(1.0, confidence), 2)
    
    async def _analyze_with_llm(
        self,
        estimate_id: str,
        division_costs: List[DivisionCost],
        subtotals: CostSubtotals,
        adjustments: CostAdjustments,
        grand_total: CostRange,
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Use LLM to analyze the cost estimate.
        
        Args:
            estimate_id: The estimate document ID.
            division_costs: Calculated division costs.
            subtotals: Cost subtotals.
            adjustments: Cost adjustments.
            grand_total: Grand total range.
            feedback: Optional critic feedback.
            
        Returns:
            LLM analysis results.
        """
        system_prompt = self.build_system_prompt(
            COST_AGENT_SYSTEM_PROMPT,
            feedback
        )
        
        # Build a summary of costs for the LLM
        division_summary = []
        for div in division_costs:
            if div.item_count > 0:
                division_summary.append({
                    "division": f"{div.division_code} - {div.division_name}",
                    "items": div.item_count,
                    "total": div.division_total.to_dict()
                })
        
        user_message = f"""## Cost Estimate Summary

### Grand Total (P50/P80/P90)
- Low (P50): ${grand_total.low:,.2f}
- Medium (P80): ${grand_total.medium:,.2f}
- High (P90): ${grand_total.high:,.2f}

### Subtotals
- Materials: ${subtotals.materials.low:,.2f} - ${subtotals.materials.high:,.2f}
- Labor: ${subtotals.labor.low:,.2f} - ${subtotals.labor.high:,.2f}
- Equipment: ${subtotals.equipment.low:,.2f} - ${subtotals.equipment.high:,.2f}
- Total Labor Hours: {subtotals.total_labor_hours:.1f}

### Adjustments
- Location Factor: {adjustments.location_factor:.2f}
- Overhead ({adjustments.overhead_percentage:.0%}): ${adjustments.overhead_amount.low:,.2f}
- Profit ({adjustments.profit_percentage:.0%}): ${adjustments.profit_amount.low:,.2f}
- Contingency ({adjustments.contingency_percentage:.0%}): ${adjustments.contingency_amount.low:,.2f}
- Permits: ${adjustments.permit_costs.low:,.2f}

### Costs by Division
{json.dumps(division_summary, indent=2)}

Please analyze this estimate and provide insights in the required JSON format."""
        
        try:
            from services.deep_agent_factory import deep_agent_generate_json

            result = await deep_agent_generate_json(
                estimate_id=estimate_id,
                agent_name=self.name,
                system_prompt=system_prompt,
                user_message=user_message,
                firestore_service=self.firestore,
            )
            
            self._tokens_used = result.get("tokens_used", 0)
            
            return result.get("content", {})
            
        except Exception as e:
            logger.warning(
                "cost_llm_analysis_fallback",
                estimate_id=estimate_id,
                error=str(e)
            )
            
            return self._generate_fallback_analysis(
                division_costs=division_costs,
                grand_total=grand_total
            )
    
    def _generate_fallback_analysis(
        self,
        division_costs: List[DivisionCost],
        grand_total: CostRange
    ) -> Dict[str, Any]:
        """Generate fallback analysis when LLM is unavailable.
        
        Args:
            division_costs: Calculated division costs.
            grand_total: Grand total range.
            
        Returns:
            Basic analysis dict.
        """
        # Find top cost drivers
        sorted_divs = sorted(
            [d for d in division_costs if d.item_count > 0],
            key=lambda d: d.division_total.low,
            reverse=True
        )
        
        key_drivers = [
            f"{d.division_name}: ${d.division_total.low:,.0f} - ${d.division_total.high:,.0f}"
            for d in sorted_divs[:3]
        ]
        
        range_spread = ((grand_total.high - grand_total.low) / grand_total.low) * 100 if grand_total.low > 0 else 0
        
        return {
            "key_cost_drivers": key_drivers or ["No significant cost drivers identified"],
            "cost_saving_opportunities": [
                "Consider standard-grade materials where premium isn't necessary",
                "Bundle similar work to reduce contractor mobilization costs",
            ],
            "assumptions": [
                "Costs based on standard working hours (no overtime)",
                "Material prices at current market rates",
                "Access to work areas is standard (no special requirements)",
            ],
            "range_explanation": (
                f"The estimate range ({range_spread:.0f}% spread) represents: "
                f"P50 (${grand_total.low:,.0f}) is the median expected cost, "
                f"P80 (${grand_total.medium:,.0f}) accounts for typical contingencies, "
                f"P90 (${grand_total.high:,.0f}) covers most potential cost increases."
            ),
            "confidence_notes": "Estimate based on available cost data and regional factors."
        }
    
    def _build_summary(
        self,
        grand_total: CostRange,
        total_items: int,
        llm_analysis: Dict[str, Any]
    ) -> CostSummary:
        """Build the cost summary.
        
        Args:
            grand_total: Grand total range.
            total_items: Total line items.
            llm_analysis: LLM analysis results.
            
        Returns:
            CostSummary instance.
        """
        return CostSummary(
            headline=f"Total estimate: ${grand_total.low:,.0f} - ${grand_total.high:,.0f} ({total_items} items)",
            range_explanation=llm_analysis.get(
                "range_explanation",
                f"Range from P50 (${grand_total.low:,.0f}) to P90 (${grand_total.high:,.0f})"
            ),
            key_cost_drivers=llm_analysis.get("key_cost_drivers", []),
            cost_saving_opportunities=llm_analysis.get("cost_saving_opportunities", []),
            assumptions=llm_analysis.get("assumptions", []),
            disclaimers=[
                "Estimate is based on provided scope and standard conditions",
                "Actual costs may vary based on site conditions and final specifications",
                "Permit costs are estimates - verify with local building department"
            ]
        )
