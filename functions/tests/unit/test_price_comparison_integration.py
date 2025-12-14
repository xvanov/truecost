"""Unit tests for price comparison integration.

Covers:
- services.price_comparison_service.get_material_prices behavior (success + timeout)
- services.cost_data_service.CostDataService integration with price comparison
  (uses real price, caching, fallback)
"""

import pytest
from unittest.mock import AsyncMock, patch

from models.cost_estimate import CostRange
from services.price_comparison_service import get_material_prices
from services.cost_data_service import CostDataService


@pytest.mark.asyncio
async def test_price_comparison_service_extracts_best_price():
    """get_material_prices returns bestPrice.product.price mapping."""
    firestore_doc = {
        "status": "complete",
        "results": [
            {
                "originalProductName": "Granite Countertop",
                "matches": {
                    "homeDepot": {"selectedProduct": {"price": 120.0}},
                    "lowes": {"selectedProduct": {"price": 110.0}},
                },
                "bestPrice": {
                    "retailer": "lowes",
                    "product": {"price": 110.0},
                },
            }
        ],
    }

    with patch(
        "services.price_comparison_service._call_cloud_function",
        new=AsyncMock(return_value={"cached": False}),
    ), patch(
        "services.price_comparison_service._poll_firestore_for_completion",
        new=AsyncMock(return_value=firestore_doc),
    ):
        prices = await get_material_prices(
            product_names=["Granite Countertop"],
            project_id="project-1",
            zip_code="80202",
            force_refresh=False,
        )

    assert prices == {"Granite Countertop": 110.0}


@pytest.mark.asyncio
async def test_price_comparison_service_timeout_returns_empty_dict():
    """get_material_prices returns empty dict when Firestore polling times out/fails."""
    with patch(
        "services.price_comparison_service._call_cloud_function",
        new=AsyncMock(return_value={"cached": False}),
    ), patch(
        "services.price_comparison_service._poll_firestore_for_completion",
        new=AsyncMock(return_value=None),
    ):
        prices = await get_material_prices(
            product_names=["Anything"],
            project_id="project-1",
            zip_code="80202",
            force_refresh=False,
        )

    assert prices == {}


@pytest.mark.asyncio
async def test_cost_data_service_uses_real_price_when_available():
    """CostDataService.get_material_cost uses price comparison when project_id provided."""
    service = CostDataService()
    desc = "Custom Vanity Fixture"

    async def _fake_price_service(**kwargs):
        return {desc: 99.0}

    with patch(
        "services.cost_data_service._get_price_comparison_service",
        return_value=_fake_price_service,
    ):
        result = await service.get_material_cost(
            cost_code="UNKNOWN",
            item_description=desc,
            project_id="project-1",
            zip_code="80202",
        )

    assert isinstance(result["unit_cost"], CostRange)
    assert result["unit_cost"].low == 99.0
    assert result["description"] == desc


@pytest.mark.asyncio
async def test_cost_data_service_falls_back_to_hardcoded_when_price_service_unavailable():
    """When price service unavailable, get_material_cost falls back to mock cost code data."""
    service = CostDataService()

    with patch(
        "services.cost_data_service._get_price_comparison_service",
        return_value=None,
    ):
        result = await service.get_material_cost(
            cost_code="06-4100-0100",
            item_description="Base cabinets - mid-range",
            project_id="project-1",
            zip_code="80202",
        )

    # Exact match path from MOCK_COST_CODES in cost_data_service
    assert isinstance(result["unit_cost"], CostRange)
    assert result["unit_cost"].low == 175.0


@pytest.mark.asyncio
async def test_cost_data_service_batch_prefetch_populates_cache_and_avoids_repeat_calls():
    """batch_prefetch_prices caches prices; subsequent get_material_cost hits cache."""
    service = CostDataService()
    project_id = "project-1"
    zip_code = "80202"
    desc1 = "Item One"
    desc2 = "Item Two"

    price_service = AsyncMock(return_value={desc1: 10.0, desc2: 20.0})

    with patch(
        "services.cost_data_service._get_price_comparison_service",
        return_value=price_service,
    ):
        await service.batch_prefetch_prices(
            product_descriptions=[desc1, desc2],
            project_id=project_id,
            zip_code=zip_code,
        )

        r1 = await service.get_material_cost(
            cost_code="UNKNOWN",
            item_description=desc1,
            project_id=project_id,
            zip_code=zip_code,
        )
        r2 = await service.get_material_cost(
            cost_code="UNKNOWN",
            item_description=desc2,
            project_id=project_id,
            zip_code=zip_code,
        )

    assert price_service.await_count == 1
    assert r1["unit_cost"].low == 10.0
    assert r2["unit_cost"].low == 20.0


