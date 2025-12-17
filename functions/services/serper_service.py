"""Serper API Service for TrueCost.

Provides integration with Serper API for Google Search and Google Shopping
to retrieve real-time web data and material prices.

Architecture:
- General web search for location data, permit info, market conditions
- Google Shopping search for material prices from Home Depot and Lowe's
- LLM-assisted extraction of structured data from search results
- Caching to minimize API calls

References:
- Serper API Documentation: https://serper.dev/docs
- Google Shopping API: https://serper.dev/docs#google-shopping-api
"""

import asyncio
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)
import structlog

logger = structlog.get_logger(__name__)


# =============================================================================
# Constants
# =============================================================================

# Using SerpAPI (serpapi.com) - NOT Serper (serper.dev)
# The API key format requires serpapi.com endpoint
SERPAPI_BASE_URL = "https://serpapi.com"
SERPER_TIMEOUT_MS = 30000
DEFAULT_NUM_RESULTS = 10

# Circuit breaker configuration
CIRCUIT_BREAKER_RESET_MS = 60 * 60 * 1000  # 1 hour reset


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class SearchResult:
    """Single search result from Serper API."""
    title: str
    link: str
    snippet: str
    position: int
    domain: str = ""


@dataclass
class ShoppingResult:
    """Single shopping result from Serper API."""
    title: str
    source: str  # Retailer name (e.g., "Home Depot", "Lowe's")
    link: str
    price: float
    price_str: str  # Original price string
    image_url: Optional[str] = None
    rating: Optional[float] = None
    reviews: Optional[int] = None
    delivery: Optional[str] = None


@dataclass
class SearchResponse:
    """Complete search response from Serper API."""
    query: str
    results: List[SearchResult]
    related_searches: List[str]
    search_time_ms: float
    cached: bool = False


@dataclass
class ShoppingResponse:
    """Complete shopping response from Serper API."""
    query: str
    results: List[ShoppingResult]
    search_time_ms: float
    cached: bool = False


# =============================================================================
# Serper Service Class
# =============================================================================


class SerperService:
    """Service for Serper API (Google Search & Shopping).

    Provides:
    - General web search for market data, permits, weather, etc.
    - Google Shopping search for material prices
    - Merchant filtering (Home Depot, Lowe's)
    - Result caching (optional)
    """

    # Class-level circuit breaker state (shared across instances)
    _circuit_open = False
    _circuit_opened_at: Optional[float] = None

    def __init__(self, api_key: Optional[str] = None):
        """Initialize SerperService.

        Args:
            api_key: Serper API key. Defaults to SERPER_API_KEY env var.
        """
        self.api_key = api_key or os.environ.get("SERPER_API_KEY") or os.environ.get("SERP_API_KEY")
        if not self.api_key:
            logger.warning("serper_api_key_missing", message="SERPER_API_KEY environment variable not set")

        # Simple in-memory cache (15 min TTL)
        self._cache: Dict[str, tuple[Any, float]] = {}
        self._cache_ttl = 900  # 15 minutes

    def _is_circuit_open(self) -> bool:
        """Check if circuit breaker is open (API unavailable)."""
        if not SerperService._circuit_open:
            return False

        # Check if enough time has passed to try again
        if SerperService._circuit_opened_at:
            elapsed_ms = (time.time() - SerperService._circuit_opened_at) * 1000
            if elapsed_ms > CIRCUIT_BREAKER_RESET_MS:
                logger.info("serper_circuit_breaker_reset")
                SerperService._circuit_open = False
                SerperService._circuit_opened_at = None
                return False

        return True

    def _trip_circuit_breaker(self) -> None:
        """Trip the circuit breaker due to quota exhaustion."""
        SerperService._circuit_open = True
        SerperService._circuit_opened_at = time.time()
        logger.warning("serper_circuit_breaker_tripped", reason="API quota exhausted")

    def _get_cached(self, cache_key: str) -> Optional[Any]:
        """Get cached result if still valid."""
        if cache_key in self._cache:
            result, timestamp = self._cache[cache_key]
            if time.time() - timestamp < self._cache_ttl:
                return result
            else:
                del self._cache[cache_key]
        return None

    def _set_cached(self, cache_key: str, result: Any) -> None:
        """Cache a result."""
        self._cache[cache_key] = (result, time.time())

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
    )
    async def _make_request(
        self,
        endpoint: str,
        params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Make request to SerpAPI with retry logic.

        Args:
            endpoint: API endpoint (e.g., "/search")
            params: Query parameters

        Returns:
            JSON response from API

        Raises:
            httpx.HTTPError: On HTTP errors after retries
            ValueError: If API key is not configured
            RuntimeError: If circuit breaker is open
        """
        # Check circuit breaker first
        if self._is_circuit_open():
            logger.warning("serpapi_circuit_breaker_open", endpoint=endpoint)
            raise RuntimeError("SerpAPI circuit breaker is open - quota exhausted")

        if not self.api_key:
            raise ValueError("SerpAPI key not configured")

        url = f"{SERPAPI_BASE_URL}{endpoint}"

        # Add API key to params
        params["api_key"] = self.api_key

        async with httpx.AsyncClient(timeout=SERPER_TIMEOUT_MS / 1000) as client:
            response = await client.get(url, params=params)

            # Check for quota exhaustion (429 or specific error messages)
            if response.status_code == 429:
                self._trip_circuit_breaker()
                raise RuntimeError("SerpAPI quota exhausted")

            # Check response body for quota errors
            if response.status_code >= 400:
                try:
                    error_data = response.json()
                    error_msg = str(error_data.get("error", "")).lower()
                    if "quota" in error_msg or "limit" in error_msg or "run out" in error_msg:
                        self._trip_circuit_breaker()
                        raise RuntimeError(f"SerpAPI quota error: {error_msg}")
                except Exception:
                    pass

            response.raise_for_status()
            return response.json()

    async def search(
        self,
        query: str,
        num_results: int = DEFAULT_NUM_RESULTS,
        use_cache: bool = True
    ) -> SearchResponse:
        """General web search via SerpAPI.

        Args:
            query: Search query string
            num_results: Number of results to return (max 100)
            use_cache: Whether to use cached results

        Returns:
            SearchResponse with organic results
        """
        cache_key = f"search:{query}:{num_results}"

        if use_cache:
            cached = self._get_cached(cache_key)
            if cached:
                cached.cached = True
                return cached

        start_time = time.time()

        try:
            # SerpAPI uses different endpoint format
            data = await self._make_request(
                "/search",
                {
                    "engine": "google",
                    "q": query,
                    "num": min(num_results, 100),
                    "gl": "us",
                    "hl": "en"
                }
            )

            # Parse organic results - SerpAPI uses "organic_results"
            results = []
            for i, item in enumerate(data.get("organic_results", [])):
                results.append(SearchResult(
                    title=item.get("title", ""),
                    link=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    position=item.get("position", i + 1),
                    domain=self._extract_domain(item.get("link", ""))
                ))

            # Extract related searches - SerpAPI uses "related_searches"
            related = [r.get("query", "") for r in data.get("related_searches", [])]

            search_time = (time.time() - start_time) * 1000

            response = SearchResponse(
                query=query,
                results=results,
                related_searches=related,
                search_time_ms=round(search_time, 2),
                cached=False
            )

            if use_cache:
                self._set_cached(cache_key, response)

            logger.info(
                "serper_search_complete",
                query=query[:50],
                results_count=len(results),
                search_time_ms=round(search_time, 2)
            )

            return response

        except Exception as e:
            logger.error(
                "serper_search_error",
                query=query[:50],
                error=str(e)
            )
            raise

    async def search_google_shopping(
        self,
        query: str,
        merchant_filter: Optional[str] = None,
        num_results: int = 20,
        use_cache: bool = True
    ) -> ShoppingResponse:
        """Google Shopping search via SerpAPI.

        Args:
            query: Product search query
            merchant_filter: Optional merchant filter (e.g., "Home Depot", "Lowe's")
            num_results: Number of results to return
            use_cache: Whether to use cached results

        Returns:
            ShoppingResponse with product results
        """
        cache_key = f"shopping:{query}:{merchant_filter}:{num_results}"

        if use_cache:
            cached = self._get_cached(cache_key)
            if cached:
                cached.cached = True
                return cached

        start_time = time.time()

        try:
            # SerpAPI uses different endpoint and params
            data = await self._make_request(
                "/search",
                {
                    "engine": "google_shopping",
                    "q": query,
                    "gl": "us",
                    "hl": "en",
                    "num": min(num_results, 100)
                }
            )

            # Parse shopping results - SerpAPI uses "shopping_results" key
            results = []
            for item in data.get("shopping_results", []):
                source = item.get("source", "")

                # Apply merchant filter if specified
                if merchant_filter:
                    pattern = re.compile(merchant_filter, re.IGNORECASE)
                    if not pattern.search(source):
                        continue

                # Parse price - SerpAPI uses "extracted_price" for numeric value
                price = item.get("extracted_price", 0)
                if not price:
                    price_str = item.get("price", "0")
                    price = self._parse_price(price_str)
                else:
                    price_str = item.get("price", f"${price}")

                if price > 0:  # Only include items with valid prices
                    results.append(ShoppingResult(
                        title=item.get("title", ""),
                        source=source,
                        link=item.get("link", item.get("product_link", "")),
                        price=price,
                        price_str=price_str,
                        image_url=item.get("thumbnail"),
                        rating=item.get("rating"),
                        reviews=item.get("reviews"),
                        delivery=item.get("delivery")
                    ))

            search_time = (time.time() - start_time) * 1000

            response = ShoppingResponse(
                query=query,
                results=results,
                search_time_ms=round(search_time, 2),
                cached=False
            )

            if use_cache:
                self._set_cached(cache_key, response)

            logger.info(
                "serpapi_shopping_complete",
                query=query[:50],
                merchant_filter=merchant_filter,
                results_count=len(results),
                search_time_ms=round(search_time, 2)
            )

            return response

        except Exception as e:
            logger.error(
                "serpapi_shopping_error",
                query=query[:50],
                error=str(e)
            )
            raise

    async def search_home_depot_and_lowes(
        self,
        product_name: str,
        use_cache: bool = True
    ) -> Dict[str, Optional[ShoppingResult]]:
        """Search for product on both Home Depot and Lowe's.

        Args:
            product_name: Product name to search
            use_cache: Whether to use cached results

        Returns:
            Dict with 'homeDepot' and 'lowes' keys containing best match or None
        """
        # Search both retailers in parallel
        hd_task = self.search_google_shopping(
            product_name,
            merchant_filter="Home Depot",
            use_cache=use_cache
        )
        lowes_task = self.search_google_shopping(
            product_name,
            merchant_filter="Lowe's",
            use_cache=use_cache
        )

        hd_results, lowes_results = await asyncio.gather(
            hd_task, lowes_task, return_exceptions=True
        )

        result = {
            "homeDepot": None,
            "lowes": None,
            "bestPrice": None,
            "bestRetailer": None
        }

        # Get best Home Depot result (lowest price)
        if isinstance(hd_results, ShoppingResponse) and hd_results.results:
            hd_sorted = sorted(hd_results.results, key=lambda x: x.price)
            result["homeDepot"] = hd_sorted[0]

        # Get best Lowe's result (lowest price)
        if isinstance(lowes_results, ShoppingResponse) and lowes_results.results:
            lowes_sorted = sorted(lowes_results.results, key=lambda x: x.price)
            result["lowes"] = lowes_sorted[0]

        # Determine best overall price
        hd_price = result["homeDepot"].price if result["homeDepot"] else float("inf")
        lowes_price = result["lowes"].price if result["lowes"] else float("inf")

        if hd_price <= lowes_price and result["homeDepot"]:
            result["bestPrice"] = result["homeDepot"]
            result["bestRetailer"] = "homeDepot"
        elif result["lowes"]:
            result["bestPrice"] = result["lowes"]
            result["bestRetailer"] = "lowes"

        logger.info(
            "serper_dual_retailer_search",
            product=product_name[:50],
            hd_price=hd_price if hd_price != float("inf") else None,
            lowes_price=lowes_price if lowes_price != float("inf") else None,
            best_retailer=result["bestRetailer"]
        )

        return result

    async def search_cost_of_living(
        self,
        city: str,
        state: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Search for cost of living index for a location.

        Args:
            city: City name
            state: State abbreviation or full name
            use_cache: Whether to use cached results

        Returns:
            Dict with COL data extracted from search results
        """
        query = f"{city} {state} cost of living index 2025"
        results = await self.search(query, num_results=5, use_cache=use_cache)

        return {
            "query": query,
            "results": [
                {"title": r.title, "snippet": r.snippet, "link": r.link}
                for r in results.results
            ],
            "search_time_ms": results.search_time_ms
        }

    async def search_permit_fees(
        self,
        city: str,
        state: str,
        project_type: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Search for permit fees for a location.

        Args:
            city: City name
            state: State abbreviation or full name
            project_type: Type of construction project
            use_cache: Whether to use cached results

        Returns:
            Dict with permit fee data extracted from search results
        """
        queries = [
            f"{city} {state} building permit fees 2025",
            f"{city} {state} {project_type} permit cost",
            f"{city} building department permit fee schedule",
        ]

        all_results = []
        for query in queries:
            try:
                response = await self.search(query, num_results=3, use_cache=use_cache)
                all_results.extend([
                    {"title": r.title, "snippet": r.snippet, "link": r.link, "query": query}
                    for r in response.results
                ])
            except Exception as e:
                logger.warning("permit_search_query_failed", query=query, error=str(e))

        return {
            "location": f"{city}, {state}",
            "project_type": project_type,
            "results": all_results,
            "result_count": len(all_results)
        }

    async def search_weather_data(
        self,
        city: str,
        state: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Search for weather data relevant to construction.

        Args:
            city: City name
            state: State abbreviation
            use_cache: Whether to use cached results

        Returns:
            Dict with weather data extracted from search results
        """
        query = f"{city} {state} average weather construction season climate"
        results = await self.search(query, num_results=5, use_cache=use_cache)

        return {
            "query": query,
            "results": [
                {"title": r.title, "snippet": r.snippet, "link": r.link}
                for r in results.results
            ],
            "search_time_ms": results.search_time_ms
        }

    async def search_union_status(
        self,
        city: str,
        state: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Search for union labor information.

        Args:
            city: City name
            state: State abbreviation
            use_cache: Whether to use cached results

        Returns:
            Dict with union status data extracted from search results
        """
        query = f"{city} {state} construction union labor rates prevailing wage"
        results = await self.search(query, num_results=5, use_cache=use_cache)

        return {
            "query": query,
            "results": [
                {"title": r.title, "snippet": r.snippet, "link": r.link}
                for r in results.results
            ],
            "search_time_ms": results.search_time_ms
        }

    async def search_market_risks(
        self,
        project_type: str,
        city: Optional[str] = None,
        state: Optional[str] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Search for current construction market risks.

        Args:
            project_type: Type of construction project
            city: Optional city name
            state: Optional state abbreviation
            use_cache: Whether to use cached results

        Returns:
            Dict with market risk data from search results
        """
        queries = [
            f"{project_type} construction supply chain delays 2025",
            f"{project_type} cost overruns common problems 2025",
            f"construction material shortages 2025",
        ]

        if city and state:
            queries.append(f"{city} {state} construction market conditions 2025")

        all_results = []
        for query in queries:
            try:
                response = await self.search(query, num_results=3, use_cache=use_cache)
                all_results.extend([
                    {"title": r.title, "snippet": r.snippet, "link": r.link, "query": query}
                    for r in response.results
                ])
            except Exception as e:
                logger.warning("risk_search_query_failed", query=query, error=str(e))

        return {
            "project_type": project_type,
            "location": f"{city}, {state}" if city and state else None,
            "results": all_results,
            "result_count": len(all_results)
        }

    async def search_zip_code_location(
        self,
        zip_code: str,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """Get city/state from ZIP code using web search.

        Args:
            zip_code: US ZIP code
            use_cache: Whether to use cached results

        Returns:
            Dict with city and state information
        """
        query = f"{zip_code} ZIP code city state location"
        results = await self.search(query, num_results=3, use_cache=use_cache)

        return {
            "zip_code": zip_code,
            "query": query,
            "results": [
                {"title": r.title, "snippet": r.snippet, "link": r.link}
                for r in results.results
            ],
            "search_time_ms": results.search_time_ms
        }

    def _parse_price(self, price_str: str) -> float:
        """Parse price string to float.

        Args:
            price_str: Price string (e.g., "$29.99", "29.99")

        Returns:
            Price as float, or 0 if parsing fails
        """
        if not price_str:
            return 0.0

        # Remove currency symbols and commas
        cleaned = re.sub(r'[$,]', '', str(price_str))

        # Extract first number
        match = re.search(r'[\d.]+', cleaned)
        if match:
            try:
                return float(match.group())
            except ValueError:
                pass

        return 0.0

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL.

        Args:
            url: Full URL

        Returns:
            Domain name
        """
        if not url:
            return ""

        match = re.search(r'https?://([^/]+)', url)
        if match:
            return match.group(1)
        return ""


# =============================================================================
# Module-level convenience functions
# =============================================================================

_default_service: Optional[SerperService] = None


def get_serper_service() -> SerperService:
    """Get default SerperService instance."""
    global _default_service
    if _default_service is None:
        _default_service = SerperService()
    return _default_service


async def search(query: str, num_results: int = 10) -> SearchResponse:
    """Convenience function for web search."""
    return await get_serper_service().search(query, num_results)


async def search_shopping(
    query: str,
    merchant_filter: Optional[str] = None
) -> ShoppingResponse:
    """Convenience function for shopping search."""
    return await get_serper_service().search_google_shopping(query, merchant_filter)


async def search_home_depot_and_lowes(product_name: str) -> Dict[str, Optional[ShoppingResult]]:
    """Convenience function for dual retailer search."""
    return await get_serper_service().search_home_depot_and_lowes(product_name)
