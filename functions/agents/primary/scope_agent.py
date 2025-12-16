"""Scope Agent for TrueCost.

Enriches the Bill of Quantities with cost codes and validates quantities
against CAD data. Uses LLM to analyze scope completeness and suggest
missing items.
"""

from typing import Dict, Any, List, Optional
import json
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from services.cost_data_service import CostDataService
from models.bill_of_quantities import (
    BillOfQuantities,
    EnrichedDivision,
    EnrichedLineItem,
    CostCode,
    UnitCostReference,
    CompletenessCheck,
    ScopeAnalysis,
    CostCodeSource,
    QuantityValidationStatus,
    TradeCategory,
    CSI_DIVISION_NAMES,
    get_primary_trade,
)

logger = structlog.get_logger()


# =============================================================================
# SYSTEM PROMPT
# =============================================================================

SCOPE_AGENT_SYSTEM_PROMPT = """You are an expert construction estimator specializing in scope analysis and Bill of Quantities (BoQ) validation.

Your role is to analyze the enriched scope data and provide insights about completeness, material selections, and potential issues.

## Your Expertise Includes:
- CSI MasterFormat divisions and construction trades
- Material selection and specification interpretation
- Quantity takeoff validation against floor plans
- Identifying missing scope items for project types
- Assessing finish level appropriateness

## Input You Will Receive:
1. Project information (type, sqft, finish level)
2. Enriched divisions with line items and cost codes
3. CAD data with room dimensions
4. Completeness metrics

## Your Output Must Include:
1. **summary**: A 2-3 sentence overview of the scope
2. **key_observations**: List of 3-5 key observations about the scope
3. **material_highlights**: List of notable material selections
4. **complexity_factors**: List of factors affecting project complexity
5. **finish_level_assessment**: Assessment of whether materials match stated finish level
6. **recommendations**: List of 2-4 recommendations
7. **missing_items**: Items that appear to be missing for this project type (empty list if complete)
8. **suggested_additions**: Optional items to consider adding

## Response Format:
You MUST respond with valid JSON only. No markdown, no explanation.

{
    "summary": "Brief scope overview...",
    "key_observations": ["Observation 1", "Observation 2", "Observation 3"],
    "material_highlights": ["Material 1", "Material 2"],
    "complexity_factors": ["Factor 1", "Factor 2"],
    "finish_level_assessment": "Assessment of finish level match...",
    "recommendations": ["Recommendation 1", "Recommendation 2"],
    "missing_items": [],
    "suggested_additions": ["Optional item 1"]
}

## Guidelines:
- Be specific about material selections and their appropriateness
- Identify any scope gaps for the project type
- Consider the stated finish level when evaluating materials
- Flag any quantity discrepancies
- Provide actionable recommendations
"""


GENERATE_MATERIALS_AND_LABOR_PROMPT = """You are an expert construction estimator with 20+ years of experience in residential remodeling.

Your job is to analyze line items from a construction scope and generate REALISTIC labor hour estimates and material specifications.

## CRITICAL: Labor Hours Must Be Realistic

Labor hours should reflect ACTUAL installation time by a professional contractor:
- Consider the unit of measurement (SF, LF, EA, etc.)
- A single tradesperson can typically:
  - Install 30-50 SF of drywall per hour
  - Paint 100-150 SF per hour (walls)
  - Install 20-30 SF of tile per hour
  - Install 15-25 LF of trim/molding per hour
  - Install 1 toilet in 1.5-2 hours
  - Install 1 faucet in 0.5-1 hour
  - Install 1 vanity cabinet in 1-2 hours

## Input Format:
{
    "project_type": "bathroom_remodel",
    "finish_level": "mid_range",
    "total_sqft": 75,
    "items": [
        {"id": "item-1", "description": "Drywall - Walls", "quantity": 200, "unit": "SF", "division": "09"},
        ...
    ]
}

## Output Format (JSON):
{
    "enriched_items": [
        {
            "id": "item-1",
            "description": "Drywall - Walls",
            "material_cost_per_unit": 1.50,
            "labor_hours_per_unit": 0.025,
            "total_labor_hours": 5.0,
            "primary_trade": "drywall_installer",
            "reasoning": "200 SF at ~40 SF/hour = 5 hours"
        },
        ...
    ],
    "total_project_labor_hours": 85,
    "labor_summary": {
        "demolition": 8,
        "framing": 4,
        "plumbing": 12,
        "electrical": 6,
        "drywall": 8,
        "tile": 16,
        "painting": 6,
        "fixtures": 8,
        "cleanup": 4
    }
}

## Trade Categories (use exactly these values):
- general_labor
- carpenter
- electrician
- plumber
- hvac
- painter
- tile_setter
- drywall_installer
- flooring_installer
- cabinet_installer
- demolition

## Guidelines:
1. Labor hours must be REALISTIC - a bathroom remodel typically takes 40-120 labor hours total
2. Consider economies of scale (larger quantities = slightly more efficient per unit)
3. Include setup/cleanup time in your estimates
4. Factor in the finish level (luxury = more detailed work = more time)
5. Provide brief reasoning for each estimate

RESPOND WITH VALID JSON ONLY. No markdown, no explanation outside the JSON."""


GENERATE_SEARCHABLE_NAMES_PROMPT = """You are an expert construction estimator who knows EXACTLY what products are sold at Home Depot and Lowe's.

Your job is to convert generic line item descriptions into SPECIFIC, SEARCHABLE product names that will find real products on homedepot.com or lowes.com.

## CRITICAL: Generate Real Product Names
- Include BRAND NAMES (Moen, Delta, Kohler, LG, Samsung, Whirlpool, etc.)
- Include MODEL SERIES when you know them (e.g., "Delta Faucet Leland", "Moen Chateau")
- Include EXACT SPECIFICATIONS (dimensions, colors, materials)
- The name should return 5-20 real products when searched, NOT generic results

## Brand Recommendations by Finish Level:
**Budget**:
- Faucets: Glacier Bay, Peerless
- Cabinets: Hampton Bay unfinished, In Stock Kitchen
- Flooring: TrafficMaster, LifeProof basic
- Appliances: Frigidaire, Amana, Hotpoint
- Paint: Glidden, BEHR Premium Plus

**Mid-Range**:
- Faucets: Moen, Delta, Pfister
- Cabinets: Hampton Bay, KraftMaid basics
- Flooring: LifeProof, Pergo, Bruce
- Appliances: GE, LG, Samsung mid-tier
- Paint: BEHR Ultra, Sherwin-Williams Cashmere

**High-End**:
- Faucets: Kohler, Delta Touch, Moen MotionSense
- Cabinets: KraftMaid, Thomasville
- Flooring: Shaw, Mannington, solid hardwood
- Appliances: Samsung, LG, GE Profile
- Paint: Benjamin Moore, Sherwin-Williams Emerald

**Luxury**:
- Faucets: Kohler Artifacts, Brizo, Grohe
- Cabinets: Custom, Diamond NOW premium
- Flooring: Real hardwood, natural stone
- Appliances: GE Café, Samsung Bespoke, LG Studio
- Paint: Benjamin Moore Advance, Farrow & Ball

## Examples (BE THIS SPECIFIC):

Input: {"description": "Kitchen faucet", "finish_level": "mid_range"}
Output: "Moen Georgene Spot Resist Stainless Single-Handle Pull-Down Kitchen Faucet"

Input: {"description": "Bathroom vanity", "finish_level": "budget", "specs": "30 inch"}
Output: "Glacier Bay Everdean 30 in White Single Sink Bathroom Vanity"

Input: {"description": "Dishwasher", "finish_level": "high_end"}
Output: "Samsung 24 in Top Control Stainless Steel Dishwasher with StormWash"

Input: {"description": "Interior paint", "finish_level": "mid_range", "specs": "walls"}
Output: "BEHR Ultra Scuff Defense Interior Eggshell Paint Gallon"

Input: {"description": "Flooring", "finish_level": "mid_range", "specs": "200 SF kitchen"}
Output: "LifeProof Sterling Oak 8.7 in Waterproof Luxury Vinyl Plank Flooring"

Input: {"description": "Recessed lighting", "finish_level": "high_end"}
Output: "Halo 6 in LED Recessed Ceiling Light Retrofit Trim"

Input: {"description": "Ceiling fan", "finish_level": "mid_range", "specs": "bedroom"}
Output: "Hunter Dempsey 52 in Indoor Brushed Nickel Ceiling Fan with Light"

## Input Format:
{
    "items": [
        {"id": "item-1", "description": "...", "specifications": "...", "unit": "..."},
        ...
    ],
    "finish_level": "mid_range",
    "project_type": "kitchen_remodel"
}

## Output Format (JSON):
{
    "searchable_names": [
        {
            "id": "item-1",
            "searchable_name": "Brand Model Specific Product Name with Color/Size",
            "search_category": "flooring|cabinets|countertops|fixtures|lighting|paint|hardware|appliances|plumbing|electrical|other",
            "suggested_brand": "Moen|Delta|etc",
            "is_labor_only": false
        },
        ...
    ]
}

## CRITICAL: Skip Labor/Service Items
Set `searchable_name` to null and `is_labor_only` to true for items that are:
- Labor/installation only (e.g., "Demolition", "Installation", "Rough-in")
- Overhead/contingency items (e.g., "Contingency", "General Conditions", "Permits")
- Services not sold at retail (e.g., "Inspections", "Hauling", "Cleanup")
- Items with units like "LS" (lump sum), "HR" (hour), "DAY" that are clearly labor

Examples of labor-only items (return null searchable_name):
- "Wall Finish Demolition" -> null (demolition labor)
- "Contingency" -> null (overhead)
- "Plumbing rough-in" -> null (installation labor, not the valve itself)
- "Drywall Installation" -> null (labor only)
- "Electrical rough-in" -> null (labor only)
- "Framing Labor" -> null (labor only)

Examples of MATERIAL items (DO generate searchable_name):
- "Drywall" -> "USG Sheetrock 1/2 in x 4 ft x 8 ft Drywall Panel" (the actual drywall sheets)
- "Wall Insulation" -> "Owens Corning R-15 Kraft Faced Fiberglass Insulation Batt 15 in W x 93 in L"
- "Shower Valve" -> "Delta R10000-UNBX MultiChoice Universal Tub/Shower Rough-In Valve"

IMPORTANT: Every searchable_name MUST be specific enough to find REAL products. Include brand, series, size, and color/finish."""


# =============================================================================
# EXPECTED DIVISIONS BY PROJECT TYPE
# =============================================================================

# Divisions typically included for each project type
EXPECTED_DIVISIONS_BY_PROJECT_TYPE: Dict[str, List[str]] = {
    "kitchen_remodel": ["01", "02", "06", "08", "09", "10", "11", "12", "22", "26"],
    "bathroom_remodel": ["01", "02", "06", "08", "09", "10", "12", "22", "26"],
    "bedroom_remodel": ["01", "02", "06", "08", "09", "26"],
    "living_room_remodel": ["01", "02", "06", "08", "09", "26"],
    "basement_finish": ["01", "02", "03", "06", "07", "08", "09", "22", "23", "26"],
    "attic_conversion": ["01", "02", "06", "07", "08", "09", "22", "23", "26"],
    "whole_house_remodel": ["01", "02", "06", "07", "08", "09", "10", "11", "12", "22", "23", "26"],
    "addition": ["01", "02", "03", "05", "06", "07", "08", "09", "22", "23", "26", "31"],
    "deck_patio": ["01", "02", "06", "26", "32"],
    "garage": ["01", "02", "03", "06", "07", "08", "09", "26", "31"],
}


# =============================================================================
# SCOPE AGENT CLASS
# =============================================================================


class ScopeAgent(BaseA2AAgent):
    """Scope Agent - enriches Bill of Quantities with cost codes.
    
    This agent:
    1. Reads csiScope from ClarificationOutput
    2. Maps line items to RSMeans cost codes
    3. Validates quantities against CAD data
    4. Uses LLM to analyze completeness
    5. Saves enriched BoQ to Firestore
    """
    
    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
        cost_data_service: Optional[CostDataService] = None
    ):
        """Initialize ScopeAgent.
        
        Args:
            firestore_service: Optional Firestore service instance.
            llm_service: Optional LLM service instance.
            cost_data_service: Optional cost data service instance.
        """
        super().__init__(
            name="scope",
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
        """Run scope enrichment.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing clarification_output and location_output.
            feedback: Optional critic feedback for retry.
            
        Returns:
            Enriched Bill of Quantities.
        """
        logger.info(
            "scope_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )
        
        # Step 1: Extract data from inputs
        clarification = input_data.get("clarification_output", {})
        csi_scope = clarification.get("csiScope", {})
        project_brief = clarification.get("projectBrief", {})
        cad_data = clarification.get("cadData", {})
        
        project_type = project_brief.get("projectType", "other")
        scope_summary = project_brief.get("scopeSummary", {})
        total_sqft = scope_summary.get("totalSqft", 0)
        finish_level = scope_summary.get("finishLevel", "mid_range")
        
        logger.info(
            "scope_extracted",
            estimate_id=estimate_id,
            project_type=project_type,
            total_sqft=total_sqft,
            finish_level=finish_level,
            division_count=len(csi_scope)
        )
        
        # Step 2: Enrich each division with cost codes
        enriched_divisions = await self._enrich_divisions(
            csi_scope=csi_scope,
            cad_data=cad_data
        )
        
        # Step 3: Validate quantities against CAD
        enriched_divisions = self._validate_quantities(
            divisions=enriched_divisions,
            cad_data=cad_data,
            total_sqft=total_sqft
        )

        # Step 3.5: Generate searchable product names for price comparison
        searchable_names = await self._generate_searchable_names(
            divisions=enriched_divisions,
            finish_level=finish_level,
            project_type=project_type
        )

        # Attach searchable names to line items
        for div in enriched_divisions:
            for item in div.line_items:
                if item.id in searchable_names:
                    item.searchable_name = searchable_names[item.id].get("searchable_name", "")
                    item.search_category = searchable_names[item.id].get("search_category", "other")

        logger.info(
            "searchable_names_generated",
            estimate_id=estimate_id,
            items_with_names=len(searchable_names)
        )

        # Step 3.6: Generate realistic labor estimates using LLM
        # This replaces mock data with intelligent estimates based on project context
        labor_estimates = await self._generate_labor_estimates_with_llm(
            divisions=enriched_divisions,
            project_type=project_type,
            finish_level=finish_level,
            total_sqft=total_sqft
        )

        # Apply LLM-generated labor estimates to line items
        if labor_estimates:
            for div in enriched_divisions:
                for item in div.line_items:
                    if item.id in labor_estimates:
                        est = labor_estimates[item.id]
                        # Update labor hours with LLM estimate
                        item.unit_cost_reference.labor_hours_per_unit = est.get("labor_hours_per_unit", item.unit_cost_reference.labor_hours_per_unit)
                        item.estimated_labor_hours = est.get("total_labor_hours", item.estimated_labor_hours)
                        # Update material cost if provided
                        if est.get("material_cost_per_unit", 0) > 0:
                            item.unit_cost_reference.material_cost_per_unit = est["material_cost_per_unit"]
                            item.estimated_material_cost = round(item.quantity * est["material_cost_per_unit"], 2)
                        # Update trade if provided
                        trade_str = est.get("primary_trade", "")
                        if trade_str:
                            try:
                                item.unit_cost_reference.primary_trade = TradeCategory(trade_str)
                            except ValueError:
                                pass
                        # Mark as LLM-sourced
                        item.unit_cost_reference.cost_code_source = "llm_estimate"

            # Recalculate division subtotals after updating labor hours
            for div in enriched_divisions:
                div.calculate_subtotals()

            logger.info(
                "llm_labor_estimates_applied",
                estimate_id=estimate_id,
                items_updated=len(labor_estimates)
            )

        # Step 4: Check completeness
        completeness = self._check_completeness(
            divisions=enriched_divisions,
            project_type=project_type
        )
        
        # Step 5: Use LLM to analyze scope
        analysis = await self._analyze_with_llm(
            estimate_id=estimate_id,
            project_type=project_type,
            finish_level=finish_level,
            total_sqft=total_sqft,
            divisions=enriched_divisions,
            completeness=completeness,
            feedback=feedback
        )
        
        # Update completeness with LLM suggestions
        completeness.missing_items = analysis.get("missing_items", [])
        completeness.suggested_additions = analysis.get("suggested_additions", [])
        
        # Step 6: Calculate totals and build BoQ
        boq = self._build_bill_of_quantities(
            estimate_id=estimate_id,
            project_type=project_type,
            finish_level=finish_level,
            total_sqft=total_sqft,
            divisions=enriched_divisions,
            completeness=completeness,
            analysis=analysis
        )
        
        # Step 7: Convert to output format
        output = boq.to_agent_output()
        
        # Step 8: Save to Firestore
        await self.firestore.save_agent_output(
            estimate_id=estimate_id,
            agent_name=self.name,
            output=output,
            summary=output["summary"],
            confidence=output["confidence"],
            tokens_used=self._tokens_used,
            duration_ms=self.duration_ms
        )
        
        logger.info(
            "scope_agent_completed",
            estimate_id=estimate_id,
            total_items=output["totalLineItems"],
            total_divisions=output["totalIncludedDivisions"],
            confidence=output["confidence"],
            duration_ms=self.duration_ms
        )
        
        return output
    
    async def _enrich_divisions(
        self,
        csi_scope: Dict[str, Any],
        cad_data: Dict[str, Any]
    ) -> List[EnrichedDivision]:
        """Enrich all divisions with cost codes.
        
        Args:
            csi_scope: CSI scope from clarification output.
            cad_data: CAD data from clarification output.
            
        Returns:
            List of enriched divisions.
        """
        enriched_divisions = []
        
        for div_key, div_data in csi_scope.items():
            if not isinstance(div_data, dict):
                continue
            
            # Extract division code from key (e.g., "div06_wood..." -> "06")
            div_code = div_data.get("code", "")
            if not div_code:
                # Try to extract from key
                parts = div_key.split("_")
                if parts and parts[0].startswith("div"):
                    div_code = parts[0].replace("div", "")
            
            status = div_data.get("status", "excluded")
            div_name = div_data.get("name", CSI_DIVISION_NAMES.get(div_code, f"Division {div_code}"))
            description = div_data.get("description", "")
            items = div_data.get("items", [])

            # Process divisions that are included OR have items (to handle status mismatch)
            # A division with items should be treated as included even if status says otherwise
            should_process = status == "included" or (isinstance(items, list) and len(items) > 0)

            if not should_process:
                # Create placeholder for excluded divisions
                enriched_divisions.append(EnrichedDivision(
                    division_code=div_code,
                    division_name=div_name,
                    status=status,
                    description=description or div_data.get("exclusionReason", ""),
                    line_items=[],
                    item_count=0
                ))
                continue

            # Override status to included if we're processing items
            if status != "included" and len(items) > 0:
                logger.info(
                    "division_status_override",
                    division_code=div_code,
                    original_status=status,
                    item_count=len(items),
                    reason="Division has items but was not marked as included"
                )
                status = "included"

            # Enrich line items (items already retrieved above)
            enriched_items = []
            
            for item in items:
                enriched_item = await self._enrich_line_item(
                    item=item,
                    division_code=div_code
                )
                enriched_items.append(enriched_item)
            
            # Create enriched division
            division = EnrichedDivision(
                division_code=div_code,
                division_name=div_name,
                status=status,
                description=description,
                line_items=enriched_items
            )
            division.calculate_subtotals()
            enriched_divisions.append(division)
        
        return enriched_divisions
    
    async def _generate_searchable_names(
        self,
        divisions: List[EnrichedDivision],
        finish_level: str,
        project_type: str = "remodel"
    ) -> Dict[str, Dict[str, str]]:
        """Generate searchable product names for line items.

        Uses LLM to generate specific, searchable product names that will
        return accurate results on Home Depot/Lowe's Google Shopping.

        Args:
            divisions: List of enriched divisions with line items.
            finish_level: Project finish level (budget, mid_range, high_end, luxury).
            project_type: Type of project (kitchen_remodel, bathroom_remodel, etc.)

        Returns:
            Dict mapping item_id to {searchable_name, search_category}.
        """
        # Collect material items that need searchable names
        items_to_process = []
        for div in divisions:
            if div.status != "included":
                continue
            for item in div.line_items:
                # Process ALL items, not just ones with material costs
                # The LLM will help generate appropriate searchable names
                items_to_process.append({
                    "id": item.id,
                    "description": item.item,
                    "specifications": item.specifications or "",
                    "unit": item.unit,
                    "division": div.division_code,
                    "division_name": div.division_name
                })

        if not items_to_process:
            return {}

        # Process in batches of 20 items
        searchable_names = {}
        batch_size = 20

        for i in range(0, len(items_to_process), batch_size):
            batch = items_to_process[i:i + batch_size]

            try:
                result = await self.llm.generate_json(
                    system_prompt=GENERATE_SEARCHABLE_NAMES_PROMPT,
                    user_message=json.dumps({
                        "items": batch,
                        "finish_level": finish_level,
                        "project_type": project_type
                    }, indent=2)
                )

                self._tokens_used += result.get("tokens_used", 0)
                response = result.get("content", {})

                for item_data in response.get("searchable_names", []):
                    item_id = item_data.get("id")
                    if item_id:
                        # Skip labor-only items (no material to search)
                        is_labor_only = item_data.get("is_labor_only", False)
                        searchable_name = item_data.get("searchable_name")

                        # Only add if it's a material item with a valid searchable name
                        if not is_labor_only and searchable_name:
                            searchable_names[item_id] = {
                                "searchable_name": searchable_name,
                                "search_category": item_data.get("search_category", "other"),
                                "is_labor_only": False
                            }
                        else:
                            # Mark as labor-only so cost_agent knows not to search
                            searchable_names[item_id] = {
                                "searchable_name": None,
                                "search_category": item_data.get("search_category", "labor"),
                                "is_labor_only": True
                            }

            except Exception as e:
                logger.warning(
                    "searchable_name_generation_failed",
                    batch_start=i,
                    batch_size=len(batch),
                    error=str(e)
                )
                # Generate fallback names for this batch
                for item in batch:
                    searchable_names[item["id"]] = {
                        "searchable_name": self._generate_fallback_searchable_name(
                            item["description"], finish_level
                        ),
                        "search_category": "other"
                    }

        return searchable_names

    def _generate_fallback_searchable_name(
        self,
        description: str,
        finish_level: str
    ) -> str:
        """Generate a fallback searchable name without LLM.

        Args:
            description: Item description.
            finish_level: Project finish level.

        Returns:
            Basic searchable name.
        """
        # Add finish level qualifier
        qualifiers = {
            "budget": "standard",
            "mid_range": "mid-grade",
            "high_end": "premium",
            "luxury": "luxury"
        }
        qualifier = qualifiers.get(finish_level, "")

        # Clean up description
        name = description.lower().strip()

        # Add qualifier if not already present
        if qualifier and qualifier not in name:
            return f"{qualifier} {name}"
        return name

    async def _generate_labor_estimates_with_llm(
        self,
        divisions: List[EnrichedDivision],
        project_type: str,
        finish_level: str,
        total_sqft: float
    ) -> Dict[str, Dict[str, Any]]:
        """Use LLM to generate realistic labor hour estimates for all line items.

        This replaces the mock data lookup with intelligent LLM-based estimates
        that consider the actual project context.

        Args:
            divisions: List of enriched divisions with line items.
            project_type: Type of project (bathroom_remodel, kitchen_remodel, etc.)
            finish_level: Finish level (budget, mid_range, high_end, luxury).
            total_sqft: Total square footage of the project.

        Returns:
            Dict mapping item_id to labor estimate data.
        """
        # Collect all items for LLM processing
        items_for_llm = []
        for div in divisions:
            if div.status != "included":
                continue
            for item in div.line_items:
                items_for_llm.append({
                    "id": item.id,
                    "description": item.item,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "division": div.division_code,
                    "division_name": div.division_name
                })

        if not items_for_llm:
            return {}

        logger.info(
            "generating_labor_estimates_with_llm",
            item_count=len(items_for_llm),
            project_type=project_type,
            finish_level=finish_level
        )

        try:
            result = await self.llm.generate_json(
                system_prompt=GENERATE_MATERIALS_AND_LABOR_PROMPT,
                user_message=json.dumps({
                    "project_type": project_type,
                    "finish_level": finish_level,
                    "total_sqft": total_sqft,
                    "items": items_for_llm
                }, indent=2)
            )

            self._tokens_used += result.get("tokens_used", 0)
            response = result.get("content", {})

            # Build lookup dict from response
            labor_estimates = {}
            for item_data in response.get("enriched_items", []):
                item_id = item_data.get("id")
                if item_id:
                    labor_estimates[item_id] = {
                        "labor_hours_per_unit": item_data.get("labor_hours_per_unit", 0.5),
                        "total_labor_hours": item_data.get("total_labor_hours", 0),
                        "material_cost_per_unit": item_data.get("material_cost_per_unit", 0),
                        "primary_trade": item_data.get("primary_trade", "general_labor"),
                        "reasoning": item_data.get("reasoning", "")
                    }

            total_hours = response.get("total_project_labor_hours", 0)
            labor_summary = response.get("labor_summary", {})

            logger.info(
                "llm_labor_estimates_generated",
                items_estimated=len(labor_estimates),
                total_project_hours=total_hours,
                labor_summary=labor_summary
            )

            # Log the detailed breakdown for debugging
            print(f"\n{'='*60}")
            print(f"[LLM LABOR ESTIMATE] Generated for {len(labor_estimates)} items")
            print(f"{'='*60}")
            print(f"  Project Type: {project_type}")
            print(f"  Finish Level: {finish_level}")
            print(f"  Total Sqft: {total_sqft}")
            print(f"  TOTAL PROJECT LABOR HOURS: {total_hours}")
            print(f"\n  Labor by Trade:")
            for trade, hours in labor_summary.items():
                print(f"    - {trade}: {hours} hours")
            print(f"{'='*60}\n")

            return labor_estimates

        except Exception as e:
            logger.warning(
                "llm_labor_estimate_failed",
                error=str(e)
            )
            # Return empty dict - will fall back to mock data
            return {}

    async def _enrich_line_item(
        self,
        item: Dict[str, Any],
        division_code: str
    ) -> EnrichedLineItem:
        """Enrich a single line item with cost code.
        
        Args:
            item: Line item from clarification output.
            division_code: CSI division code.
            
        Returns:
            Enriched line item.
        """
        item_id = item.get("id", "")
        description = item.get("item", "")
        subdivision_code = item.get("subdivisionCode")
        quantity = item.get("quantity", 0)
        unit = item.get("unit", "EA")
        specs = item.get("specifications")
        notes = item.get("notes")
        confidence = item.get("confidence", 0.8)
        source = item.get("source", "inferred")
        
        # Look up cost code
        cost_code_data = await self.cost_data_service.get_cost_code(
            item_description=description,
            division_code=division_code,
            subdivision_code=subdivision_code
        )
        
        # Build cost code model
        cost_code = CostCode(
            code=cost_code_data["cost_code"],
            description=cost_code_data["description"],
            subdivision=cost_code_data.get("subdivision"),
            source=CostCodeSource(cost_code_data.get("source", "inferred")),
            confidence=cost_code_data.get("confidence", 0.5)
        )
        
        # Build unit cost reference
        primary_trade_str = cost_code_data.get("primary_trade", "general_labor")
        try:
            primary_trade = TradeCategory(primary_trade_str)
        except ValueError:
            primary_trade = TradeCategory.GENERAL_LABOR
        
        secondary_trades_str = cost_code_data.get("secondary_trades", [])
        secondary_trades = []
        for t in secondary_trades_str:
            try:
                secondary_trades.append(TradeCategory(t))
            except ValueError:
                pass
        
        unit_cost_ref = UnitCostReference(
            material_cost_per_unit=cost_code_data.get("material_cost_per_unit", 0),
            labor_hours_per_unit=cost_code_data.get("labor_hours_per_unit", 0),
            primary_trade=primary_trade,
            secondary_trades=secondary_trades,
            equipment_cost_per_unit=cost_code_data.get("equipment_cost_per_unit", 0),
            cost_code_source=cost_code_data.get("source", "mock")
        )
        
        # Calculate estimates
        material_cost = quantity * unit_cost_ref.material_cost_per_unit
        labor_hours = quantity * unit_cost_ref.labor_hours_per_unit
        equipment_cost = quantity * unit_cost_ref.equipment_cost_per_unit
        
        return EnrichedLineItem(
            id=item_id,
            item=description,
            original_subdivision_code=subdivision_code,
            quantity=quantity,
            unit=unit,
            specifications=specs,
            notes=notes,
            original_confidence=confidence,
            source=source,
            cost_code=cost_code,
            unit_cost_reference=unit_cost_ref,
            quantity_validation=QuantityValidationStatus.ESTIMATED,
            estimated_material_cost=round(material_cost, 2),
            estimated_labor_hours=round(labor_hours, 2),
            estimated_equipment_cost=round(equipment_cost, 2)
        )
    
    def _validate_quantities(
        self,
        divisions: List[EnrichedDivision],
        cad_data: Dict[str, Any],
        total_sqft: float
    ) -> List[EnrichedDivision]:
        """Validate quantities against CAD data.
        
        Args:
            divisions: List of enriched divisions.
            cad_data: CAD data from clarification output.
            total_sqft: Total square footage from scope.
            
        Returns:
            Divisions with validated quantities.
        """
        space_model = cad_data.get("spaceModel", {})
        cad_sqft = space_model.get("totalSqft", 0)
        rooms = space_model.get("rooms", [])
        walls = space_model.get("walls", [])
        
        # Calculate derived values from CAD
        total_wall_length = sum(w.get("length", 0) for w in walls)
        wall_height = 9  # Default ceiling height
        if walls:
            wall_height = walls[0].get("height", 9)
        wall_sqft = total_wall_length * wall_height
        
        for division in divisions:
            if division.status != "included":
                continue
            
            for item in division.line_items:
                unit = item.unit.upper()
                
                # Validate SF quantities against CAD sqft
                if unit == "SF":
                    if "floor" in item.item.lower() or "flooring" in item.item.lower():
                        # Flooring should match room sqft (+/- waste factor)
                        if cad_sqft > 0:
                            expected_min = cad_sqft * 0.95
                            expected_max = cad_sqft * 1.15  # 15% waste factor max
                            if expected_min <= item.quantity <= expected_max:
                                item.quantity_validation = QuantityValidationStatus.VALIDATED
                            else:
                                item.quantity_validation = QuantityValidationStatus.DISCREPANCY
                                item.quantity_discrepancy_notes = (
                                    f"Quantity {item.quantity} SF vs CAD {cad_sqft} SF"
                                )
                        else:
                            item.quantity_validation = QuantityValidationStatus.ESTIMATED
                    elif "wall" in item.item.lower() or "paint" in item.item.lower():
                        # Wall paint should be reasonable for wall area
                        if wall_sqft > 0:
                            expected_min = wall_sqft * 0.8
                            expected_max = wall_sqft * 1.2
                            if expected_min <= item.quantity <= expected_max:
                                item.quantity_validation = QuantityValidationStatus.VALIDATED
                            else:
                                item.quantity_validation = QuantityValidationStatus.ESTIMATED
                        else:
                            item.quantity_validation = QuantityValidationStatus.ESTIMATED
                    else:
                        item.quantity_validation = QuantityValidationStatus.ESTIMATED
                
                # Validate LF quantities
                elif unit == "LF":
                    if "cabinet" in item.item.lower():
                        # Cabinets - reasonable check
                        item.quantity_validation = QuantityValidationStatus.ESTIMATED
                    elif "crown" in item.item.lower() or "base" in item.item.lower():
                        # Trim should relate to perimeter
                        item.quantity_validation = QuantityValidationStatus.ESTIMATED
                    else:
                        item.quantity_validation = QuantityValidationStatus.ESTIMATED
                
                # EA quantities are harder to validate from CAD
                else:
                    item.quantity_validation = QuantityValidationStatus.ESTIMATED
        
        return divisions
    
    def _check_completeness(
        self,
        divisions: List[EnrichedDivision],
        project_type: str
    ) -> CompletenessCheck:
        """Check completeness of the Bill of Quantities.
        
        Args:
            divisions: List of enriched divisions.
            project_type: Type of project.
            
        Returns:
            CompletenessCheck with metrics and warnings.
        """
        # Gather metrics
        total_items = sum(d.item_count for d in divisions if d.status == "included")
        items_with_codes = sum(d.items_with_cost_codes for d in divisions if d.status == "included")
        items_validated = sum(d.items_validated for d in divisions if d.status == "included")
        
        # Calculate coverage
        code_coverage = items_with_codes / total_items if total_items > 0 else 0
        validation_coverage = items_validated / total_items if total_items > 0 else 0
        
        # Check all items have quantities
        all_have_quantities = True
        for div in divisions:
            for item in div.line_items:
                if item.quantity <= 0:
                    all_have_quantities = False
                    break
        
        # Check expected divisions
        expected_divs = EXPECTED_DIVISIONS_BY_PROJECT_TYPE.get(project_type, [])
        included_div_codes = [d.division_code for d in divisions if d.status == "included"]
        missing_expected = [d for d in expected_divs if d not in included_div_codes]
        
        all_required_present = len(missing_expected) == 0
        
        # Generate warnings
        warnings = []
        if missing_expected:
            missing_names = [CSI_DIVISION_NAMES.get(d, f"Div {d}") for d in missing_expected]
            warnings.append(f"Potentially missing divisions for {project_type}: {', '.join(missing_names)}")
        
        if code_coverage < 0.95:
            warnings.append(f"Only {code_coverage:.0%} of items have cost codes assigned")
        
        if validation_coverage < 0.5:
            warnings.append(f"Only {validation_coverage:.0%} of quantities validated against CAD")
        
        return CompletenessCheck(
            all_items_have_cost_codes=code_coverage >= 0.99,
            all_items_have_quantities=all_have_quantities,
            all_required_divisions_present=all_required_present,
            quantity_validation_complete=validation_coverage >= 0.8,
            warnings=warnings,
            missing_items=[],  # Will be filled by LLM
            suggested_additions=[],  # Will be filled by LLM
            cost_code_coverage=code_coverage,
            quantity_validation_coverage=validation_coverage
        )
    
    async def _analyze_with_llm(
        self,
        estimate_id: str,
        project_type: str,
        finish_level: str,
        total_sqft: float,
        divisions: List[EnrichedDivision],
        completeness: CompletenessCheck,
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Use LLM to analyze scope.
        
        Args:
            estimate_id: The estimate ID.
            project_type: Type of project.
            finish_level: Finish level (budget, mid_range, etc.).
            total_sqft: Total square footage.
            divisions: Enriched divisions.
            completeness: Completeness metrics.
            feedback: Optional critic feedback.
            
        Returns:
            LLM analysis results.
        """
        # Build system prompt with feedback if retry
        system_prompt = self.build_system_prompt(
            SCOPE_AGENT_SYSTEM_PROMPT,
            feedback
        )
        
        # Build user message
        user_message = self._build_llm_user_message(
            project_type=project_type,
            finish_level=finish_level,
            total_sqft=total_sqft,
            divisions=divisions,
            completeness=completeness
        )
        
        try:
            result = await self.llm.generate_json(
                system_prompt=system_prompt,
                user_message=user_message
            )
            
            self._tokens_used = result.get("tokens_used", 0)
            analysis = result.get("content", {})
            
            logger.info(
                "llm_analysis_completed",
                estimate_id=estimate_id,
                tokens_used=self._tokens_used
            )
            
            return analysis
            
        except Exception as e:
            logger.warning(
                "llm_analysis_fallback",
                estimate_id=estimate_id,
                error=str(e)
            )
            
            # Return fallback analysis
            return self._generate_fallback_analysis(
                project_type=project_type,
                finish_level=finish_level,
                divisions=divisions,
                completeness=completeness
            )
    
    def _build_llm_user_message(
        self,
        project_type: str,
        finish_level: str,
        total_sqft: float,
        divisions: List[EnrichedDivision],
        completeness: CompletenessCheck
    ) -> str:
        """Build user message for LLM analysis.
        
        Args:
            project_type: Type of project.
            finish_level: Finish level.
            total_sqft: Total square footage.
            divisions: Enriched divisions.
            completeness: Completeness metrics.
            
        Returns:
            Formatted user message.
        """
        # Summarize divisions for LLM
        div_summary = []
        for div in divisions:
            if div.status == "included":
                items_preview = []
                for item in div.line_items[:5]:  # First 5 items
                    items_preview.append(f"  - {item.item} ({item.quantity} {item.unit})")
                if len(div.line_items) > 5:
                    items_preview.append(f"  - ... and {len(div.line_items) - 5} more items")
                
                div_summary.append(
                    f"**{div.division_code} - {div.division_name}** ({div.item_count} items)\n" +
                    "\n".join(items_preview)
                )
        
        return f"""## Project Information
Project Type: {project_type}
Finish Level: {finish_level}
Total Sqft: {total_sqft}

## Completeness Metrics
- Cost Code Coverage: {completeness.cost_code_coverage:.0%}
- Quantity Validation: {completeness.quantity_validation_coverage:.0%}
- All Required Divisions Present: {completeness.all_required_divisions_present}
- Warnings: {', '.join(completeness.warnings) if completeness.warnings else 'None'}

## Included Divisions Summary
{chr(10).join(div_summary)}

Please analyze this scope and provide your assessment in the required JSON format."""
    
    def _generate_fallback_analysis(
        self,
        project_type: str,
        finish_level: str,
        divisions: List[EnrichedDivision],
        completeness: CompletenessCheck
    ) -> Dict[str, Any]:
        """Generate fallback analysis when LLM is unavailable.
        
        Args:
            project_type: Type of project.
            finish_level: Finish level.
            divisions: Enriched divisions.
            completeness: Completeness metrics.
            
        Returns:
            Basic analysis dict.
        """
        included_count = sum(1 for d in divisions if d.status == "included")
        total_items = sum(d.item_count for d in divisions)
        
        summary = (
            f"{project_type.replace('_', ' ').title()} project with {total_items} line items "
            f"across {included_count} CSI divisions. Finish level: {finish_level}."
        )
        
        key_observations = [
            f"Scope includes {included_count} active CSI divisions",
            f"Cost code coverage: {completeness.cost_code_coverage:.0%}",
            f"Quantity validation: {completeness.quantity_validation_coverage:.0%}"
        ]
        
        if completeness.warnings:
            key_observations.extend(completeness.warnings[:2])
        
        return {
            "summary": summary,
            "key_observations": key_observations,
            "material_highlights": ["Material selections defined per line item specifications"],
            "complexity_factors": [f"Standard {project_type.replace('_', ' ')} complexity"],
            "finish_level_assessment": f"Materials specified for {finish_level.replace('_', ' ')} finish level",
            "recommendations": [
                "Review line item quantities against CAD measurements",
                "Verify material selections with client before finalizing estimate"
            ],
            "missing_items": completeness.warnings[:2] if completeness.warnings else [],
            "suggested_additions": []
        }
    
    def _build_bill_of_quantities(
        self,
        estimate_id: str,
        project_type: str,
        finish_level: str,
        total_sqft: float,
        divisions: List[EnrichedDivision],
        completeness: CompletenessCheck,
        analysis: Dict[str, Any]
    ) -> BillOfQuantities:
        """Build the final Bill of Quantities model.
        
        Args:
            estimate_id: The estimate ID.
            project_type: Project type.
            finish_level: Finish level.
            total_sqft: Total square footage.
            divisions: Enriched divisions.
            completeness: Completeness check.
            analysis: LLM analysis results.
            
        Returns:
            Complete BillOfQuantities model.
        """
        # Build scope analysis
        scope_analysis = ScopeAnalysis(
            summary=analysis.get("summary", f"{project_type} scope analysis"),
            key_observations=analysis.get("key_observations", []),
            material_highlights=analysis.get("material_highlights", []),
            complexity_factors=analysis.get("complexity_factors", []),
            finish_level_assessment=analysis.get("finish_level_assessment", ""),
            recommendations=analysis.get("recommendations", [])
        )
        
        # Calculate confidence based on completeness and LLM analysis
        confidence = (
            completeness.cost_code_coverage * 0.4 +
            completeness.quantity_validation_coverage * 0.3 +
            (1.0 if completeness.all_required_divisions_present else 0.7) * 0.3
        )
        
        # Build BoQ
        boq = BillOfQuantities(
            estimate_id=estimate_id,
            project_type=project_type,
            finish_level=finish_level,
            total_sqft=total_sqft,
            divisions=divisions,
            completeness=completeness,
            analysis=scope_analysis,
            confidence=round(confidence, 2)
        )
        
        # Calculate totals
        boq.calculate_totals()
        
        return boq
