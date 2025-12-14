"""
Data Tools for TrueCost Agent Pipeline.

Provides LangChain-compatible tools for agents to access labor rates,
weather factors, location data, and Monte Carlo simulation.

Architecture:
- Uses @tool decorator from langchain_core.tools
- Pydantic schemas for input validation (OpenAI function calling compatible)
- Structured dict responses with traceability fields
- Wraps underlying BLS, Weather, and Monte Carlo services

References:
- Story 4.5: Real Data Integration (AC 4.5.10-4.5.14)
- LangChain Tools: https://python.langchain.com/docs/modules/agents/tools

Tool Response Contract:
All tools return structured dicts with:
- estimate_id/zip_code: Echo of input for traceability
- source: Data provenance ("BLS", "Open-Meteo", "Monte Carlo", "cached")
- cached: Boolean indicating if data came from cache (where applicable)
- Actual data payload with confidence intervals and risk analysis
"""

from typing import List, Optional, Dict, Any
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor

from pydantic import BaseModel, Field
from langchain_core.tools import tool
import structlog

logger = structlog.get_logger(__name__)

# Thread-local executor for running async code in sync context
_executor = ThreadPoolExecutor(max_workers=4)


def _run_async(coro):
    """Run an async coroutine in a sync context, handling nested loops."""
    try:
        # Try to get existing loop
        loop = asyncio.get_running_loop()
    except RuntimeError:
        # No running loop, create one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)

    # If we're already in an async context, run in a separate thread
    def _run_in_thread():
        new_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(new_loop)
        try:
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()

    future = _executor.submit(_run_in_thread)
    return future.result()


# =============================================================================
# Input Schemas (AC 4.5.13 - OpenAI-compatible function schemas)
# =============================================================================


class LaborRatesInput(BaseModel):
    """Input schema for get_labor_rates tool."""

    zip_code: str = Field(
        description="5-digit US zip code for the location"
    )
    trades: Optional[List[str]] = Field(
        default=None,
        description="List of trades to fetch (e.g., ['electrician', 'plumber']). "
        "If None, returns all 8 trades: electrician, plumber, carpenter, "
        "hvac_tech, roofer, painter, tile_setter, general_labor."
    )


class WeatherFactorsInput(BaseModel):
    """Input schema for get_weather_factors tool."""

    zip_code: str = Field(
        description="5-digit US zip code for the location"
    )


class LocationFactorsInput(BaseModel):
    """Input schema for get_location_factors tool."""

    zip_code: str = Field(
        description="5-digit US zip code for the location"
    )


class MonteCarloInput(BaseModel):
    """Input schema for run_monte_carlo tool."""

    estimate_id: str = Field(
        description="Unique estimate identifier for this simulation"
    )
    cost_items: List[Dict[str, Any]] = Field(
        description="List of cost items with quantity, unit_cost_low, unit_cost_likely, unit_cost_high"
    )
    iterations: Optional[int] = Field(
        default=1000,
        description="Number of simulation iterations (default 1000)"
    )
    risk_factors: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional list of risk factors with impact probabilities"
    )


# =============================================================================
# Tool Implementations (AC 4.5.10-4.5.12)
# =============================================================================


@tool(args_schema=LaborRatesInput)
def get_labor_rates(zip_code: str, trades: Optional[List[str]] = None) -> dict:
    """Fetch current BLS labor rates for construction trades in a location.

    Returns hourly rates for specified trades based on Bureau of Labor Statistics
    Occupational Employment Statistics (OES) data for the metro area.

    Use this tool when you need to:
    - Get current labor costs for a specific location
    - Compare labor rates between different trades
    - Calculate labor costs for a construction estimate

    Args:
        zip_code: 5-digit US zip code for the location
        trades: Optional list of specific trades to fetch. If not specified,
            returns all 8 trades.

    Returns:
        Dictionary containing:
        - zip_code: The requested zip code
        - metro_area: Name of the metropolitan statistical area
        - rates: Dict mapping each trade to {hourly_rate, source, soc_code}
        - data_date: Date of the BLS data (YYYY-MM format)
        - cached: Whether data came from cache vs live API
    """
    logger.info("tool_get_labor_rates", zip_code=zip_code, trades=trades)

    # Import service here to avoid circular imports
    from services.bls_service import get_labor_rates_for_zip

    # Run async function in sync context
    bls_response = _run_async(get_labor_rates_for_zip(zip_code, trades=trades))

    # Build response dict (AC 4.5.10)
    return {
        "zip_code": bls_response.zip_code,
        "metro_area": bls_response.metro_name,
        "rates": {
            trade: {
                "hourly_rate": rate.hourly_rate,
                "total_rate": rate.total_rate,
                "source": rate.source,
                "soc_code": rate.soc_code,
            }
            for trade, rate in bls_response.rates.items()
        },
        "data_date": bls_response.data_date,
        "cached": bls_response.cached,
    }


@tool(args_schema=WeatherFactorsInput)
def get_weather_factors(zip_code: str) -> dict:
    """Get weather-based construction factors for a location.

    Returns seasonal adjustments based on historical weather data including
    winter slowdown factors, summer heat premiums, and rainy season months.

    Use this tool when you need to:
    - Adjust construction timeline for weather conditions
    - Calculate seasonal productivity factors
    - Identify months with weather-related delays

    Args:
        zip_code: 5-digit US zip code for the location

    Returns:
        Dictionary containing:
        - zip_code: The requested zip code
        - winter_slowdown: Productivity multiplier for winter (1.0-1.5)
        - summer_premium: Cost premium for extreme heat (1.0-1.3)
        - rainy_season_months: List of month numbers (1-12) with high rain
        - outdoor_work_adjustment: Combined outdoor work factor
        - freeze_days: Number of days below freezing per year
        - extreme_heat_days: Number of extreme heat days per year
        - source: Data source ("Open-Meteo" or "cached")
    """
    logger.info("tool_get_weather_factors", zip_code=zip_code)

    # Import service here to avoid circular imports
    from services.weather_service import get_weather_factors as fetch_weather

    # Run async function in sync context
    weather = _run_async(fetch_weather(zip_code))

    # Build response dict (AC 4.5.11)
    return {
        "zip_code": weather.zip_code,
        "winter_slowdown": weather.winter_slowdown,
        "summer_premium": weather.summer_premium,
        "rainy_season_months": weather.rainy_season_months,
        "outdoor_work_adjustment": weather.outdoor_work_adjustment,
        "freeze_days": weather.freeze_days,
        "extreme_heat_days": weather.extreme_heat_days,
        "source": weather.source,
    }


@tool(args_schema=LocationFactorsInput)
def get_location_factors(zip_code: str) -> dict:
    """Get complete location cost modifiers combining labor, weather, and regional factors.

    Returns a comprehensive set of location-specific factors including labor rates
    for all trades, weather adjustments, permit costs, and regional modifiers.

    Use this tool when you need:
    - Complete location data for a construction estimate
    - All cost adjustment factors for a specific area
    - Union status and permit cost information

    Args:
        zip_code: 5-digit US zip code for the location

    Returns:
        Dictionary containing:
        - zip_code: The requested zip code
        - labor_rates: Dict of all trade hourly rates
        - weather_factors: Dict with seasonal adjustments
        - regional_modifier: Regional cost adjustment factor
        - cost_of_living_index: Area cost of living multiplier
        - is_union: Whether location is a union market
        - permit_costs: Dict with permit fee information
        - combined_adjustment: Overall location adjustment factor
    """
    logger.info("tool_get_location_factors", zip_code=zip_code)

    # Import services here to avoid circular imports
    from services.bls_service import get_labor_rates_for_zip
    from services.weather_service import get_weather_factors as fetch_weather
    from services.cost_data_service import get_location_factors as get_base_location

    # Fetch all data concurrently
    async def fetch_all():
        import asyncio
        bls_task = get_labor_rates_for_zip(zip_code)
        weather_task = fetch_weather(zip_code)
        base_task = get_base_location(zip_code)
        return await asyncio.gather(bls_task, weather_task, base_task)

    bls_data, weather_data, base_data = _run_async(fetch_all())

    # Calculate regional modifier based on labor rates
    # NYC as baseline (1.0), other areas relative to NYC average
    nyc_avg = 70.0  # Approximate NYC average hourly rate
    location_avg = sum(r.hourly_rate for r in bls_data.rates.values()) / len(bls_data.rates) if bls_data.rates else nyc_avg
    regional_modifier = round(location_avg / nyc_avg, 2)

    # Cost of living index (simplified - based on labor rates + union status)
    cost_of_living_index = regional_modifier
    if base_data.is_union:
        cost_of_living_index *= base_data.union_premium

    # Combined adjustment factor
    combined_adjustment = round(
        regional_modifier * weather_data.outdoor_work_adjustment,
        2
    )

    # Build response dict (AC 4.5.12)
    return {
        "zip_code": zip_code,
        "labor_rates": {
            trade: {
                "hourly_rate": rate.hourly_rate,
                "total_rate": rate.total_rate,
            }
            for trade, rate in bls_data.rates.items()
        },
        "weather_factors": {
            "winter_slowdown": weather_data.winter_slowdown,
            "summer_premium": weather_data.summer_premium,
            "rainy_season_months": weather_data.rainy_season_months,
            "outdoor_work_adjustment": weather_data.outdoor_work_adjustment,
        },
        "regional_modifier": regional_modifier,
        "cost_of_living_index": round(cost_of_living_index, 2),
        "is_union": base_data.is_union,
        "permit_costs": {
            "base_percentage": base_data.permit_costs.base_percentage,
            "minimum": base_data.permit_costs.minimum,
            "maximum": base_data.permit_costs.maximum,
            "inspection_fee": base_data.permit_costs.inspection_fee,
        },
        "combined_adjustment": combined_adjustment,
    }


# =============================================================================
# MONTE CARLO SIMULATION TOOL
# =============================================================================


@tool(args_schema=MonteCarloInput)
def run_monte_carlo(
    estimate_id: str,
    cost_items: List[Dict[str, Any]],
    iterations: int = 1000,
    risk_factors: Optional[List[Dict[str, Any]]] = None
) -> dict:
    """Run Monte Carlo simulation on cost estimate to calculate risk-adjusted confidence intervals.

    This tool performs probabilistic cost analysis using triangular distributions
    to simulate uncertainty in material costs, labor rates, and other factors.

    Use this tool when you need to:
    - Calculate P50/P80/P90 confidence intervals for cost estimates
    - Assess project risk and recommended contingency
    - Identify which cost items contribute most to variance
    - Generate histogram data for cost distribution visualization

    Args:
        estimate_id: Unique identifier for tracking this simulation
        cost_items: List of cost items, each with:
            - id: Unique item identifier
            - description: Item description
            - quantity: Number of units
            - unit_cost_low: Optimistic unit cost estimate
            - unit_cost_likely: Most likely unit cost estimate
            - unit_cost_high: Pessimistic unit cost estimate
        iterations: Number of simulation iterations (default 1000)
        risk_factors: Optional risk factors with probability and impact

    Returns:
        Dictionary containing:
        - estimate_id: Echo of input for traceability
        - iterations: Number of iterations run
        - percentiles: P50, P80, P90 cost estimates
        - statistics: Mean, standard deviation, min/max
        - recommended_contingency: Suggested contingency percentage
        - top_risks: Top 5 risk factors by variance contribution
        - histogram: Bins for cost distribution visualization
        - simulation_time_ms: Time taken to run simulation

    Example:
        >>> items = [
        ...     {
        ...         "id": "cabinet_1",
        ...         "description": "Kitchen cabinets",
        ...         "quantity": 20,
        ...         "unit_cost_low": 175,
        ...         "unit_cost_likely": 225,
        ...         "unit_cost_high": 350
        ...     }
        ... ]
        >>> result = run_monte_carlo("est_123", items, iterations=1000)
        >>> result["percentiles"]["p50"]  # 50th percentile cost
        4500.0
    """
    logger.info("tool_run_monte_carlo", estimate_id=estimate_id, item_count=len(cost_items), iterations=iterations)

    # Import Monte Carlo service here to avoid circular imports
    from services.monte_carlo import LineItemInput, RiskFactor as MCRiskFactor, run_simulation

    # Convert cost_items to LineItemInput objects
    line_items = []
    for item in cost_items:
        line_items.append(LineItemInput(
            id=item["id"],
            description=item["description"],
            quantity=item["quantity"],
            unit_cost_low=item["unit_cost_low"],
            unit_cost_likely=item["unit_cost_likely"],
            unit_cost_high=item["unit_cost_high"]
        ))

    # Convert risk factors if provided
    mc_risk_factors = []
    if risk_factors:
        for rf in risk_factors:
            # Convert risk factor format
            mc_risk_factors.append(MCRiskFactor(
                item=rf.get("item", "Unknown"),
                impact=rf.get("impact", 0.0),
                probability=rf.get("probability", 0.5),
                sensitivity=rf.get("sensitivity", 0.0)
            ))

    # Run the simulation
    result = run_simulation(line_items, iterations=iterations)

    # Build response dict
    return {
        "estimate_id": estimate_id,
        "iterations": result.iterations,
        "percentiles": {
            "p50": result.p50,
            "p80": result.p80,
            "p90": result.p90
        },
        "statistics": {
            "mean": result.mean,
            "std_dev": result.std_dev,
            "min_value": result.min_value,
            "max_value": result.max_value
        },
        "recommended_contingency": result.recommended_contingency,
        "top_risks": [
            {
                "item": risk.item,
                "impact": risk.impact,
                "probability": risk.probability,
                "sensitivity": risk.sensitivity
            }
            for risk in result.top_risks
        ],
        "histogram": [
            {
                "range_low": bin.range_low,
                "range_high": bin.range_high,
                "count": bin.count,
                "percentage": bin.percentage
            }
            for bin in result.histogram
        ],
        "simulation_time_ms": None,  # Could be added if needed
    }