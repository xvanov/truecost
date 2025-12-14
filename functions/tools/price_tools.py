"""
Price Tools for TrueCost Agent Pipeline.

Provides LangChain-compatible tools for agents to retrieve real-time
material prices via the price comparison Cloud Function.

Architecture:
- Uses @tool decorator from langchain_core.tools
- Pydantic schemas for input validation (OpenAI function calling compatible)
- Wraps services.price_comparison_service.get_material_prices
"""

from typing import List, Optional, Dict
import asyncio
from concurrent.futures import ThreadPoolExecutor

from pydantic import BaseModel, Field
from langchain_core.tools import tool
import structlog

from services.price_comparison_service import get_material_prices

logger = structlog.get_logger(__name__)

# Thread-local executor for running async code in sync context
_executor = ThreadPoolExecutor(max_workers=4)


def _run_async(coro):
    """Run an async coroutine in a sync context, handling nested loops."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)

    def _run_in_thread():
        new_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(new_loop)
        try:
            return new_loop.run_until_complete(coro)
        finally:
            new_loop.close()

    future = _executor.submit(_run_in_thread)
    return future.result()


class MaterialPricesInput(BaseModel):
    """Input schema for get_material_prices tool."""

    project_id: str = Field(description="Project ID for Firestore path /projects/{projectId}/...")
    product_names: List[str] = Field(
        description="List of material/product names/descriptions to price"
    )
    zip_code: Optional[str] = Field(
        default=None,
        description="Optional 5-digit US zip code for location-specific pricing",
    )
    force_refresh: bool = Field(
        default=False,
        description="Force refresh even if cached results exist",
    )


@tool("get_material_prices", args_schema=MaterialPricesInput)
def get_material_prices_tool(
    project_id: str,
    product_names: List[str],
    zip_code: Optional[str] = None,
    force_refresh: bool = False,
) -> Dict:
    """Get real-time material prices from Home Depot/Lowe's via price comparison.

    Returns a structured dict with traceability fields plus a mapping of
    product name -> best price.
    """
    try:
        prices = _run_async(
            get_material_prices(
                product_names=product_names,
                project_id=project_id,
                zip_code=zip_code,
                force_refresh=force_refresh,
            )
        )

        return {
            "project_id": project_id,
            "zip_code": zip_code,
            "source": "price_comparison",
            "cached": False,  # underlying service may return cached; we don't currently surface that
            "prices": prices,
            "prices_found": len(prices or {}),
            "products_requested": len(product_names or []),
        }
    except Exception as e:
        logger.warning(
            "get_material_prices_tool_failed",
            project_id=project_id,
            error=str(e),
        )
        return {
            "project_id": project_id,
            "zip_code": zip_code,
            "source": "price_comparison",
            "cached": False,
            "prices": {},
            "prices_found": 0,
            "products_requested": len(product_names or []),
            "error": str(e),
        }


