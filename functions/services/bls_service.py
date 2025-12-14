"""
BLS (Bureau of Labor Statistics) API Service for TrueCost.

Provides integration with the BLS Occupational Employment Statistics (OES) API
to retrieve real hourly wage data for construction occupations.

Architecture:
- Fetches data by MSA (Metropolitan Statistical Area) codes
- Maps SOC (Standard Occupational Classification) codes to construction trades
- Applies benefits burden calculation to get total hourly rates
- Graceful fallback to cached/default data on API failure

References:
- Story 4.5: Real Data Integration (AC 4.5.1-4.5.3, 4.5.9)
- BLS API Documentation: https://www.bls.gov/developers/api_signature_v2.htm
- SOC Code Structure: https://www.bls.gov/soc/2018/major_groups.htm

API Details:
- Endpoint: https://api.bls.gov/publicAPI/v2/timeseries/data/
- Rate limit: 500 queries/day with API key
- Data updated annually (May release)
"""

from dataclasses import dataclass
from typing import Dict, List, Optional
import os
import time

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import structlog

logger = structlog.get_logger(__name__)


# =============================================================================
# Constants and Mappings
# =============================================================================

# BLS API Configuration
BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
BLS_API_TIMEOUT = 30.0  # seconds

# SOC Code Mapping for Construction Trades (AC 4.5.2)
# Maps our internal trade names to BLS Standard Occupational Classification codes
SOC_CODE_MAP: Dict[str, str] = {
    "electrician": "47-2111",    # Electricians
    "plumber": "47-2152",        # Plumbers, Pipefitters, and Steamfitters
    "carpenter": "47-2031",      # Carpenters
    "hvac_tech": "49-9021",      # Heating, AC, Refrigeration Mechanics/Installers
    "roofer": "47-2181",         # Roofers
    "painter": "47-2141",        # Painters, Construction and Maintenance
    "tile_setter": "47-2044",    # Tile and Stone Setters
    "general_labor": "47-2061",  # Construction Laborers
}

# Reverse mapping for looking up trade from SOC code
SOC_TO_TRADE_MAP = {v: k for k, v in SOC_CODE_MAP.items()}

# MSA Code Mapping - Maps zip code prefixes to Metropolitan Statistical Areas (AC 4.5.3)
# MSA codes are 5-digit identifiers for metro areas
MSA_CODE_MAP: Dict[str, Dict] = {
    # New York-Newark-Jersey City, NY-NJ-PA
    "10001": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "10002": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "10003": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    # Los Angeles-Long Beach-Anaheim, CA
    "90001": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    "90002": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    # Chicago-Naperville-Elgin, IL-IN-WI
    "60601": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    "60602": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    # Houston-The Woodlands-Sugar Land, TX
    "77001": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    "77002": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    # Phoenix-Mesa-Chandler, AZ
    "85001": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    "85002": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    # Denver-Aurora-Lakewood, CO
    "80202": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    "80203": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    # Seattle-Tacoma-Bellevue, WA
    "98101": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    "98102": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    # Atlanta-Sandy Springs-Alpharetta, GA
    "30301": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    "30302": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    # Durham-Chapel Hill, NC
    "27701": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    "27702": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    "27703": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    # Austin-Round Rock-San Marcos, TX
    "78701": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
    "78702": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
    "78703": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
}

# Zip prefix to MSA mapping for fallback (when specific zip not in MSA_CODE_MAP)
ZIP_PREFIX_TO_MSA: Dict[str, Dict] = {
    "100": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "101": {"msa_code": "35620", "metro_name": "New York-Newark-Jersey City, NY-NJ-PA"},
    "900": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    "901": {"msa_code": "31080", "metro_name": "Los Angeles-Long Beach-Anaheim, CA"},
    "606": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    "607": {"msa_code": "16980", "metro_name": "Chicago-Naperville-Elgin, IL-IN-WI"},
    "770": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    "771": {"msa_code": "26420", "metro_name": "Houston-The Woodlands-Sugar Land, TX"},
    "850": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    "851": {"msa_code": "38060", "metro_name": "Phoenix-Mesa-Chandler, AZ"},
    "802": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    "803": {"msa_code": "19740", "metro_name": "Denver-Aurora-Lakewood, CO"},
    "981": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    "982": {"msa_code": "42660", "metro_name": "Seattle-Tacoma-Bellevue, WA"},
    "303": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    "304": {"msa_code": "12060", "metro_name": "Atlanta-Sandy Springs-Alpharetta, GA"},
    # Durham-Chapel Hill, NC
    "277": {"msa_code": "20500", "metro_name": "Durham-Chapel Hill, NC"},
    # Austin-Round Rock-San Marcos, TX
    "787": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
    "786": {"msa_code": "12420", "metro_name": "Austin-Round Rock-San Marcos, TX"},
}

# Default benefits burden percentage (35%)
DEFAULT_BENEFITS_BURDEN = 0.35


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class BLSLaborRate:
    """
    Labor rate data retrieved from BLS API.

    Attributes:
        trade: Internal trade name (e.g., "electrician")
        soc_code: BLS Standard Occupational Classification code
        hourly_rate: Base hourly wage from BLS
        total_rate: Hourly rate including benefits burden
        benefits_burden: Benefits burden percentage applied
        msa_code: Metropolitan Statistical Area code
        metro_name: Human-readable metro area name
        data_year: Year of the data
        source: Data source indicator ("BLS" or "cached")
    """
    trade: str
    soc_code: str
    hourly_rate: float
    total_rate: float
    benefits_burden: float
    msa_code: str
    metro_name: str
    data_year: str
    source: str = "BLS"


@dataclass
class BLSResponse:
    """
    Complete response from BLS API for a location.

    Attributes:
        zip_code: Original zip code requested
        msa_code: MSA code used for lookup
        metro_name: Metro area name
        rates: Dict mapping trade name to BLSLaborRate
        data_date: Date of the data (YYYY-MM format)
        cached: Whether this came from cache
    """
    zip_code: str
    msa_code: str
    metro_name: str
    rates: Dict[str, BLSLaborRate]
    data_date: str
    cached: bool = False


# =============================================================================
# Fallback/Default Data
# =============================================================================

# Default labor rates by MSA for fallback when API fails (AC 4.5.8)
# Updated with O*NET 2024 median hourly wages (source: BLS OES via O*NET Online)
DEFAULT_RATES_BY_MSA: Dict[str, Dict[str, float]] = {
    "35620": {  # NYC - New York-Newark-Jersey City
        "electrician": 36.76,
        "plumber": 38.18,
        "carpenter": 33.50,
        "hvac_tech": 35.62,
        "roofer": 35.80,
        "painter": 28.10,
        "tile_setter": 35.02,
        "general_labor": 29.74,
    },
    "31080": {  # LA - Los Angeles-Long Beach-Anaheim
        "electrician": 36.60,
        "plumber": 31.30,
        "carpenter": 35.50,
        "hvac_tech": 31.16,
        "roofer": 30.22,
        "painter": 27.91,
        "tile_setter": 26.54,
        "general_labor": 28.62,
    },
    "16980": {  # Chicago - Chicago-Naperville-Elgin
        "electrician": 47.86,
        "plumber": 47.54,
        "carpenter": 36.79,
        "hvac_tech": 35.77,
        "roofer": 33.45,
        "painter": 30.36,
        "tile_setter": 25.69,
        "general_labor": 32.89,
    },
    "26420": {  # Houston - Houston-Pasadena-The Woodlands
        "electrician": 28.45,
        "plumber": 28.96,
        "carpenter": 23.51,
        "hvac_tech": 27.84,
        "roofer": 21.41,
        "painter": 21.63,
        "tile_setter": 20.98,
        "general_labor": 18.51,
    },
    "38060": {  # Phoenix - Arizona state data (Phoenix MSA not available)
        "electrician": 28.60,
        "plumber": 29.78,
        "carpenter": 26.22,
        "hvac_tech": 27.20,
        "roofer": 22.22,
        "painter": 22.74,
        "tile_setter": 23.15,
        "general_labor": 22.21,
    },
    "19740": {  # Denver - Colorado data unavailable, using national averages
        "electrician": 29.98,
        "plumber": 30.27,
        "carpenter": 28.51,
        "hvac_tech": 28.75,
        "roofer": 24.51,
        "painter": 23.40,
        "tile_setter": 25.11,
        "general_labor": 22.47,
    },
    "42660": {  # Seattle - Seattle-Tacoma-Bellevue
        "electrician": 48.85,
        "plumber": 41.90,
        "carpenter": 36.90,
        "hvac_tech": 36.30,
        "roofer": 29.86,
        "painter": 28.49,
        "tile_setter": 35.25,
        "general_labor": 28.70,
    },
    "12060": {  # Atlanta - Atlanta-Sandy Springs-Roswell
        "electrician": 29.04,
        "plumber": 28.22,
        "carpenter": 24.71,
        "hvac_tech": 27.32,
        "roofer": 23.56,
        "painter": 23.39,
        "tile_setter": 23.78,
        "general_labor": 19.02,
    },
    "20500": {  # Durham - Durham-Chapel Hill, NC
        "electrician": 27.74,
        "plumber": 28.36,
        "carpenter": 23.51,
        "hvac_tech": 27.11,
        "roofer": 23.86,
        "painter": 22.38,
        "tile_setter": 21.26,  # NC state data (metro not available)
        "general_labor": 21.57,
    },
    "12420": {  # Austin - Austin-Round Rock-San Marcos, TX
        "electrician": 28.38,
        "plumber": 29.94,
        "carpenter": 23.87,
        "hvac_tech": 28.30,
        "roofer": 23.09,
        "painter": 21.84,
        "tile_setter": 20.93,  # TX state data (metro not available)
        "general_labor": 18.94,
    },
}

# National average rates for fallback when MSA not found
# Updated with O*NET 2024 median hourly wages (source: BLS OES via O*NET Online)
NATIONAL_AVERAGE_RATES: Dict[str, float] = {
    "electrician": 29.98,
    "plumber": 30.27,
    "carpenter": 28.51,
    "hvac_tech": 28.75,
    "roofer": 24.51,
    "painter": 23.40,
    "tile_setter": 25.11,
    "general_labor": 22.47,
}


# =============================================================================
# Helper Functions
# =============================================================================


def get_msa_for_zip(zip_code: str) -> Optional[Dict]:
    """
    Look up MSA information for a zip code.

    Args:
        zip_code: 5-digit US zip code

    Returns:
        Dict with msa_code and metro_name, or None if not found
    """
    # First try exact zip code match
    if zip_code in MSA_CODE_MAP:
        return MSA_CODE_MAP[zip_code]

    # Try zip prefix (first 3 digits)
    zip_prefix = zip_code[:3]
    if zip_prefix in ZIP_PREFIX_TO_MSA:
        return ZIP_PREFIX_TO_MSA[zip_prefix]

    # No match found
    return None


def build_bls_series_id(msa_code: str, soc_code: str) -> str:
    """
    Build a BLS OES series ID for a given MSA and SOC code.

    BLS OES series IDs follow the pattern: OEUM{MSA}000000{SOC}03
    - OEUM = OES (Occupational Employment Statistics) Unemployment
    - {MSA} = 5-digit MSA code
    - 000000 = Industry code (all industries)
    - {SOC} = SOC code without hyphen (e.g., 472111 for 47-2111)
    - 03 = Data type (hourly mean wage)

    Args:
        msa_code: 5-digit MSA code
        soc_code: SOC code with hyphen (e.g., "47-2111")

    Returns:
        BLS series ID string
    """
    soc_clean = soc_code.replace("-", "")
    return f"OEUM{msa_code}000000{soc_clean}03"


def get_bls_api_key() -> Optional[str]:
    """
    Get BLS API key from environment (AC 4.5.9).

    The API key should be stored in the BLS_API_KEY environment variable
    for Cloud Functions or local development.

    Returns:
        API key string or None if not set
    """
    return os.environ.get("BLS_API_KEY")


def calculate_total_rate(base_rate: float, burden_pct: float = DEFAULT_BENEFITS_BURDEN) -> float:
    """
    Calculate total hourly rate including benefits burden.

    Args:
        base_rate: Base hourly wage
        burden_pct: Benefits burden percentage (default 35%)

    Returns:
        Total hourly rate rounded to 2 decimal places
    """
    return round(base_rate * (1 + burden_pct), 2)


# =============================================================================
# BLS API Functions
# =============================================================================


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
)
async def _fetch_bls_data(
    series_ids: List[str],
    start_year: str,
    end_year: str,
    api_key: Optional[str] = None,
) -> Dict:
    """
    Fetch data from BLS API with retry logic.

    Args:
        series_ids: List of BLS series IDs to fetch
        start_year: Start year for data range
        end_year: End year for data range
        api_key: Optional BLS API key (for higher rate limits)

    Returns:
        Raw JSON response from BLS API

    Raises:
        httpx.HTTPError: On HTTP errors after retries
        httpx.TimeoutException: On timeout after retries
    """
    payload = {
        "seriesid": series_ids,
        "startyear": start_year,
        "endyear": end_year,
    }

    if api_key:
        payload["registrationkey"] = api_key

    async with httpx.AsyncClient(timeout=BLS_API_TIMEOUT) as client:
        response = await client.post(BLS_API_URL, json=payload)
        response.raise_for_status()
        return response.json()


def _parse_bls_response(
    response_data: Dict,
    msa_code: str,
    metro_name: str,
) -> Dict[str, BLSLaborRate]:
    """
    Parse BLS API response into BLSLaborRate objects.

    Args:
        response_data: Raw JSON response from BLS API
        msa_code: MSA code used in the request
        metro_name: Metro area name

    Returns:
        Dict mapping trade names to BLSLaborRate objects
    """
    rates = {}

    if response_data.get("status") != "REQUEST_SUCCEEDED":
        logger.warning(
            "bls_api_status_error",
            status=response_data.get("status"),
            message=response_data.get("message", []),
        )
        return rates

    for series in response_data.get("Results", {}).get("series", []):
        series_id = series.get("seriesID", "")

        # Extract SOC code from series ID
        # Series ID format: OEUM{MSA:5}000000{SOC:6}03
        # Total: 4 + 5 + 6 + 6 + 2 = 23 characters
        # SOC starts at position 15 (4+5+6)
        if len(series_id) >= 23:
            soc_raw = series_id[15:21]  # Extract 6-digit SOC portion
            soc_code = f"{soc_raw[:2]}-{soc_raw[2:]}"  # Format as XX-XXXX

            trade = SOC_TO_TRADE_MAP.get(soc_code)
            if not trade:
                continue

            # Get most recent data point
            data_points = series.get("data", [])
            if data_points:
                latest = data_points[0]  # Most recent is first
                hourly_rate = float(latest.get("value", 0))
                data_year = latest.get("year", "")

                if hourly_rate > 0:
                    rates[trade] = BLSLaborRate(
                        trade=trade,
                        soc_code=soc_code,
                        hourly_rate=hourly_rate,
                        total_rate=calculate_total_rate(hourly_rate),
                        benefits_burden=DEFAULT_BENEFITS_BURDEN,
                        msa_code=msa_code,
                        metro_name=metro_name,
                        data_year=data_year,
                        source="BLS",
                    )

    return rates


def _get_fallback_rates(msa_code: str, metro_name: str) -> Dict[str, BLSLaborRate]:
    """
    Get fallback rates when BLS API fails or returns incomplete data.

    Args:
        msa_code: MSA code for rate lookup
        metro_name: Metro area name

    Returns:
        Dict mapping trade names to BLSLaborRate objects with cached data
    """
    # Try MSA-specific rates first
    base_rates = DEFAULT_RATES_BY_MSA.get(msa_code, NATIONAL_AVERAGE_RATES)

    rates = {}
    for trade, soc_code in SOC_CODE_MAP.items():
        hourly_rate = base_rates.get(trade, NATIONAL_AVERAGE_RATES.get(trade, 50.0))
        rates[trade] = BLSLaborRate(
            trade=trade,
            soc_code=soc_code,
            hourly_rate=hourly_rate,
            total_rate=calculate_total_rate(hourly_rate),
            benefits_burden=DEFAULT_BENEFITS_BURDEN,
            msa_code=msa_code,
            metro_name=metro_name,
            data_year="cached",
            source="cached",
        )

    return rates


# =============================================================================
# Main Service Functions
# =============================================================================


async def get_labor_rates_for_zip(
    zip_code: str,
    trades: Optional[List[str]] = None,
) -> BLSResponse:
    """
    Get BLS labor rates for a zip code.

    Implements AC 4.5.1-4.5.3 and AC 4.5.8:
    - AC 4.5.1: Retrieves hourly wage data for construction occupations
    - AC 4.5.2: Maps to all 8 required trades via SOC codes
    - AC 4.5.3: Fetches by MSA and maps to zip codes
    - AC 4.5.8: Graceful fallback on API failure

    Args:
        zip_code: 5-digit US zip code
        trades: Optional list of trades to fetch (defaults to all 8)

    Returns:
        BLSResponse with labor rates for requested trades
    """
    start_time = time.perf_counter()

    # Get MSA info for zip code
    msa_info = get_msa_for_zip(zip_code)

    if not msa_info:
        # No MSA mapping - use national averages
        logger.info(
            "bls_no_msa_mapping",
            zip_code=zip_code,
            message="Using national average rates",
        )
        rates = _get_fallback_rates("00000", "National Average")
        return BLSResponse(
            zip_code=zip_code,
            msa_code="00000",
            metro_name="National Average",
            rates=rates,
            data_date="cached",
            cached=True,
        )

    msa_code = msa_info["msa_code"]
    metro_name = msa_info["metro_name"]

    # Determine which trades to fetch
    if trades is None:
        trades = list(SOC_CODE_MAP.keys())

    # Build series IDs for requested trades
    series_ids = []
    for trade in trades:
        if trade in SOC_CODE_MAP:
            soc_code = SOC_CODE_MAP[trade]
            series_ids.append(build_bls_series_id(msa_code, soc_code))

    # Try to fetch from BLS API
    api_key = get_bls_api_key()
    current_year = str(time.localtime().tm_year)

    try:
        response_data = await _fetch_bls_data(
            series_ids=series_ids,
            start_year=str(int(current_year) - 1),  # Previous year (BLS data has lag)
            end_year=current_year,
            api_key=api_key,
        )

        rates = _parse_bls_response(response_data, msa_code, metro_name)

        # Fill in any missing trades with fallback data
        fallback_rates = _get_fallback_rates(msa_code, metro_name)
        for trade in trades:
            if trade not in rates and trade in fallback_rates:
                rates[trade] = fallback_rates[trade]

        latency_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "bls_fetch_success",
            zip_code=zip_code,
            msa_code=msa_code,
            trades_fetched=len(rates),
            latency_ms=round(latency_ms, 2),
        )

        # Determine data date from rates
        data_dates = [r.data_year for r in rates.values() if r.data_year != "cached"]
        data_date = max(data_dates) if data_dates else "cached"

        return BLSResponse(
            zip_code=zip_code,
            msa_code=msa_code,
            metro_name=metro_name,
            rates=rates,
            data_date=data_date,
            cached=False,
        )

    except (httpx.HTTPError, httpx.TimeoutException) as e:
        # API failure - use fallback data (AC 4.5.8)
        latency_ms = (time.perf_counter() - start_time) * 1000
        logger.warning(
            "bls_api_failure",
            zip_code=zip_code,
            msa_code=msa_code,
            error=str(e),
            latency_ms=round(latency_ms, 2),
        )

        rates = _get_fallback_rates(msa_code, metro_name)
        # Filter to requested trades
        filtered_rates = {t: r for t, r in rates.items() if t in trades}

        return BLSResponse(
            zip_code=zip_code,
            msa_code=msa_code,
            metro_name=metro_name,
            rates=filtered_rates,
            data_date="cached",
            cached=True,
        )


async def get_single_trade_rate(
    zip_code: str,
    trade: str,
) -> BLSLaborRate:
    """
    Get BLS labor rate for a single trade at a location.

    Args:
        zip_code: 5-digit US zip code
        trade: Trade name (e.g., "electrician")

    Returns:
        BLSLaborRate for the specified trade

    Raises:
        ValueError: If trade is not recognized or not found in response
    """
    if trade not in SOC_CODE_MAP:
        raise ValueError(f"Unknown trade: {trade}. Valid trades: {list(SOC_CODE_MAP.keys())}")

    response = await get_labor_rates_for_zip(zip_code, trades=[trade])

    if trade not in response.rates:
        available_rates = list(response.rates.keys())
        raise ValueError(
            f"Trade '{trade}' not found in response for zip_code '{zip_code}'. "
            f"Available rates: {available_rates}"
        )

    return response.rates[trade]


def get_all_trades() -> List[str]:
    """Get list of all supported trades."""
    return list(SOC_CODE_MAP.keys())


def get_soc_code(trade: str) -> Optional[str]:
    """Get SOC code for a trade."""
    return SOC_CODE_MAP.get(trade)


def get_trade_from_soc(soc_code: str) -> Optional[str]:
    """Get trade name from SOC code."""
    return SOC_TO_TRADE_MAP.get(soc_code)
