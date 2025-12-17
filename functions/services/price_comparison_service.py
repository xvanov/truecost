"""Price Comparison Service for TrueCost.

Provides integration with the TypeScript comparePrices Cloud Function
to retrieve real-time material prices from Home Depot and Lowe's.

Architecture:
- Calls TypeScript Cloud Function via HTTP
- Polls Firestore for completion (async function writes incrementally)
- Extracts best prices from comparison results
- Falls back to hardcoded costs on failure

References:
- collabcanvas/functions/src/priceComparison.ts - TypeScript Cloud Function
- Story 4.5: Real Data Integration
"""

import asyncio
import time
from typing import Dict, List, Optional, Any
import structlog

import httpx
from firebase_admin import firestore

from config.settings import settings

logger = structlog.get_logger()

# =============================================================================
# Constants
# =============================================================================

# Firebase Functions URL configuration
FUNCTIONS_BASE_URL = (
    "http://127.0.0.1:5001/collabcanvas-dev/us-central1"
    if settings.use_firebase_emulators
    else f"https://us-central1-{settings.firebase_project_id or 'collabcanvas-dev'}.cloudfunctions.net"
)

COMPARE_PRICES_FUNCTION = "comparePrices"
FUNCTION_TIMEOUT_SECONDS = 540  # Match TypeScript function timeout
POLL_INTERVAL_SECONDS = 2  # Check Firestore every 2 seconds
MAX_POLL_DURATION_SECONDS = 300  # Max 5 minutes polling


# =============================================================================
# Helper Functions
# =============================================================================


def _get_firestore_client():
    """Get Firestore client instance."""
    try:
        return firestore.client()
    except Exception as e:
        logger.warning("firestore_client_unavailable", error=str(e))
        return None


def _build_function_url(function_name: str) -> str:
    """Build Firebase Cloud Function URL.
    
    Args:
        function_name: Name of the Cloud Function
        
    Returns:
        Full URL to the function endpoint
    """
    return f"{FUNCTIONS_BASE_URL}/{function_name}"


async def _call_cloud_function(
    function_name: str,
    data: Dict[str, Any],
    timeout: float = FUNCTION_TIMEOUT_SECONDS
) -> Dict[str, Any]:
    """Call Firebase Cloud Function via HTTP.
    
    Args:
        function_name: Name of the Cloud Function
        data: Request payload
        timeout: Request timeout in seconds
        
    Returns:
        Response data from function
        
    Raises:
        httpx.HTTPError: On HTTP errors
        httpx.TimeoutException: On timeout
    """
    url = _build_function_url(function_name)
    
    logger.info(
        "calling_cloud_function",
        function=function_name,
        url=url,
        data_keys=list(data.keys())
    )
    
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            url,
            json=data,
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        return response.json()


async def _poll_firestore_for_completion(
    project_id: str,
    max_duration: float = MAX_POLL_DURATION_SECONDS
) -> Optional[Dict[str, Any]]:
    """Poll Firestore for price comparison completion.
    
    The TypeScript function writes progress incrementally to:
    /projects/{projectId}/priceComparison/latest
    
    Args:
        project_id: Project ID to check
        max_duration: Maximum time to poll in seconds
        
    Returns:
        Firestore document data when complete, or None if timeout/error
    """
    db = _get_firestore_client()
    if not db:
        logger.warning("firestore_unavailable_for_polling", project_id=project_id)
        return None
    
    doc_ref = db.collection("projects").document(project_id) \
        .collection("priceComparison").document("latest")
    
    start_time = time.time()
    
    while time.time() - start_time < max_duration:
        try:
            doc = doc_ref.get()
            if not doc.exists:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue
            
            data = doc.to_dict()
            status = data.get("status")
            
            if status == "complete":
                logger.info(
                    "price_comparison_complete",
                    project_id=project_id,
                    total_products=data.get("totalProducts", 0),
                    completed_products=data.get("completedProducts", 0)
                )
                return data
            
            if status == "error":
                error_msg = data.get("error", "Unknown error")
                logger.warning(
                    "price_comparison_error",
                    project_id=project_id,
                    error=error_msg
                )
                return None
            
            # Still processing - wait and check again
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            
        except Exception as e:
            logger.warning(
                "firestore_poll_error",
                project_id=project_id,
                error=str(e)
            )
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
    
    logger.warning(
        "price_comparison_timeout",
        project_id=project_id,
        duration=max_duration
    )
    return None


def _extract_prices_from_results(
    results: List[Dict[str, Any]]
) -> Dict[str, float]:
    """Extract best prices from comparison results.
    
    Args:
        results: List of ComparisonResult objects from Firestore
        
    Returns:
        Dict mapping product_name -> best_price (lowest of Home Depot/Lowe's)
    """
    prices = {}
    
    for result in results:
        original_name = result.get("originalProductName", "")
        if not original_name:
            continue
        
        matches = result.get("matches", {})
        best_price_data = result.get("bestPrice")
        
        if best_price_data and best_price_data.get("product"):
            # Use the best price (lowest of the two retailers)
            price = best_price_data["product"].get("price", 0)
            if price > 0:
                prices[original_name] = float(price)
                logger.debug(
                    "extracted_price",
                    product=original_name,
                    price=price,
                    retailer=best_price_data.get("retailer")
                )
        else:
            # No best price - try to get lowest from matches
            home_depot_price = None
            lowes_price = None
            
            hd_match = matches.get("homeDepot", {})
            if hd_match.get("selectedProduct"):
                home_depot_price = hd_match["selectedProduct"].get("price", 0)
            
            lowes_match = matches.get("lowes", {})
            if lowes_match.get("selectedProduct"):
                lowes_price = lowes_match["selectedProduct"].get("price", 0)
            
            # Use the lowest available price
            if home_depot_price and lowes_price:
                prices[original_name] = float(min(home_depot_price, lowes_price))
            elif home_depot_price:
                prices[original_name] = float(home_depot_price)
            elif lowes_price:
                prices[original_name] = float(lowes_price)
    
    return prices


# =============================================================================
# Main Service Functions
# =============================================================================


async def get_material_prices(
    product_names: List[str],
    project_id: str,
    zip_code: Optional[str] = None,
    force_refresh: bool = False
) -> Dict[str, float]:
    """Get material prices from price comparison service.
    
    Calls the TypeScript comparePrices Cloud Function, polls Firestore
    for completion, and extracts best prices from results.
    
    Args:
        product_names: List of product names/descriptions to price
        project_id: Project ID (used for Firestore path)
        zip_code: Optional ZIP code for location-specific pricing
        force_refresh: Force refresh even if cached results exist
        
    Returns:
        Dict mapping product_name -> best_price (lowest of Home Depot/Lowe's)
        Empty dict if function fails or no prices found
        
    Example:
        >>> prices = await get_material_prices(
        ...     ["Kitchen Cabinets", "Granite Countertops"],
        ...     "project-123",
        ...     zip_code="80202"
        ... )
        >>> prices["Kitchen Cabinets"]
        225.0
    """
    if not product_names:
        logger.warning("get_material_prices_empty_list")
        return {}
    
    if not project_id:
        logger.warning("get_material_prices_no_project_id")
        return {}
    
    start_time = time.time()
    
    try:
        # 1. Call Cloud Function to trigger price comparison
        # Firebase onCall functions expect data wrapped in "data" property
        function_data = {
            "data": {
                "request": {
                    "projectId": project_id,
                    "productNames": product_names,
                    "forceRefresh": force_refresh,
                    "zipCode": zip_code,
                }
            }
        }
        
        logger.info(
            "triggering_price_comparison",
            project_id=project_id,
            product_count=len(product_names),
            zip_code=zip_code
        )
        
        response = await _call_cloud_function(
            COMPARE_PRICES_FUNCTION,
            function_data,
            timeout=30.0  # Short timeout for trigger call
        )
        
        # Check if cached results were returned immediately
        if response.get("cached"):
            logger.info("price_comparison_cached", project_id=project_id)
            # Still need to read from Firestore to get the cached results
        
        # 2. Poll Firestore for completion
        firestore_data = await _poll_firestore_for_completion(project_id)
        
        if not firestore_data:
            logger.warning(
                "price_comparison_failed_or_timeout",
                project_id=project_id
            )
            return {}
        
        # 3. Extract prices from results
        results = firestore_data.get("results", [])
        if not results:
            logger.warning(
                "price_comparison_no_results",
                project_id=project_id
            )
            return {}
        
        prices = _extract_prices_from_results(results)
        
        duration_ms = (time.time() - start_time) * 1000
        logger.info(
            "material_prices_retrieved",
            project_id=project_id,
            products_requested=len(product_names),
            prices_found=len(prices),
            duration_ms=round(duration_ms, 2)
        )
        
        return prices
        
    except httpx.HTTPError as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.warning(
            "price_comparison_http_error",
            project_id=project_id,
            error=str(e),
            duration_ms=round(duration_ms, 2)
        )
        return {}
    
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        logger.error(
            "price_comparison_unexpected_error",
            project_id=project_id,
            error=str(e),
            duration_ms=round(duration_ms, 2)
        )
        return {}

