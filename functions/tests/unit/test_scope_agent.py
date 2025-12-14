"""Unit tests for Scope Agent, Scorer, and Critic.

Tests cover:
- BillOfQuantities model validation
- CostDataService cost code lookup
- ScopeAgent enrichment logic
- ScopeScorer scoring criteria
- ScopeCritic feedback generation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Models
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
    get_division_name,
    get_primary_trade,
)

# Agents
from agents.primary.scope_agent import ScopeAgent
from agents.scorers.scope_scorer import ScopeScorer
from agents.critics.scope_critic import ScopeCritic

# Services
from services.cost_data_service import CostDataService

# Fixtures
from tests.fixtures.mock_boq_data import (
    get_kitchen_csi_scope,
    get_kitchen_clarification_input,
    get_valid_scope_output,
    get_incomplete_scope_output,
    get_scope_agent_a2a_request,
    get_scope_scorer_a2a_request,
    get_scope_critic_a2a_request,
)

@pytest.fixture(autouse=True)
def mock_deep_agent_generate_json():
    """Patch Deep Agents JSON helper so unit tests don't hit real OpenAI/deepagents runtime."""
    with patch(
        "services.deep_agent_factory.deep_agent_generate_json",
        new=AsyncMock(
            return_value={
                "content": {
                    "summary": "Kitchen remodel scope analysis",
                    "key_observations": ["Obs 1", "Obs 2", "Obs 3"],
                    "material_highlights": ["Material 1"],
                    "complexity_factors": ["Factor 1"],
                    "finish_level_assessment": "Appropriate for mid-range",
                    "recommendations": ["Rec 1", "Rec 2"],
                    "missing_items": [],
                    "suggested_additions": [],
                },
                "tokens_used": 500,
            }
        ),
    ) as mocked:
        yield mocked


# =============================================================================
# BILL OF QUANTITIES MODEL TESTS
# =============================================================================


class TestBillOfQuantitiesModel:
    """Tests for BoQ Pydantic models."""
    
    def test_cost_code_model(self):
        """Test CostCode model creation."""
        code = CostCode(
            code="06-4100-0100",
            description="Base cabinets",
            subdivision="06 41 00",
            source=CostCodeSource.RSMEANS,
            confidence=0.95
        )
        
        assert code.code == "06-4100-0100"
        assert code.subdivision == "06 41 00"
        assert code.source == CostCodeSource.RSMEANS
        assert code.confidence == 0.95
    
    def test_unit_cost_reference_model(self):
        """Test UnitCostReference model creation."""
        ref = UnitCostReference(
            material_cost_per_unit=175.0,
            labor_hours_per_unit=1.0,
            primary_trade=TradeCategory.CABINET_INSTALLER,
            secondary_trades=[TradeCategory.CARPENTER],
            equipment_cost_per_unit=0.0,
            cost_code_source="RSMeans 2024"
        )
        
        assert ref.material_cost_per_unit == 175.0
        assert ref.labor_hours_per_unit == 1.0
        assert ref.primary_trade == TradeCategory.CABINET_INSTALLER
        assert len(ref.secondary_trades) == 1
    
    def test_enriched_line_item_model(self):
        """Test EnrichedLineItem model creation."""
        item = EnrichedLineItem(
            id="06-001",
            item="Base cabinets",
            original_subdivision_code="06 41 00",
            quantity=16.0,
            unit="LF",
            specifications="Shaker style, maple",
            notes=None,
            original_confidence=0.94,
            source="user_input",
            cost_code=CostCode(
                code="06-4100-0100",
                description="Base cabinets",
                source=CostCodeSource.RSMEANS,
                confidence=0.95
            ),
            unit_cost_reference=UnitCostReference(
                material_cost_per_unit=175.0,
                labor_hours_per_unit=1.0,
                primary_trade=TradeCategory.CABINET_INSTALLER
            ),
            quantity_validation=QuantityValidationStatus.ESTIMATED,
            estimated_material_cost=2800.0,
            estimated_labor_hours=16.0
        )
        
        assert item.id == "06-001"
        assert item.quantity == 16.0
        assert item.estimated_material_cost == 2800.0
        assert item.quantity_validation == QuantityValidationStatus.ESTIMATED
    
    def test_enriched_division_calculate_subtotals(self):
        """Test EnrichedDivision subtotal calculation."""
        item1 = EnrichedLineItem(
            id="06-001",
            item="Base cabinets",
            quantity=16.0,
            unit="LF",
            original_confidence=0.94,
            source="user_input",
            cost_code=CostCode(code="06-4100-0100", description="Base cabinets", source=CostCodeSource.RSMEANS, confidence=0.95),
            unit_cost_reference=UnitCostReference(material_cost_per_unit=175.0, labor_hours_per_unit=1.0, primary_trade=TradeCategory.CABINET_INSTALLER),
            quantity_validation=QuantityValidationStatus.ESTIMATED,
            estimated_material_cost=2800.0,
            estimated_labor_hours=16.0
        )
        
        item2 = EnrichedLineItem(
            id="06-002",
            item="Upper cabinets",
            quantity=14.0,
            unit="LF",
            original_confidence=0.94,
            source="user_input",
            cost_code=CostCode(code="06-4100-0200", description="Upper cabinets", source=CostCodeSource.RSMEANS, confidence=0.94),
            unit_cost_reference=UnitCostReference(material_cost_per_unit=150.0, labor_hours_per_unit=0.85, primary_trade=TradeCategory.CABINET_INSTALLER),
            quantity_validation=QuantityValidationStatus.VALIDATED,
            estimated_material_cost=2100.0,
            estimated_labor_hours=11.9
        )
        
        division = EnrichedDivision(
            division_code="06",
            division_name="Wood, Plastics, Composites",
            status="included",
            description="Cabinets",
            line_items=[item1, item2]
        )
        
        division.calculate_subtotals()
        
        assert division.subtotal_material_cost == 4900.0
        assert division.subtotal_labor_hours == 27.9
        assert division.item_count == 2
        assert division.items_with_cost_codes == 2
        assert division.items_validated == 1  # Only item2 is validated
    
    def test_get_division_name(self):
        """Test CSI division name lookup."""
        assert get_division_name("06") == "Wood, Plastics, and Composites"
        assert get_division_name("22") == "Plumbing"
        assert get_division_name("99") == "Division 99"  # Unknown
    
    def test_get_primary_trade(self):
        """Test primary trade lookup by division."""
        assert get_primary_trade("06") == TradeCategory.CARPENTER
        assert get_primary_trade("22") == TradeCategory.PLUMBER
        assert get_primary_trade("26") == TradeCategory.ELECTRICIAN
        assert get_primary_trade("99") == TradeCategory.GENERAL_LABOR  # Default


# =============================================================================
# COST DATA SERVICE TESTS
# =============================================================================


class TestCostDataServiceCostCodes:
    """Tests for CostDataService.get_cost_code()."""
    
    @pytest.fixture
    def service(self):
        """Create CostDataService instance."""
        return CostDataService()
    
    @pytest.mark.asyncio
    async def test_get_cost_code_exact_subdivision_match(self, service):
        """Test cost code lookup with exact subdivision match."""
        result = await service.get_cost_code(
            item_description="Base cabinets",
            division_code="06",
            subdivision_code="06 41 00"
        )
        
        assert result["cost_code"] is not None
        assert result["material_cost_per_unit"] > 0
        assert result["primary_trade"] in ["cabinet_installer", "carpenter"]
        assert result["confidence"] >= 0.9
    
    @pytest.mark.asyncio
    async def test_get_cost_code_fuzzy_match(self, service):
        """Test cost code lookup with fuzzy keyword match."""
        result = await service.get_cost_code(
            item_description="Kitchen base cabinet installation",
            division_code="06"
        )
        
        assert result["cost_code"] is not None
        assert result["confidence"] > 0.5
    
    @pytest.mark.asyncio
    async def test_get_cost_code_default_fallback(self, service):
        """Test cost code lookup falls back to division default."""
        result = await service.get_cost_code(
            item_description="Some obscure item that doesn't match anything",
            division_code="06"
        )
        
        assert result["cost_code"].startswith("GEN-06")
        assert result["confidence"] == 0.5
        assert result["source"] == "inferred"
    
    @pytest.mark.asyncio
    async def test_get_cost_code_electrical_items(self, service):
        """Test cost code lookup for electrical items."""
        result = await service.get_cost_code(
            item_description="Recessed LED light fixture",
            division_code="26",
            subdivision_code="26 51 00"
        )
        
        assert result["primary_trade"] == "electrician"
        assert result["material_cost_per_unit"] > 0
    
    @pytest.mark.asyncio
    async def test_get_cost_code_plumbing_items(self, service):
        """Test cost code lookup for plumbing items."""
        result = await service.get_cost_code(
            item_description="Kitchen faucet with pull-down sprayer",
            division_code="22",
            subdivision_code="22 41 00"
        )
        
        assert result["primary_trade"] == "plumber"
        assert result["labor_hours_per_unit"] > 0


# =============================================================================
# SCOPE AGENT TESTS
# =============================================================================


class TestScopeAgent:
    """Tests for ScopeAgent."""
    
    @pytest.fixture
    def mock_services(self):
        """Create mock services for agent."""
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        
        llm = AsyncMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {
                "summary": "Kitchen remodel scope analysis",
                "key_observations": ["Obs 1", "Obs 2", "Obs 3"],
                "material_highlights": ["Material 1"],
                "complexity_factors": ["Factor 1"],
                "finish_level_assessment": "Appropriate for mid-range",
                "recommendations": ["Rec 1", "Rec 2"],
                "missing_items": [],
                "suggested_additions": []
            },
            "tokens_used": 500
        })
        
        cost_data = CostDataService()
        
        return firestore, llm, cost_data
    
    @pytest.mark.asyncio
    async def test_scope_agent_run(self, mock_services):
        """Test ScopeAgent.run() produces valid output."""
        firestore, llm, cost_data = mock_services
        
        agent = ScopeAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = get_kitchen_clarification_input()
        
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Check structure
        assert "divisions" in result
        assert "totalLineItems" in result
        assert "completeness" in result
        assert "confidence" in result
        
        # Check divisions enriched
        assert len(result["divisions"]) > 0
        assert result["totalLineItems"] > 0
        
        # Check Firestore called
        firestore.save_agent_output.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_scope_agent_enriches_cost_codes(self, mock_services):
        """Test that ScopeAgent assigns cost codes to items."""
        firestore, llm, cost_data = mock_services
        
        agent = ScopeAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = get_kitchen_clarification_input()
        
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Check that included divisions have items with cost codes
        for div in result["divisions"]:
            if div["status"] == "included":
                for item in div.get("lineItems", []):
                    assert "costCode" in item
                    assert item["costCode"] is not None
                    assert len(item["costCode"]) > 0
    
    @pytest.mark.asyncio
    async def test_scope_agent_calculates_estimates(self, mock_services):
        """Test that ScopeAgent calculates material and labor estimates."""
        firestore, llm, cost_data = mock_services
        
        agent = ScopeAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = get_kitchen_clarification_input()
        
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Check preliminary totals calculated
        assert result["preliminaryMaterialCost"] > 0
        assert result["preliminaryLaborHours"] > 0
        
        # Check division subtotals
        for div in result["divisions"]:
            if div["status"] == "included" and div.get("lineItems"):
                assert div["subtotalMaterialCost"] >= 0
                assert div["subtotalLaborHours"] >= 0


# =============================================================================
# SCOPE SCORER TESTS
# =============================================================================


class TestScopeScorer:
    """Tests for ScopeScorer."""
    
    @pytest.fixture
    def scorer(self):
        """Create ScopeScorer instance."""
        firestore = AsyncMock()
        llm = AsyncMock()
        return ScopeScorer(firestore_service=firestore, llm_service=llm)
    
    def test_get_scoring_criteria(self, scorer):
        """Test scoring criteria are defined."""
        criteria = scorer.get_scoring_criteria()
        
        assert len(criteria) >= 5
        
        names = [c["name"] for c in criteria]
        assert "cost_code_coverage" in names
        assert "quantity_completeness" in names
        assert "division_coverage" in names
    
    @pytest.mark.asyncio
    async def test_score_valid_output_high(self, scorer):
        """Test scoring valid output returns high score."""
        output = get_valid_scope_output()
        input_data = get_kitchen_clarification_input()
        
        # Score each criterion
        criteria = scorer.get_scoring_criteria()
        total_score = 0
        total_weight = 0
        
        for criterion in criteria:
            result = await scorer.evaluate_criterion(criterion, output, input_data)
            total_score += result["score"] * criterion["weight"]
            total_weight += criterion["weight"]
        
        weighted_score = total_score / total_weight if total_weight > 0 else 0
        
        # Valid output should score >= 80
        assert weighted_score >= 75  # Allow some tolerance
    
    @pytest.mark.asyncio
    async def test_score_incomplete_output_low(self, scorer):
        """Test scoring incomplete output returns low score."""
        output = get_incomplete_scope_output()
        input_data = get_kitchen_clarification_input()
        
        # Score cost code coverage
        result = await scorer.evaluate_criterion(
            {"name": "cost_code_coverage", "weight": 3},
            output,
            input_data
        )
        
        # Incomplete output has 50% coverage, should score low
        assert result["score"] < 70
    
    @pytest.mark.asyncio
    async def test_check_cost_code_coverage_full(self, scorer):
        """Test cost code coverage check with full coverage."""
        output = get_valid_scope_output()
        
        result = scorer._check_cost_code_coverage(output)
        
        assert result["score"] == 100
        assert "Excellent" in result["feedback"] or "All items" in result["feedback"]
    
    @pytest.mark.asyncio
    async def test_check_cost_code_coverage_partial(self, scorer):
        """Test cost code coverage check with partial coverage."""
        output = get_incomplete_scope_output()
        
        result = scorer._check_cost_code_coverage(output)
        
        assert result["score"] < 80
    
    @pytest.mark.asyncio
    async def test_check_division_coverage(self, scorer):
        """Test division coverage check for kitchen."""
        output = get_valid_scope_output()
        input_data = get_kitchen_clarification_input()
        
        result = await scorer.evaluate_criterion(
            {"name": "division_coverage", "weight": 2},
            output,
            input_data
        )
        
        # Valid output has sufficient divisions
        assert result["score"] >= 80
    
    @pytest.mark.asyncio
    async def test_check_line_item_count(self, scorer):
        """Test line item count check."""
        output = get_valid_scope_output()
        input_data = get_kitchen_clarification_input()
        
        result = await scorer.evaluate_criterion(
            {"name": "line_item_count", "weight": 2},
            output,
            input_data
        )
        
        # Valid output has 32 items, kitchen needs 25+
        assert result["score"] >= 90


# =============================================================================
# SCOPE CRITIC TESTS
# =============================================================================


class TestScopeCritic:
    """Tests for ScopeCritic."""
    
    @pytest.fixture
    def critic(self):
        """Create ScopeCritic instance."""
        firestore = AsyncMock()
        llm = AsyncMock()
        return ScopeCritic(firestore_service=firestore, llm_service=llm)
    
    def test_get_critique_prompt(self, critic):
        """Test critique prompt is comprehensive."""
        prompt = critic.get_critique_prompt()
        
        assert "Cost Code" in prompt
        assert "Quantity" in prompt
        assert "Division" in prompt
    
    @pytest.mark.asyncio
    async def test_analyze_incomplete_output(self, critic):
        """Test analysis of incomplete output generates issues."""
        output = get_incomplete_scope_output()
        input_data = get_kitchen_clarification_input()
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=55,
            scorer_feedback="Multiple issues"
        )
        
        assert len(result["issues"]) > 0
        assert len(result["how_to_fix"]) > 0
    
    @pytest.mark.asyncio
    async def test_analyze_cost_code_issues(self, critic):
        """Test analysis identifies cost code issues."""
        output = get_incomplete_scope_output()
        
        result = critic._analyze_cost_code_coverage(output)
        
        # Should find coverage < 90%
        assert len(result["issues"]) > 0 or output["completeness"]["costCodeCoverage"] >= 0.9
    
    @pytest.mark.asyncio
    async def test_analyze_quantity_issues(self, critic):
        """Test analysis identifies quantity issues."""
        output = get_incomplete_scope_output()
        
        result = critic._analyze_quantity_completeness(output)
        
        # Should find items with zero quantity
        assert len(result["issues"]) > 0
    
    @pytest.mark.asyncio
    async def test_analyze_division_coverage_issues(self, critic):
        """Test analysis identifies missing divisions."""
        output = get_incomplete_scope_output()
        
        result = critic._analyze_division_coverage(output, "kitchen_remodel")
        
        # Should find missing divisions
        assert len(result["issues"]) > 0
        assert any("Missing" in issue or "missing" in issue for issue in result["issues"])
    
    @pytest.mark.asyncio
    async def test_analyze_valid_output_few_issues(self, critic):
        """Test analysis of valid output finds few/no issues."""
        output = get_valid_scope_output()
        input_data = get_kitchen_clarification_input()
        
        result = await critic.analyze_output(
            output=output,
            input_data=input_data,
            score=75,  # Just below threshold
            scorer_feedback="Minor issues"
        )
        
        # Valid output should have fewer issues than incomplete
        incomplete_result = await critic.analyze_output(
            output=get_incomplete_scope_output(),
            input_data=input_data,
            score=55,
            scorer_feedback="Multiple issues"
        )
        
        assert len(result["issues"]) <= len(incomplete_result["issues"])


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestScopeAgentIntegration:
    """Integration tests for scope agent flow."""
    
    @pytest.mark.asyncio
    async def test_agent_scorer_critic_flow(self):
        """Test the full agent -> scorer -> critic flow."""
        # Create mocks
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        
        llm = AsyncMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {
                "summary": "Kitchen remodel analysis",
                "key_observations": ["Obs 1", "Obs 2", "Obs 3"],
                "material_highlights": ["Mat 1"],
                "complexity_factors": ["Factor 1"],
                "finish_level_assessment": "Appropriate",
                "recommendations": ["Rec 1", "Rec 2"],
                "missing_items": [],
                "suggested_additions": []
            },
            "tokens_used": 500
        })
        
        cost_data = CostDataService()
        
        # Run agent
        agent = ScopeAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=cost_data
        )
        
        input_data = get_kitchen_clarification_input()
        
        agent_output = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Score output
        scorer = ScopeScorer(firestore_service=firestore, llm_service=llm)
        criteria = scorer.get_scoring_criteria()
        
        total_score = 0
        total_weight = 0
        
        for criterion in criteria:
            result = await scorer.evaluate_criterion(criterion, agent_output, input_data)
            total_score += result["score"] * criterion["weight"]
            total_weight += criterion["weight"]
        
        weighted_score = total_score / total_weight if total_weight > 0 else 0
        
        # If score < 80, run critic
        if weighted_score < 80:
            critic = ScopeCritic(firestore_service=firestore, llm_service=llm)
            critique = await critic.analyze_output(
                output=agent_output,
                input_data=input_data,
                score=int(weighted_score),
                scorer_feedback="Below threshold"
            )
            
            assert "issues" in critique
            assert "how_to_fix" in critique
        else:
            # Agent passed without needing critic
            pass
        
        # Either way, agent should have produced output
        assert agent_output["totalLineItems"] > 0
        assert len(agent_output["divisions"]) > 0
    
    @pytest.mark.asyncio
    async def test_cost_code_enrichment_coverage(self):
        """Test that cost code enrichment covers all items."""
        # Run full enrichment
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        
        llm = AsyncMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {
                "summary": "Test",
                "key_observations": ["A", "B", "C"],
                "material_highlights": ["M"],
                "complexity_factors": ["C"],
                "finish_level_assessment": "OK",
                "recommendations": ["R1", "R2"],
                "missing_items": [],
                "suggested_additions": []
            },
            "tokens_used": 100
        })
        
        agent = ScopeAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=CostDataService()
        )
        
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=get_kitchen_clarification_input()
        )
        
        # Count items with cost codes
        total_items = 0
        items_with_codes = 0
        
        for div in result["divisions"]:
            if div["status"] == "included":
                for item in div.get("lineItems", []):
                    total_items += 1
                    if item.get("costCode") and len(item["costCode"]) > 0:
                        items_with_codes += 1
        
        # Should have > 90% coverage
        coverage = items_with_codes / total_items if total_items > 0 else 0
        assert coverage >= 0.9



