"""Location Agent for TrueCost.

Analyzes location-based cost factors for construction estimates.
Uses Serper API for web search, BLS API for labor rates, and LLM to extract and analyze data.

This agent:
1. Searches the web for cost of living, permit fees, weather data
2. Fetches real labor rates from BLS API
3. Uses LLM to extract structured data from search results
4. Generates location cost factors and insights
"""

from typing import Dict, Any, Optional, List
import asyncio
import json
import time
import structlog

from agents.base_agent import BaseA2AAgent
from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from services.cost_data_service import CostDataService
from services.serper_service import SerperService, get_serper_service
from services.bls_service import (
    get_labor_rates_for_zip,
    get_state_for_zip,
    BLSResponse,
)
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

logger = structlog.get_logger()


# =============================================================================
# SYSTEM PROMPTS
# =============================================================================

LOCATION_AGENT_SYSTEM_PROMPT = """You are an expert construction cost analyst specializing in location-based cost factors.

Your role is to analyze location data and provide insights about how the location will impact construction costs for a project.

## Your Expertise Includes:
- Regional labor market conditions and union presence
- Local permit requirements and fees
- Weather and seasonal impacts on construction schedules
- Material cost variations by region
- Local building codes and requirements

## Input You Will Receive:
1. Project location (city, state, ZIP code)
2. BLS labor rate data (real data from Bureau of Labor Statistics)
3. Web search results for cost of living, permit fees, weather, union status
4. Any feedback from a previous iteration

## Your Output Must Include:
1. **analysis**: Detailed analysis of location factors (2-4 paragraphs)
2. **key_findings**: List of 3-5 key findings that impact the estimate
3. **recommendations**: List of 2-3 recommendations for the project
4. **risk_factors**: List of location-specific risks
5. **confidence_assessment**: Your assessment of data quality and confidence

## Response Format:
You MUST respond with valid JSON only. No markdown, no explanation.

{
    "analysis": "Your detailed analysis...",
    "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
    "recommendations": ["Recommendation 1", "Recommendation 2"],
    "risk_factors": ["Risk 1", "Risk 2"],
    "confidence_assessment": "Your confidence assessment..."
}

## Guidelines:
- Use the BLS labor rate data as authoritative source for wage information
- Extract specific numbers from web search results when available
- Be specific about how each factor impacts costs
- Consider seasonal timing for the project
- Highlight any unusual factors for the location
- Provide actionable recommendations
- Be concise but thorough
"""


EXTRACT_LOCATION_DATA_PROMPT = """You are a data extraction assistant. Given web search results about a location, extract structured data for construction cost estimation.

Extract the following if present in the search results:
1. Cost of living index (if found)
2. Building permit fees (if specific numbers found)
3. Union labor prevalence (union/non-union/mixed)
4. Weather data relevant to construction (frost depth, rain days, extreme temperatures)
5. Any specific permit requirements mentioned

## Output Format (JSON):
{
    "costOfLivingIndex": <number or null>,
    "costOfLivingSource": "<source url or description if found>",
    "estimatedPermitFees": {
        "buildingPermitBase": <number or null>,
        "buildingPermitPercentage": <percentage as decimal or null>,
        "electricalPermit": <number or null>,
        "plumbingPermit": <number or null>
    },
    "unionStatus": "union" | "non_union" | "mixed" | "unknown",
    "unionDetails": "<any details found>",
    "weatherData": {
        "frostLineDepth": <inches or null>,
        "averageRainDays": <number or null>,
        "extremeHeatDays": <number or null>,
        "winterSeverity": "none" | "mild" | "moderate" | "severe" | "unknown"
    },
    "additionalNotes": ["any relevant notes extracted"]
}

Only include data that is explicitly mentioned in the search results. Use null for missing data.
Do not invent or guess values - only extract what is clearly stated.
"""


# =============================================================================
# REGION MAPPING
# =============================================================================

STATE_TO_REGION: Dict[str, Region] = {
    # Northeast
    "CT": Region.NORTHEAST, "ME": Region.NORTHEAST, "MA": Region.NORTHEAST,
    "NH": Region.NORTHEAST, "NJ": Region.NORTHEAST, "NY": Region.NORTHEAST,
    "PA": Region.NORTHEAST, "RI": Region.NORTHEAST, "VT": Region.NORTHEAST,
    # Southeast
    "AL": Region.SOUTHEAST, "FL": Region.SOUTHEAST, "GA": Region.SOUTHEAST,
    "KY": Region.SOUTHEAST, "MS": Region.SOUTHEAST, "NC": Region.SOUTHEAST,
    "SC": Region.SOUTHEAST, "TN": Region.SOUTHEAST, "VA": Region.SOUTHEAST,
    "WV": Region.SOUTHEAST,
    # Midwest
    "IL": Region.MIDWEST, "IN": Region.MIDWEST, "MI": Region.MIDWEST,
    "MN": Region.MIDWEST, "OH": Region.MIDWEST, "WI": Region.MIDWEST,
    "IA": Region.MIDWEST, "MO": Region.MIDWEST, "ND": Region.MIDWEST,
    "SD": Region.MIDWEST, "NE": Region.MIDWEST, "KS": Region.MIDWEST,
    # South
    "AR": Region.SOUTH, "LA": Region.SOUTH, "OK": Region.SOUTH, "TX": Region.SOUTH,
    # Southwest
    "AZ": Region.SOUTHWEST, "NM": Region.SOUTHWEST, "NV": Region.SOUTHWEST,
    # Mountain
    "CO": Region.MOUNTAIN, "ID": Region.MOUNTAIN, "MT": Region.MOUNTAIN,
    "UT": Region.MOUNTAIN, "WY": Region.MOUNTAIN,
    # Pacific
    "AK": Region.PACIFIC, "CA": Region.PACIFIC, "HI": Region.PACIFIC,
    "OR": Region.PACIFIC, "WA": Region.PACIFIC,
    # DC
    "DC": Region.NORTHEAST,
}

# States with strong union presence
UNION_STATES = {"NY", "NJ", "IL", "CA", "WA", "MA", "CT", "PA", "OH", "MI"}
NON_UNION_STATES = {"TX", "FL", "GA", "NC", "SC", "TN", "AL", "MS", "AR", "OK", "AZ"}


# =============================================================================
# LOCATION AGENT CLASS
# =============================================================================


class LocationAgent(BaseA2AAgent):
    """Location Agent - analyzes location factors for construction estimates.

    This agent:
    1. Extracts location from ClarificationOutput
    2. Fetches BLS labor rates for the location
    3. Searches web for cost of living, permit fees, weather, union status
    4. Uses LLM to extract structured data from search results
    5. Uses LLM to analyze and generate insights
    6. Saves results to Firestore
    """

    def __init__(
        self,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None,
        cost_data_service: Optional[CostDataService] = None,
        serper_service: Optional[SerperService] = None
    ):
        """Initialize LocationAgent.

        Args:
            firestore_service: Optional Firestore service instance.
            llm_service: Optional LLM service instance.
            cost_data_service: Optional cost data service instance.
            serper_service: Optional Serper service instance.
        """
        super().__init__(
            name="location",
            firestore_service=firestore_service,
            llm_service=llm_service
        )
        self.cost_data_service = cost_data_service or CostDataService()
        self.serper = serper_service or get_serper_service()

    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run location analysis.

        Args:
            estimate_id: The estimate document ID.
            input_data: Input containing clarification_output.
            feedback: Optional critic feedback for retry.

        Returns:
            Location factors dict with analysis.
        """
        self._start_time = time.time()

        logger.info(
            "location_agent_running",
            estimate_id=estimate_id,
            has_feedback=feedback is not None
        )

        # Step 1: Extract location from clarification output
        location_info = self._extract_location(input_data)
        zip_code = location_info.get("zipCode", "00000")
        city = location_info.get("city", "Unknown")
        state = location_info.get("state", "XX")

        logger.info(
            "location_extracted",
            estimate_id=estimate_id,
            zip_code=zip_code,
            city=city,
            state=state
        )

        # Step 2: Fetch data from multiple sources in parallel
        bls_task = self._fetch_bls_labor_rates(zip_code)
        search_task = self._search_location_data(city, state, zip_code)

        bls_response, search_data = await asyncio.gather(
            bls_task, search_task, return_exceptions=True
        )

        # Handle potential errors
        if isinstance(bls_response, Exception):
            logger.warning("bls_fetch_failed", error=str(bls_response))
            bls_response = None

        if isinstance(search_data, Exception):
            logger.warning("search_fetch_failed", error=str(search_data))
            search_data = {}

        # Step 3: Extract structured data from search results using LLM
        extracted_data = await self._extract_data_from_search(search_data)

        # Step 4: Build location factors from all data sources
        location_factors = self._build_location_factors(
            zip_code=zip_code,
            city=city,
            state=state,
            bls_response=bls_response,
            extracted_data=extracted_data
        )

        logger.info(
            "location_factors_built",
            estimate_id=estimate_id,
            location_factor=location_factors.location_factor,
            union_status=location_factors.union_status.value,
            confidence=location_factors.confidence,
            bls_source=bls_response is not None,
            extracted_data_available=bool(extracted_data)
        )

        # Step 5: Use LLM to analyze location factors
        llm_analysis = await self._analyze_with_llm(
            estimate_id=estimate_id,
            location_info=location_info,
            location_factors=location_factors,
            bls_response=bls_response,
            search_data=search_data,
            extracted_data=extracted_data,
            feedback=feedback
        )

        # Step 6: Build output
        output = self._build_output(
            location_factors=location_factors,
            llm_analysis=llm_analysis,
            location_info=location_info,
            bls_response=bls_response
        )

        # Step 7: Save output to Firestore
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
            "location_agent_completed",
            estimate_id=estimate_id,
            location_factor=output["locationFactor"],
            confidence=output["confidence"],
            duration_ms=self.duration_ms
        )

        return output

    def _extract_location(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract location information from input data.

        Args:
            input_data: Input containing clarification_output.

        Returns:
            Location information dict.
        """
        clarification = input_data.get("clarification_output", {})
        project_brief = clarification.get("projectBrief", {})
        location = project_brief.get("location", {})

        return {
            "zipCode": location.get("zipCode", "00000"),
            "city": location.get("city", "Unknown"),
            "state": location.get("state", "XX"),
            "fullAddress": location.get("fullAddress", ""),
            "county": location.get("county"),
            "coordinates": location.get("coordinates")
        }

    async def _fetch_bls_labor_rates(self, zip_code: str) -> Optional[BLSResponse]:
        """Fetch labor rates from BLS API.

        Args:
            zip_code: ZIP code for rate lookup

        Returns:
            BLSResponse with labor rates, or None on failure
        """
        try:
            return await get_labor_rates_for_zip(zip_code)
        except Exception as e:
            logger.warning("bls_api_error", zip_code=zip_code, error=str(e))
            return None

    async def _search_location_data(
        self,
        city: str,
        state: str,
        zip_code: str
    ) -> Dict[str, Any]:
        """Search web for location data.

        Args:
            city: City name
            state: State abbreviation
            zip_code: ZIP code

        Returns:
            Dict with search results for each category
        """
        try:
            # Run searches in parallel
            col_task = self.serper.search_cost_of_living(city, state)
            permit_task = self.serper.search_permit_fees(city, state, "renovation")
            weather_task = self.serper.search_weather_data(city, state)
            union_task = self.serper.search_union_status(city, state)

            results = await asyncio.gather(
                col_task, permit_task, weather_task, union_task,
                return_exceptions=True
            )

            return {
                "costOfLiving": results[0] if not isinstance(results[0], Exception) else {},
                "permits": results[1] if not isinstance(results[1], Exception) else {},
                "weather": results[2] if not isinstance(results[2], Exception) else {},
                "union": results[3] if not isinstance(results[3], Exception) else {},
            }
        except Exception as e:
            logger.warning("search_location_data_error", error=str(e))
            return {}

    async def _extract_data_from_search(
        self,
        search_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Use LLM to extract structured data from search results.

        Args:
            search_data: Raw search results from Serper

        Returns:
            Extracted structured data
        """
        if not search_data:
            return {}

        try:
            # Build a summary of search results for the LLM
            search_summary = self._build_search_summary(search_data)

            if not search_summary.strip():
                return {}

            result = await self.llm.generate_json(
                system_prompt=EXTRACT_LOCATION_DATA_PROMPT,
                user_message=f"Extract location data from these search results:\n\n{search_summary}"
            )

            self._tokens_used += result.get("tokens_used", 0)
            return result.get("content", {})

        except Exception as e:
            logger.warning("extract_search_data_error", error=str(e))
            return {}

    def _build_search_summary(self, search_data: Dict[str, Any]) -> str:
        """Build a text summary of search results.

        Args:
            search_data: Raw search results

        Returns:
            Formatted text summary
        """
        parts = []

        for category, data in search_data.items():
            if not data or not isinstance(data, dict):
                continue

            results = data.get("results", [])
            if not results:
                continue

            parts.append(f"\n## {category.upper()} SEARCH RESULTS:")
            for r in results[:3]:  # Limit to top 3 results
                if isinstance(r, dict):
                    title = r.get("title", "")
                    snippet = r.get("snippet", "")
                    if title or snippet:
                        parts.append(f"- {title}: {snippet}")

        return "\n".join(parts)

    def _build_location_factors(
        self,
        zip_code: str,
        city: str,
        state: str,
        bls_response: Optional[BLSResponse],
        extracted_data: Dict[str, Any]
    ) -> LocationFactors:
        """Build LocationFactors from collected data.

        Args:
            zip_code: ZIP code
            city: City name
            state: State abbreviation
            bls_response: BLS API response with labor rates
            extracted_data: Data extracted from web search

        Returns:
            LocationFactors object
        """
        # Get region
        region = STATE_TO_REGION.get(state.upper(), Region.MIDWEST)

        # Build labor rates from BLS data
        labor_rates = self._build_labor_rates(bls_response)

        # Build permit costs from extracted data or defaults
        permit_costs = self._build_permit_costs(extracted_data)

        # Build weather factors from extracted data or defaults
        weather_factors = self._build_weather_factors(state, extracted_data)

        # Determine union status
        union_status = self._determine_union_status(state, extracted_data)

        # Calculate location factor
        location_factor = self._calculate_location_factor(
            state, bls_response, extracted_data
        )

        # Calculate confidence based on data sources
        confidence = self._calculate_confidence(bls_response, extracted_data)

        # Build material adjustments based on region
        material_adjustments = self._build_material_adjustments(region, location_factor)

        # Build summary
        summary = (
            f"{city}, {state} ({zip_code}) - {region.value} region with "
            f"{union_status.value} market. Location factor: {location_factor:.2f}."
        )

        return LocationFactors(
            zip_code=zip_code,
            city=city,
            state=state,
            county=None,
            region=region,
            labor_rates=labor_rates,
            permit_costs=permit_costs,
            weather_factors=weather_factors,
            material_adjustments=material_adjustments,
            union_status=union_status,
            location_factor=location_factor,
            confidence=confidence,
            summary=summary
        )

    def _build_labor_rates(self, bls_response: Optional[BLSResponse]) -> LaborRates:
        """Build LaborRates from BLS response.

        Args:
            bls_response: BLS API response

        Returns:
            LaborRates object
        """
        if not bls_response or not bls_response.rates:
            # Return default rates
            return LaborRates(
                electrician=55.0, plumber=58.0, carpenter=45.0, hvac=56.0,
                general_labor=32.0, painter=40.0, tile_setter=48.0, roofer=42.0,
                concrete_finisher=45.0, drywall_installer=42.0
            )

        rates = bls_response.rates

        # Convert BLS rates (base hourly) to fully loaded rates (with burden)
        return LaborRates(
            electrician=rates.get("electrician", type("", (), {"total_rate": 55.0})).total_rate,
            plumber=rates.get("plumber", type("", (), {"total_rate": 58.0})).total_rate,
            carpenter=rates.get("carpenter", type("", (), {"total_rate": 45.0})).total_rate,
            hvac=rates.get("hvac_tech", type("", (), {"total_rate": 56.0})).total_rate,
            general_labor=rates.get("general_labor", type("", (), {"total_rate": 32.0})).total_rate,
            painter=rates.get("painter", type("", (), {"total_rate": 40.0})).total_rate,
            tile_setter=rates.get("tile_setter", type("", (), {"total_rate": 48.0})).total_rate,
            roofer=rates.get("roofer", type("", (), {"total_rate": 42.0})).total_rate,
            concrete_finisher=45.0,  # Not in BLS, use default
            drywall_installer=42.0  # Not in BLS, use default
        )

    def _build_permit_costs(self, extracted_data: Dict[str, Any]) -> PermitCosts:
        """Build PermitCosts from extracted data.

        Args:
            extracted_data: Data extracted from web search

        Returns:
            PermitCosts object
        """
        permit_data = extracted_data.get("estimatedPermitFees", {}) or {}

        return PermitCosts(
            building_permit_base=permit_data.get("buildingPermitBase") or 500.0,
            building_permit_percentage=permit_data.get("buildingPermitPercentage") or 0.015,
            electrical_permit=permit_data.get("electricalPermit") or 175.0,
            plumbing_permit=permit_data.get("plumbingPermit") or 175.0,
            mechanical_permit=150.0,
            plan_review_fee=200.0,
            impact_fees=0.0,
            inspection_fees=125.0
        )

    def _build_weather_factors(
        self,
        state: str,
        extracted_data: Dict[str, Any]
    ) -> WeatherFactors:
        """Build WeatherFactors from extracted data or defaults.

        Args:
            state: State abbreviation
            extracted_data: Data extracted from web search

        Returns:
            WeatherFactors object
        """
        weather_data = extracted_data.get("weatherData", {}) or {}

        # Determine winter severity
        winter_severity = weather_data.get("winterSeverity", "unknown")
        if winter_severity == "severe":
            winter_impact = WinterImpact.SEVERE
            seasonal_adjustment = 1.12
        elif winter_severity == "moderate":
            winter_impact = WinterImpact.MODERATE
            seasonal_adjustment = 1.05
        elif winter_severity == "mild":
            winter_impact = WinterImpact.MINIMAL
            seasonal_adjustment = 1.02
        elif winter_severity == "none":
            winter_impact = WinterImpact.NONE
            seasonal_adjustment = 1.0
        else:
            # Default based on state
            winter_impact, seasonal_adjustment = self._default_weather_for_state(state)

        # Determine seasonal reason
        if seasonal_adjustment > 1.0:
            if state in {"FL", "TX", "AZ", "NV", "LA", "MS", "GA", "SC"}:
                seasonal_reason = SeasonalAdjustmentReason.SUMMER_HEAT
            else:
                seasonal_reason = SeasonalAdjustmentReason.WINTER_WEATHER
        else:
            seasonal_reason = SeasonalAdjustmentReason.NONE

        return WeatherFactors(
            winter_impact=winter_impact,
            seasonal_adjustment=seasonal_adjustment,
            seasonal_reason=seasonal_reason,
            frost_line_depth_inches=weather_data.get("frostLineDepth") or 0,
            average_rain_days_per_month=weather_data.get("averageRainDays") or 8,
            extreme_heat_days=weather_data.get("extremeHeatDays") or 0
        )

    def _default_weather_for_state(self, state: str) -> tuple:
        """Get default weather factors for a state.

        Args:
            state: State abbreviation

        Returns:
            Tuple of (WinterImpact, seasonal_adjustment)
        """
        severe_winter = {"MN", "WI", "ND", "SD", "MT", "ME", "NH", "VT", "MI", "WY"}
        moderate_winter = {"NY", "PA", "NJ", "CT", "MA", "RI", "IL", "OH", "IN", "CO", "ID", "UT"}
        mild_winter = {"WA", "OR", "VA", "KY", "TN", "NC", "MO", "KS", "NE", "NM"}
        no_winter = {"FL", "TX", "AZ", "NV", "CA", "LA", "MS", "AL", "GA", "SC", "HI"}

        if state in severe_winter:
            return WinterImpact.SEVERE, 1.12
        elif state in moderate_winter:
            return WinterImpact.MODERATE, 1.05
        elif state in mild_winter:
            return WinterImpact.MILD, 1.02
        elif state in no_winter:
            return WinterImpact.NONE, 1.0
        else:
            return WinterImpact.MODERATE, 1.05

    def _determine_union_status(
        self,
        state: str,
        extracted_data: Dict[str, Any]
    ) -> UnionStatus:
        """Determine union status from data.

        Args:
            state: State abbreviation
            extracted_data: Data extracted from web search

        Returns:
            UnionStatus enum value
        """
        # Check extracted data first
        union_str = extracted_data.get("unionStatus", "").lower()
        if union_str == "union":
            return UnionStatus.UNION
        elif union_str == "non_union" or union_str == "non-union":
            return UnionStatus.NON_UNION
        elif union_str == "mixed":
            return UnionStatus.MIXED

        # Default based on state
        if state in UNION_STATES:
            return UnionStatus.UNION
        elif state in NON_UNION_STATES:
            return UnionStatus.NON_UNION
        else:
            return UnionStatus.MIXED

    def _calculate_location_factor(
        self,
        state: str,
        bls_response: Optional[BLSResponse],
        extracted_data: Dict[str, Any]
    ) -> float:
        """Calculate overall location cost factor.

        Args:
            state: State abbreviation
            bls_response: BLS response with labor rates
            extracted_data: Extracted data from web search

        Returns:
            Location factor (1.0 = national average)
        """
        # Start with base factor from labor rates
        if bls_response and bls_response.rates:
            # Calculate average hourly rate from BLS data
            total_rates = 0
            count = 0
            for rate in bls_response.rates.values():
                total_rates += rate.total_rate
                count += 1

            if count > 0:
                avg_rate = total_rates / count
                # National average is approximately $45/hr fully loaded
                labor_factor = avg_rate / 45.0
            else:
                labor_factor = 1.0
        else:
            # Use state-based defaults
            high_cost_states = {"NY", "CA", "MA", "CT", "WA", "NJ", "HI", "AK"}
            low_cost_states = {"MS", "AR", "AL", "WV", "KY", "OK", "TN", "SC", "TX", "FL"}

            if state in high_cost_states:
                labor_factor = 1.25
            elif state in low_cost_states:
                labor_factor = 0.90
            else:
                labor_factor = 1.0

        # Adjust for cost of living if available
        col_index = extracted_data.get("costOfLivingIndex")
        if col_index and isinstance(col_index, (int, float)) and col_index > 0:
            # COL index where 100 = national average
            col_factor = col_index / 100.0
            # Blend labor factor and COL (60% labor, 40% COL)
            location_factor = (labor_factor * 0.6) + (col_factor * 0.4)
        else:
            location_factor = labor_factor

        # Ensure reasonable bounds
        return max(0.75, min(1.75, round(location_factor, 2)))

    def _calculate_confidence(
        self,
        bls_response: Optional[BLSResponse],
        extracted_data: Dict[str, Any]
    ) -> float:
        """Calculate confidence score based on data sources.

        Args:
            bls_response: BLS API response
            extracted_data: Extracted data from search

        Returns:
            Confidence score (0-1)
        """
        confidence = 0.5  # Base confidence

        # BLS data adds confidence
        if bls_response and not bls_response.cached:
            confidence += 0.25
        elif bls_response:
            confidence += 0.15

        # Extracted data adds confidence
        if extracted_data:
            if extracted_data.get("costOfLivingIndex"):
                confidence += 0.05
            if extracted_data.get("estimatedPermitFees"):
                confidence += 0.05
            if extracted_data.get("unionStatus") and extracted_data.get("unionStatus") != "unknown":
                confidence += 0.05
            if extracted_data.get("weatherData"):
                confidence += 0.05

        return min(0.95, confidence)

    def _build_material_adjustments(
        self,
        region: Region,
        location_factor: float
    ) -> MaterialCostAdjustments:
        """Build material cost adjustments based on region.

        Args:
            region: Geographic region
            location_factor: Overall location factor

        Returns:
            MaterialCostAdjustments object
        """
        # Base adjustments by region
        if region == Region.NORTHEAST:
            transport = 1.10
            lumber = 1.15
            concrete = 1.10
        elif region == Region.PACIFIC:
            transport = 1.08
            lumber = 1.12
            concrete = 1.08
        elif region in {Region.SOUTH, Region.SOUTHEAST}:
            transport = 0.95
            lumber = 0.95
            concrete = 0.92
        elif region == Region.MOUNTAIN:
            transport = 1.02
            lumber = 1.05
            concrete = 1.0
        else:
            transport = 1.0
            lumber = 1.0
            concrete = 1.0

        # Further adjust based on location factor
        if location_factor > 1.2:
            transport *= 1.05
            lumber *= 1.05
            concrete *= 1.05
        elif location_factor < 0.9:
            transport *= 0.95
            lumber *= 0.95
            concrete *= 0.95

        return MaterialCostAdjustments(
            transportation_factor=round(transport, 2),
            local_availability_factor=1.0,
            lumber_regional_adjustment=round(lumber, 2),
            concrete_regional_adjustment=round(concrete, 2)
        )

    async def _analyze_with_llm(
        self,
        estimate_id: str,
        location_info: Dict[str, Any],
        location_factors: LocationFactors,
        bls_response: Optional[BLSResponse],
        search_data: Dict[str, Any],
        extracted_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Use LLM to analyze location factors.

        Args:
            estimate_id: The estimate document ID.
            location_info: Extracted location information.
            location_factors: Built location factors.
            bls_response: BLS API response.
            search_data: Raw search results.
            extracted_data: Extracted data from search.
            feedback: Optional critic feedback for retry.

        Returns:
            LLM analysis results.
        """
        system_prompt = self.build_system_prompt(
            LOCATION_AGENT_SYSTEM_PROMPT,
            feedback
        )

        user_message = self._build_llm_user_message(
            location_info=location_info,
            location_factors=location_factors,
            bls_response=bls_response,
            search_data=search_data,
            extracted_data=extracted_data
        )

        try:
            result = await self.llm.generate_json(
                system_prompt=system_prompt,
                user_message=user_message
            )

            self._tokens_used += result.get("tokens_used", 0)
            analysis = result.get("content", {})

            logger.info(
                "llm_analysis_completed",
                estimate_id=estimate_id,
                tokens_used=self._tokens_used,
                has_key_findings=bool(analysis.get("key_findings"))
            )

            return analysis

        except Exception as e:
            logger.warning(
                "llm_analysis_fallback",
                estimate_id=estimate_id,
                error=str(e)
            )
            return self._generate_fallback_analysis(location_factors)

    def _build_llm_user_message(
        self,
        location_info: Dict[str, Any],
        location_factors: LocationFactors,
        bls_response: Optional[BLSResponse],
        search_data: Dict[str, Any],
        extracted_data: Dict[str, Any]
    ) -> str:
        """Build the user message for LLM analysis.

        Args:
            location_info: Extracted location information.
            location_factors: Built location factors.
            bls_response: BLS API response.
            search_data: Raw search results.
            extracted_data: Extracted data.

        Returns:
            Formatted user message string.
        """
        # Build BLS rates section
        bls_section = ""
        if bls_response and bls_response.rates:
            bls_section = "\n## BLS Labor Rates (Real Data)\n"
            bls_section += f"Metro Area: {bls_response.metro_name}\n"
            bls_section += f"Data Date: {bls_response.data_date}\n"
            bls_section += f"Data Source: {'Live API' if not bls_response.cached else 'Cached'}\n\n"
            for trade, rate in bls_response.rates.items():
                bls_section += f"- {trade}: ${rate.hourly_rate:.2f}/hr base, ${rate.total_rate:.2f}/hr loaded\n"

        # Build extracted data section
        extracted_section = ""
        if extracted_data:
            extracted_section = "\n## Data Extracted from Web Search\n"
            extracted_section += f"```json\n{json.dumps(extracted_data, indent=2)}\n```\n"

        # Build search highlights
        search_section = ""
        if search_data:
            search_section = "\n## Search Result Highlights\n"
            search_section += self._build_search_summary(search_data)

        factors_dict = location_factors.to_agent_output()

        return f"""## Project Location
City: {location_info.get('city', 'Unknown')}
State: {location_info.get('state', 'XX')}
ZIP Code: {location_info.get('zipCode', '00000')}
Full Address: {location_info.get('fullAddress', 'Not provided')}
{bls_section}
{extracted_section}
{search_section}
## Computed Location Factors
```json
{json.dumps(factors_dict, indent=2)}
```

Please analyze these location factors and provide your insights in the required JSON format."""

    def _generate_fallback_analysis(
        self,
        location_factors: LocationFactors
    ) -> Dict[str, Any]:
        """Generate fallback analysis when LLM is unavailable.

        Args:
            location_factors: Built location factors.

        Returns:
            Basic analysis dict.
        """
        is_high_cost = location_factors.location_factor > 1.1
        is_union = location_factors.union_status.value == "union"
        has_weather_impact = location_factors.weather_factors.winter_impact.value in ["moderate", "severe"]

        key_findings = []
        if is_high_cost:
            key_findings.append(f"High-cost area with {location_factors.location_factor:.0%} location factor adjustment")
        if is_union:
            key_findings.append("Strong union market - labor costs will be higher but quality standards enforced")
        if has_weather_impact:
            key_findings.append(f"Weather impact: {location_factors.weather_factors.winter_impact.value} - may affect scheduling")

        if not key_findings:
            key_findings = [
                "Standard cost area with average labor rates",
                "No significant weather impact on construction",
                "Mixed or non-union market conditions"
            ]

        recommendations = [
            "Verify permit requirements with local building department",
            "Consider seasonal timing for optimal construction conditions"
        ]

        risk_factors = []
        if location_factors.weather_factors.seasonal_adjustment > 1.05:
            risk_factors.append("Seasonal weather may impact construction timeline")
        if location_factors.location_factor > 1.2:
            risk_factors.append("High labor costs may impact budget")
        if not risk_factors:
            risk_factors = ["No significant location-specific risks identified"]

        return {
            "analysis": f"Location analysis for {location_factors.city}, {location_factors.state}. "
                       f"This is in the {location_factors.region.value} region with a "
                       f"location cost factor of {location_factors.location_factor:.2f}. "
                       f"The market is {location_factors.union_status.value}.",
            "key_findings": key_findings,
            "recommendations": recommendations,
            "risk_factors": risk_factors,
            "confidence_assessment": f"Data confidence: {location_factors.confidence:.0%}. "
                                    "Analysis based on available data sources."
        }

    def _build_output(
        self,
        location_factors: LocationFactors,
        llm_analysis: Dict[str, Any],
        location_info: Dict[str, Any],
        bls_response: Optional[BLSResponse]
    ) -> Dict[str, Any]:
        """Build the final output dict.

        Args:
            location_factors: Built location factors.
            llm_analysis: LLM analysis results.
            location_info: Original location info.
            bls_response: BLS API response.

        Returns:
            Complete output dict for the agent.
        """
        # Start with the location factors in agent output format
        output = location_factors.to_agent_output()

        # Add LLM analysis
        output["analysis"] = llm_analysis.get("analysis", "")
        output["keyFindings"] = llm_analysis.get("key_findings", [])
        output["recommendations"] = llm_analysis.get("recommendations", [])
        output["riskFactors"] = llm_analysis.get("risk_factors", [])
        output["confidenceAssessment"] = llm_analysis.get("confidence_assessment", "")

        # Add data source information
        output["dataSources"] = {
            "blsApi": bls_response is not None and not bls_response.cached if bls_response else False,
            "blsCached": bls_response.cached if bls_response else False,
            "webSearch": True,
            "blsMetroArea": bls_response.metro_name if bls_response else None,
            "blsDataDate": bls_response.data_date if bls_response else None
        }

        # Build summary
        city = output.get("city", "Unknown")
        state = output.get("state", "XX")
        zip_code = output.get("zipCode", "00000")
        location_factor = output.get("locationFactor", 1.0)
        union_status = output.get("unionStatus", "mixed")

        output["summary"] = (
            f"Location analysis for {city}, {state} ({zip_code}): "
            f"Location factor {location_factor:.2f}, {union_status} market. "
            f"{len(output.get('keyFindings', []))} key findings identified."
        )

        return output
