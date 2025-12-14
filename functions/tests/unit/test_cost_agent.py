"""Unit tests for Cost Agent, Scorer, and Critic.

Tests the P50/P80/P90 cost range functionality.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from models.cost_estimate import (
    CostRange,
    CostSubtotals,
    CostAdjustments,
    CostEstimate,
    CostSummary,
    DivisionCost,
    LineItemCost,
    CostConfidenceLevel,
)
from models.bill_of_quantities import TradeCategory
from services.cost_data_service import CostDataService
from agents.primary.cost_agent import CostAgent
from agents.scorers.cost_scorer import CostScorer
from agents.critics.cost_critic import CostCritic

from tests.fixtures.mock_cost_estimate_data import (
    get_mock_location_output,
    get_mock_scope_output,
    get_valid_cost_output,
    get_invalid_ranges_output,
    get_incomplete_cost_output,
    get_missing_location_factor_output,
    get_wide_range_output,
    get_narrow_range_output,
    get_cost_agent_a2a_request,
    get_cost_scorer_a2a_request,
    get_cost_critic_a2a_request,
)

@pytest.fixture(autouse=True)
def mock_deep_agent_generate_json():
    """Patch Deep Agents JSON helper so unit tests don't hit real OpenAI/deepagents runtime."""
    with patch(
        "services.deep_agent_factory.deep_agent_generate_json",
        new=AsyncMock(
            return_value={
                "content": {
                    "key_cost_drivers": ["Cabinets", "Countertops"],
                    "cost_saving_opportunities": ["Consider alternatives"],
                    "assumptions": ["Standard hours"],
                    "range_explanation": "P50/P80/P90 ranges",
                    "confidence_notes": "Good confidence",
                },
                "tokens_used": 500,
            }
        ),
    ) as mocked:
        yield mocked


# =============================================================================
# COST RANGE MODEL TESTS
# =============================================================================


class TestCostRangeModel:
    """Test CostRange Pydantic model."""
    
    def test_cost_range_valid(self):
        """Test valid cost range creation."""
        cr = CostRange(low=100.0, medium=115.0, high=125.0)
        assert cr.low == 100.0
        assert cr.medium == 115.0
        assert cr.high == 125.0
    
    def test_cost_range_from_base_cost(self):
        """Test creating range from base cost with multipliers."""
        cr = CostRange.from_base_cost(100.0)
        assert cr.low == 100.0
        assert cr.medium == 115.0  # 100 * 1.15
        assert cr.high == 125.0    # 100 * 1.25
    
    def test_cost_range_from_base_cost_custom_multipliers(self):
        """Test creating range with custom multipliers."""
        cr = CostRange.from_base_cost(100.0, p80_multiplier=1.20, p90_multiplier=1.35)
        assert cr.low == 100.0
        assert cr.medium == 120.0
        assert cr.high == 135.0
    
    def test_cost_range_zero(self):
        """Test zero cost range."""
        cr = CostRange.zero()
        assert cr.low == 0.0
        assert cr.medium == 0.0
        assert cr.high == 0.0
    
    def test_cost_range_addition(self):
        """Test adding two cost ranges."""
        cr1 = CostRange(low=100.0, medium=115.0, high=125.0)
        cr2 = CostRange(low=50.0, medium=57.5, high=62.5)
        result = cr1 + cr2
        assert result.low == 150.0
        assert result.medium == 172.5
        assert result.high == 187.5
    
    def test_cost_range_multiplication(self):
        """Test multiplying cost range by factor."""
        cr = CostRange(low=100.0, medium=115.0, high=125.0)
        result = cr * 2.0
        assert result.low == 200.0
        assert result.medium == 230.0
        assert result.high == 250.0
    
    def test_cost_range_to_dict(self):
        """Test converting to dict."""
        cr = CostRange(low=100.0, medium=115.0, high=125.0)
        d = cr.to_dict()
        assert d == {"low": 100.0, "medium": 115.0, "high": 125.0}
    
    def test_cost_range_invalid_order_raises(self):
        """Test that invalid order raises validation error."""
        with pytest.raises(ValueError, match="low <= medium <= high"):
            CostRange(low=150.0, medium=100.0, high=125.0)
    
    def test_cost_range_negative_raises(self):
        """Test that negative values raise validation error."""
        with pytest.raises(ValueError):
            CostRange(low=-10.0, medium=0.0, high=10.0)


# =============================================================================
# COST DATA SERVICE TESTS
# =============================================================================


class TestCostDataServiceMaterialCost:
    """Test CostDataService.get_material_cost()."""
    
    @pytest.mark.asyncio
    async def test_get_material_cost_exact_match(self):
        """Test getting material cost with exact code match."""
        service = CostDataService()
        result = await service.get_material_cost("06-4100-0100")  # Base cabinets
        
        assert result["cost_code"] == "06-4100-0100"
        assert result["description"] == "Base cabinets - mid-range"
        assert isinstance(result["unit_cost"], CostRange)
        assert result["unit_cost"].low == 175.0
        assert result["labor_hours_per_unit"] == 1.0
        assert result["primary_trade"] == TradeCategory.CABINET_INSTALLER
    
    @pytest.mark.asyncio
    async def test_get_material_cost_fuzzy_match(self):
        """Test getting material cost with fuzzy description match."""
        service = CostDataService()
        result = await service.get_material_cost(
            cost_code="UNKNOWN",
            item_description="granite countertop installation"
        )
        
        # Should fuzzy match to countertop code
        assert "countertop" in result["description"].lower() or result["confidence_score"] >= 0.5
        assert isinstance(result["unit_cost"], CostRange)
    
    @pytest.mark.asyncio
    async def test_get_material_cost_default_fallback(self):
        """Test fallback to default costs for unknown code."""
        service = CostDataService()
        result = await service.get_material_cost("XX-9999-0000")
        
        # Should return default for unknown
        assert "GEN-" in result["cost_code"]
        assert result["confidence"] == CostConfidenceLevel.LOW
        assert isinstance(result["unit_cost"], CostRange)
    
    @pytest.mark.asyncio
    async def test_get_material_cost_returns_range(self):
        """Test that material cost returns proper P50/P80/P90 range."""
        service = CostDataService()
        result = await service.get_material_cost("11-3100-0100")  # Refrigerator
        
        unit_cost = result["unit_cost"]
        assert unit_cost.low <= unit_cost.medium <= unit_cost.high
        # Check multipliers are applied (approximately)
        assert abs(unit_cost.medium / unit_cost.low - 1.15) < 0.01
        assert abs(unit_cost.high / unit_cost.low - 1.25) < 0.01


class TestCostDataServiceLaborRate:
    """Test CostDataService.get_labor_rate()."""
    
    @pytest.mark.asyncio
    async def test_get_labor_rate_with_location(self):
        """Test getting labor rate for specific location."""
        service = CostDataService()
        result = await service.get_labor_rate(
            trade=TradeCategory.ELECTRICIAN,
            zip_code="80202"  # Denver
        )
        
        assert result["trade"] == TradeCategory.ELECTRICIAN
        assert isinstance(result["hourly_rate"], CostRange)
        # Denver electrician rate is $58/hr
        assert result["hourly_rate"].low == 58.0
        assert result["confidence_score"] >= 0.85
    
    @pytest.mark.asyncio
    async def test_get_labor_rate_no_location(self):
        """Test getting labor rate with no location (national avg)."""
        service = CostDataService()
        result = await service.get_labor_rate(trade=TradeCategory.PLUMBER)
        
        assert result["trade"] == TradeCategory.PLUMBER
        assert isinstance(result["hourly_rate"], CostRange)
        # Should use national average
        assert result["hourly_rate"].low == 58.0  # National avg for plumber
    
    @pytest.mark.asyncio
    async def test_get_labor_rate_range_multipliers(self):
        """Test that labor rate uses correct P50/P80/P90 multipliers."""
        service = CostDataService()
        result = await service.get_labor_rate(trade=TradeCategory.CARPENTER)
        
        rate = result["hourly_rate"]
        # Labor uses 1.12 and 1.20 multipliers
        assert abs(rate.medium / rate.low - 1.12) < 0.01
        assert abs(rate.high / rate.low - 1.20) < 0.01


# =============================================================================
# LINE ITEM COST CALCULATION TESTS
# =============================================================================


class TestLineItemCostCalculation:
    """Test LineItemCost.calculate() method."""
    
    def test_calculate_line_item_cost(self):
        """Test complete line item cost calculation."""
        item = LineItemCost.calculate(
            line_item_id="06-001",
            cost_code="06-4100-0100",
            description="Base cabinets",
            quantity=18,
            unit="LF",
            unit_material_cost=CostRange.from_base_cost(175.0),
            unit_labor_hours=1.0,
            labor_rate=CostRange.from_base_cost(48.0, p80_multiplier=1.12, p90_multiplier=1.20),
            primary_trade=TradeCategory.CABINET_INSTALLER,
        )
        
        # Material cost = 18 * 175 = 3150 (P50)
        assert item.material_cost.low == 3150.0
        # Labor hours = 18 * 1.0 = 18
        assert item.labor_hours == 18.0
        # Labor cost = 18 * 48 = 864 (P50)
        assert item.labor_cost.low == 864.0
        # Total = material + labor
        assert item.total_cost.low == 3150.0 + 864.0
    
    def test_calculate_with_equipment(self):
        """Test line item cost with equipment included."""
        item = LineItemCost.calculate(
            line_item_id="02-001",
            cost_code="02-4100-0100",
            description="Dumpster",
            quantity=1,
            unit="EA",
            unit_material_cost=CostRange.from_base_cost(0.0),
            unit_labor_hours=0.5,
            labor_rate=CostRange.from_base_cost(35.0, p80_multiplier=1.12, p90_multiplier=1.20),
            primary_trade=TradeCategory.DEMOLITION,
            unit_equipment_cost=CostRange.from_base_cost(450.0),
        )
        
        # Should include equipment cost
        assert item.equipment_cost.low == 450.0
        assert item.total_cost.low == 0.0 + 17.5 + 450.0


# =============================================================================
# COST AGENT TESTS
# =============================================================================


class TestCostAgent:
    """Test Cost Agent functionality."""
    
    @pytest.fixture
    def mock_services(self):
        """Create mock services."""
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        firestore.save_cost_items = AsyncMock()
        
        llm = MagicMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {
                "key_cost_drivers": ["Cabinets", "Countertops"],
                "cost_saving_opportunities": ["Consider alternatives"],
                "assumptions": ["Standard hours"],
                "range_explanation": "P50/P80/P90 ranges",
                "confidence_notes": "Good confidence"
            },
            "tokens_used": 500
        })
        
        cost_data = CostDataService()
        
        return firestore, llm, cost_data
    
    @pytest.mark.asyncio
    async def test_cost_agent_run(self, mock_services):
        """Test Cost Agent produces valid output."""
        firestore, llm, cost_data = mock_services
        
        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = {
            "clarification_output": {},
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output()
        }
        
        result = await agent.run(
            estimate_id="test-001",
            input_data=input_data
        )
        
        # Check output structure
        assert "total" in result
        assert "low" in result["total"]
        assert "medium" in result["total"]
        assert "high" in result["total"]
        
        # Check range validity
        assert result["total"]["low"] <= result["total"]["medium"] <= result["total"]["high"]
        
        # Check divisions exist
        assert "divisions" in result
        assert len(result["divisions"]) > 0
        
        # Check subtotals
        assert "subtotals" in result
        assert "materials" in result["subtotals"]
        
        # Check adjustments
        assert "adjustments" in result
        assert result["adjustments"]["locationFactor"] == 1.05
        
        # Check summary
        assert "summary" in result
        assert "headline" in result["summary"]

    @pytest.mark.asyncio
    async def test_cost_agent_uses_user_selected_defaults(self, mock_services):
        """User-selected defaults in clarification_output should override CostAgent hardcoded defaults."""
        firestore, llm, cost_data = mock_services

        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )

        input_data = {
            "clarification_output": {
                "projectBrief": {
                    "costPreferences": {
                        "overheadPct": 0.20,
                        "profitPct": 0.15,
                        "contingencyPct": 0.07,
                        "wasteFactor": 1.25,
                    }
                }
            },
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output(),
        }

        result = await agent.run(
            estimate_id="test-001",
            input_data=input_data
        )

        assert result["adjustments"]["overheadPercentage"] == pytest.approx(0.20)
        assert result["adjustments"]["profitPercentage"] == pytest.approx(0.15)
        assert result["adjustments"]["contingencyPercentage"] == pytest.approx(0.07)

        # Waste factor should be used in granular takeoff conversions (planks heuristic).
        found_planks = False
        for call in firestore.save_cost_items.call_args_list:
            args, _kwargs = call
            # (estimate_id, items)
            items = args[1] if len(args) > 1 else []
            for it in items:
                if isinstance(it, dict) and str(it.get("id", "")).endswith("__planks"):
                    found_planks = True
                    assumptions = it.get("assumptions", {})
                    assert assumptions.get("waste_factor") == pytest.approx(1.25)
        assert found_planks, "Expected at least one __planks granular item to validate wasteFactor usage"
    
    @pytest.mark.asyncio
    async def test_cost_agent_applies_location_factor(self, mock_services):
        """Test that location factor is applied correctly."""
        firestore, llm, cost_data = mock_services
        
        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = {
            "clarification_output": {},
            "location_output": get_mock_location_output(),  # Factor = 1.05
            "scope_output": get_mock_scope_output()
        }
        
        result = await agent.run(
            estimate_id="test-001",
            input_data=input_data
        )
        
        # Location factor should be in adjustments
        assert result["adjustments"]["locationFactor"] == 1.05
        
        # locationAdjustedSubtotal should exist
        assert "locationAdjustedSubtotal" in result["adjustments"]
    
    @pytest.mark.asyncio
    async def test_cost_agent_all_ranges_valid(self, mock_services):
        """Test that all cost ranges are valid (low <= medium <= high)."""
        firestore, llm, cost_data = mock_services
        
        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = {
            "clarification_output": {},
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output()
        }
        
        result = await agent.run(
            estimate_id="test-001",
            input_data=input_data
        )
        
        # Check total
        assert result["total"]["low"] <= result["total"]["medium"] <= result["total"]["high"]
        
        # Check all subtotals
        for key in ["materials", "labor", "equipment", "subtotal"]:
            if key in result["subtotals"]:
                st = result["subtotals"][key]
                assert st["low"] <= st["medium"] <= st["high"], f"{key} range invalid"


# =============================================================================
# COST SCORER TESTS
# =============================================================================


class TestCostScorer:
    """Test Cost Scorer functionality."""
    
    @pytest.fixture
    def scorer(self):
        """Create scorer instance."""
        return CostScorer()
    
    def test_get_scoring_criteria(self, scorer):
        """Test scoring criteria are defined."""
        criteria = scorer.get_scoring_criteria()
        
        assert len(criteria) >= 5
        names = [c["name"] for c in criteria]
        assert "cost_ranges_valid" in names
        assert "line_items_costed" in names
        assert "location_factor_applied" in names
    
    @pytest.mark.asyncio
    async def test_score_valid_output_high(self, scorer):
        """Test valid output scores high."""
        output = get_valid_cost_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()
        }
        
        # Manually calculate score
        criteria = scorer.get_scoring_criteria()
        total_score = 0
        total_weight = 0
        
        for criterion in criteria:
            result = await scorer.evaluate_criterion(criterion, output, input_data)
            total_score += result["score"] * criterion["weight"]
            total_weight += criterion["weight"]
        
        avg_score = total_score / total_weight
        assert avg_score >= 80, f"Valid output should score >= 80, got {avg_score}"
    
    @pytest.mark.asyncio
    async def test_score_invalid_ranges_low(self, scorer):
        """Test invalid ranges score low."""
        output = get_invalid_ranges_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()
        }
        
        criterion = {"name": "cost_ranges_valid", "weight": 3}
        result = await scorer.evaluate_criterion(criterion, output, input_data)
        
        # Score is 100 - (invalid_count * 15), with 2 invalid ranges = 70
        assert result["score"] < 100, "Invalid ranges should score below 100"
        assert "invalid" in result["feedback"].lower()
    
    @pytest.mark.asyncio
    async def test_score_incomplete_items(self, scorer):
        """Test incomplete item coverage scores low."""
        output = get_incomplete_cost_output()
        input_data = {
            "scope_output": get_mock_scope_output(),  # Has 15 items
            "location_output": get_mock_location_output()
        }
        
        criterion = {"name": "line_items_costed", "weight": 3}
        result = await scorer.evaluate_criterion(criterion, output, input_data)
        
        # Only 1 item costed out of 15
        assert result["score"] < 50
    
    @pytest.mark.asyncio
    async def test_score_location_factor_mismatch(self, scorer):
        """Test mismatched location factor scores low."""
        output = get_missing_location_factor_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()  # Factor = 1.05
        }
        
        criterion = {"name": "location_factor_applied", "weight": 2}
        result = await scorer.evaluate_criterion(criterion, output, input_data)
        
        # Output has 1.0, expected 1.05
        assert result["score"] < 75
        assert "mismatch" in result["feedback"].lower()
    
    @pytest.mark.asyncio
    async def test_score_range_too_wide(self, scorer):
        """Test range > 2x ratio scores low."""
        output = get_wide_range_output()
        input_data = {}
        
        criterion = {"name": "range_reasonable", "weight": 2}
        result = await scorer.evaluate_criterion(criterion, output, input_data)
        
        assert result["score"] < 80
        assert "wide" in result["feedback"].lower()
    
    @pytest.mark.asyncio
    async def test_score_range_too_narrow(self, scorer):
        """Test range <= 1.0x ratio scores low."""
        # Create an output with identical low and high (ratio = 1.0)
        output = get_narrow_range_output()
        output["total"] = {"low": 30000.0, "medium": 30000.0, "high": 30000.0}
        input_data = {}
        
        criterion = {"name": "range_reasonable", "weight": 2}
        result = await scorer.evaluate_criterion(criterion, output, input_data)
        
        # Ratio of 1.0 (no spread) should score low
        assert result["score"] < 50
        assert "narrow" in result["feedback"].lower()


# =============================================================================
# COST CRITIC TESTS
# =============================================================================


class TestCostCritic:
    """Test Cost Critic functionality."""
    
    @pytest.fixture
    def critic(self):
        """Create critic instance."""
        return CostCritic()
    
    def test_get_critique_prompt(self, critic):
        """Test critique prompt includes cost-specific guidance."""
        prompt = critic.get_critique_prompt()
        
        assert "P50" in prompt or "low" in prompt.lower()
        assert "P80" in prompt or "medium" in prompt.lower()
        assert "P90" in prompt or "high" in prompt.lower()
        assert "location factor" in prompt.lower()
    
    @pytest.mark.asyncio
    async def test_analyze_invalid_ranges(self, critic):
        """Test critic identifies invalid range ordering."""
        output = get_invalid_ranges_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()
        }
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=50,
            scorer_feedback="Invalid ranges detected"
        )
        
        assert len(result["issues"]) > 0
        # Should mention range or ordering issue
        issues_text = " ".join(result["issues"]).lower()
        assert "range" in issues_text or "invalid" in issues_text
        assert len(result["how_to_fix"]) > 0
    
    @pytest.mark.asyncio
    async def test_analyze_missing_location_factor(self, critic):
        """Test critic identifies missing location factor."""
        output = get_missing_location_factor_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()
        }
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=60,
            scorer_feedback="Location factor mismatch"
        )
        
        issues_text = " ".join(result["issues"]).lower()
        assert "location" in issues_text or "factor" in issues_text
    
    @pytest.mark.asyncio
    async def test_analyze_incomplete_coverage(self, critic):
        """Test critic identifies incomplete line item coverage."""
        output = get_incomplete_cost_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()
        }
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=55,
            scorer_feedback="Missing line item costs"
        )
        
        issues_text = " ".join(result["issues"]).lower()
        assert "item" in issues_text or "costed" in issues_text
    
    @pytest.mark.asyncio
    async def test_analyze_wide_range(self, critic):
        """Test critic identifies too-wide range spread."""
        output = get_wide_range_output()
        input_data = {}
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=65,
            scorer_feedback="Range too wide"
        )
        
        issues_text = " ".join(result["issues"]).lower()
        assert "wide" in issues_text or "spread" in issues_text or "ratio" in issues_text
    
    @pytest.mark.asyncio
    async def test_analyze_valid_output_minimal_issues(self, critic):
        """Test valid output generates minimal/generic issues."""
        output = get_valid_cost_output()
        input_data = {
            "scope_output": get_mock_scope_output(),
            "location_output": get_mock_location_output()
        }
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=78,  # Just below threshold
            scorer_feedback="Minor issues"
        )
        
        # Should have generic feedback since output is valid
        assert len(result["issues"]) >= 1


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestCostAgentIntegration:
    """Integration tests for Cost Agent flow."""
    
    @pytest.mark.asyncio
    async def test_agent_scorer_critic_flow(self):
        """Test complete agent -> scorer -> critic flow."""
        # Create agent with mocked services
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        firestore.save_cost_items = AsyncMock()
        
        llm = MagicMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {
                "key_cost_drivers": ["Cabinets"],
                "cost_saving_opportunities": [],
                "assumptions": [],
                "range_explanation": "Range explanation",
                "confidence_notes": "Good"
            },
            "tokens_used": 100
        })
        
        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=CostDataService()
        )
        
        input_data = {
            "clarification_output": {},
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output()
        }
        
        # Run agent
        output = await agent.run(
            estimate_id="integration-test",
            input_data=input_data
        )
        
        # Score output (signature: estimate_id, output, input_data)
        scorer = CostScorer()
        score_result = await scorer.score(
            estimate_id="integration-test",
            output=output,
            input_data=input_data
        )
        
        # Verify score is reasonable for valid output
        assert score_result["score"] >= 60
        
        # If below threshold, critic should provide feedback
        if score_result["score"] < 80:
            critic = CostCritic()
            critique = await critic.analyze_output(
                output=output,
                input_data=input_data,
                score=score_result["score"],
                scorer_feedback=score_result["feedback"]
            )
            
            assert "issues" in critique
            assert "how_to_fix" in critique
    
    @pytest.mark.asyncio
    async def test_cost_range_consistency_throughout_output(self):
        """Test that P50/P80/P90 pattern is consistent throughout output."""
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        firestore.save_cost_items = AsyncMock()
        
        llm = MagicMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {},
            "tokens_used": 50
        })
        
        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=CostDataService()
        )
        
        input_data = {
            "clarification_output": {},
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output()
        }
        
        output = await agent.run(
            estimate_id="range-test",
            input_data=input_data
        )
        
        # Check all ranges have consistent ordering
        ranges_to_check = [
            ("total", output.get("total", {})),
            ("subtotals.materials", output.get("subtotals", {}).get("materials", {})),
            ("subtotals.labor", output.get("subtotals", {}).get("labor", {})),
            ("adjustments.overhead", output.get("adjustments", {}).get("overhead", {})),
        ]
        
        for name, range_dict in ranges_to_check:
            if range_dict:
                low = range_dict.get("low", 0)
                medium = range_dict.get("medium", 0)
                high = range_dict.get("high", 0)
                assert low <= medium <= high, f"{name} range invalid: {low} <= {medium} <= {high}"

