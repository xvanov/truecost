"""Unit tests for Location Agent, Scorer, and Critic.

Tests cover:
- LocationFactors Pydantic models
- CostDataService mock implementation
- LocationAgent with LLM integration
- LocationScorer scoring logic
- LocationCritic critique generation
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

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
    get_default_location_factors,
)
from services.cost_data_service import CostDataService
from agents.primary.location_agent import LocationAgent
from agents.scorers.location_scorer import LocationScorer
from agents.critics.location_critic import LocationCritic
from tests.fixtures.mock_cost_data import (
    DENVER_LOCATION_FACTORS,
    NYC_LOCATION_FACTORS,
    HOUSTON_LOCATION_FACTORS,
    get_denver_clarification_input,
    get_nyc_clarification_input,
    get_houston_clarification_input,
    get_unknown_zip_clarification_input,
    get_valid_location_output,
    get_incomplete_location_output,
    get_invalid_location_output,
)

@pytest.fixture(autouse=True)
def mock_deep_agent_generate_json():
    """Patch Deep Agents JSON helper so unit tests don't hit real OpenAI/deepagents runtime."""
    with patch(
        "services.deep_agent_factory.deep_agent_generate_json",
        new=AsyncMock(
            return_value={
                "content": {
                    "analysis": "Test analysis of Denver location factors.",
                    "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
                    "recommendations": ["Recommendation 1", "Recommendation 2"],
                    "risk_factors": ["Risk 1"],
                    "confidence_assessment": "High confidence",
                },
                "tokens_used": 150,
            }
        ),
    ) as mocked:
        yield mocked


# =============================================================================
# LOCATION FACTORS MODEL TESTS
# =============================================================================


class TestLocationFactorsModel:
    """Tests for LocationFactors Pydantic model."""
    
    def test_labor_rates_valid(self):
        """Test valid labor rates are accepted."""
        rates = LaborRates(
            electrician=50.0,
            plumber=55.0,
            carpenter=42.0,
            hvac=52.0,
            general_labor=30.0,
            painter=38.0,
            tile_setter=45.0,
            roofer=40.0,
            concrete_finisher=43.0,
            drywall_installer=40.0
        )
        assert rates.electrician == 50.0
        assert rates.plumber == 55.0
    
    def test_labor_rates_validation(self):
        """Test labor rates validation."""
        with pytest.raises(ValueError):
            LaborRates(
                electrician=-10.0,  # Invalid: negative
                plumber=55.0,
                carpenter=42.0,
                hvac=52.0,
                general_labor=30.0,
                painter=38.0,
                tile_setter=45.0,
                roofer=40.0,
                concrete_finisher=43.0,
                drywall_installer=40.0
            )
    
    def test_permit_costs_calculate_total(self):
        """Test permit costs calculation."""
        permits = PermitCosts(
            building_permit_base=500.0,
            building_permit_percentage=0.01,
            electrical_permit=175.0,
            plumbing_permit=175.0,
            mechanical_permit=150.0,
            plan_review_fee=200.0,
            impact_fees=0.0,
            inspection_fees=100.0
        )
        
        # For a $100,000 project
        total = permits.calculate_total_permit_cost(100000.0)
        
        # Expected: $1000 (1% of 100k) + $500 + $175 + $175 + $150 + $200 + $0 + $100 = $2300
        assert total == 2300.0
    
    def test_location_factors_to_agent_output(self):
        """Test conversion to agent output format."""
        output = DENVER_LOCATION_FACTORS.to_agent_output()
        
        assert output["zipCode"] == "80202"
        assert output["city"] == "Denver"
        assert output["state"] == "CO"
        assert output["region"] == "Mountain"
        assert output["locationFactor"] == 1.05
        assert output["isUnion"] is False
        assert "laborRates" in output
        assert "permitCosts" in output
        assert "weatherFactors" in output
    
    def test_default_location_factors(self):
        """Test default location factors generation."""
        defaults = get_default_location_factors()
        
        assert defaults.zip_code == "00000"
        assert defaults.city == "Unknown"
        assert defaults.region == Region.NATIONAL
        assert defaults.location_factor == 1.0
        assert defaults.confidence == 0.60


# =============================================================================
# COST DATA SERVICE TESTS
# =============================================================================


class TestCostDataService:
    """Tests for CostDataService mock implementation."""
    
    @pytest.mark.asyncio
    async def test_get_denver_factors(self):
        """Test retrieving Denver location factors."""
        service = CostDataService()
        factors = await service.get_location_factors("80202")
        
        assert factors.city == "Denver"
        assert factors.state == "CO"
        assert factors.region == Region.MOUNTAIN
        assert factors.union_status == UnionStatus.MIXED
        assert factors.location_factor == 1.05
    
    @pytest.mark.asyncio
    async def test_get_nyc_factors(self):
        """Test retrieving NYC location factors."""
        service = CostDataService()
        factors = await service.get_location_factors("10001")
        
        assert factors.city == "New York"
        assert factors.state == "NY"
        assert factors.region == Region.NORTHEAST
        assert factors.union_status == UnionStatus.UNION
        assert factors.location_factor == 1.35
    
    @pytest.mark.asyncio
    async def test_get_houston_factors(self):
        """Test retrieving Houston location factors."""
        service = CostDataService()
        factors = await service.get_location_factors("77001")
        
        assert factors.city == "Houston"
        assert factors.state == "TX"
        assert factors.region == Region.SOUTH
        assert factors.union_status == UnionStatus.NON_UNION
        assert factors.location_factor == 0.92
    
    @pytest.mark.asyncio
    async def test_unknown_zip_returns_regional_estimate(self):
        """Test that unknown ZIP returns regional estimate."""
        service = CostDataService()
        factors = await service.get_location_factors("99999")
        
        # Should return regional estimate with lower confidence
        assert factors.confidence == 0.65
        assert factors.city == "Unknown"
    
    @pytest.mark.asyncio
    async def test_cache_works(self):
        """Test that caching works correctly."""
        service = CostDataService()
        
        # First call
        factors1 = await service.get_location_factors("80202")
        # Second call should use cache
        factors2 = await service.get_location_factors("80202")
        
        assert factors1.city == factors2.city
        assert factors1.location_factor == factors2.location_factor
    
    def test_clear_cache(self):
        """Test cache clearing."""
        service = CostDataService()
        service._cache["80202"] = DENVER_LOCATION_FACTORS
        
        service.clear_cache()
        
        assert len(service._cache) == 0


# =============================================================================
# LOCATION AGENT TESTS
# =============================================================================


class TestLocationAgent:
    """Tests for LocationAgent."""
    
    @pytest.fixture
    def mock_firestore(self):
        """Create mock Firestore service."""
        firestore = MagicMock()
        firestore.save_agent_output = AsyncMock()
        firestore.update_agent_status = AsyncMock()
        return firestore
    
    @pytest.fixture
    def mock_llm(self):
        """Create mock LLM service."""
        llm = MagicMock()
        return llm
    
    @pytest.fixture
    def mock_cost_service(self):
        """Create mock cost data service."""
        service = MagicMock()
        service.get_location_factors = AsyncMock(return_value=DENVER_LOCATION_FACTORS)
        return service
    
    @pytest.mark.asyncio
    async def test_run_denver_location(
        self,
        mock_firestore,
        mock_llm,
        mock_cost_service
    ):
        """Test running location agent for Denver."""
        agent = LocationAgent(
            firestore_service=mock_firestore,
            llm_service=mock_llm,
            cost_data_service=mock_cost_service
        )
        
        input_data = get_denver_clarification_input()
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Verify output
        assert result["zipCode"] == "80202"
        assert result["city"] == "Denver"
        assert result["state"] == "CO"
        assert result["locationFactor"] == 1.05
        assert "laborRates" in result
        assert "permitCosts" in result
        assert "analysis" in result
        assert "keyFindings" in result
        
        # Verify Firestore was called
        mock_firestore.save_agent_output.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_run_with_critic_feedback(
        self,
        mock_firestore,
        mock_llm,
        mock_cost_service
    ):
        """Test running with critic feedback."""
        agent = LocationAgent(
            firestore_service=mock_firestore,
            llm_service=mock_llm,
            cost_data_service=mock_cost_service
        )
        
        input_data = get_denver_clarification_input()
        feedback = {
            "score": 65,
            "issues": ["Missing labor rates"],
            "why_wrong": "Incomplete data",
            "how_to_fix": ["Add all required labor rates"]
        }
        
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data,
            feedback=feedback
        )
        
        # Should still produce valid output
        assert result["zipCode"] == "80202"
        assert "laborRates" in result
    
    @pytest.mark.asyncio
    async def test_llm_fallback_on_error(
        self,
        mock_firestore,
        mock_cost_service,
        mock_deep_agent_generate_json
    ):
        """Test fallback analysis when LLM fails."""
        # Force Deep Agents helper to fail so agent uses fallback analysis
        mock_deep_agent_generate_json.side_effect = Exception("LLM Error")
        mock_llm = MagicMock()
        
        agent = LocationAgent(
            firestore_service=mock_firestore,
            llm_service=mock_llm,
            cost_data_service=mock_cost_service
        )
        
        input_data = get_denver_clarification_input()
        result = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Should still produce output with fallback analysis
        assert result["zipCode"] == "80202"
        assert "analysis" in result
        assert len(result.get("keyFindings", [])) > 0


# =============================================================================
# LOCATION SCORER TESTS
# =============================================================================


class TestLocationScorer:
    """Tests for LocationScorer."""
    
    @pytest.fixture
    def scorer(self):
        """Create scorer with mocked dependencies."""
        firestore = MagicMock()
        llm = MagicMock()
        return LocationScorer(
            firestore_service=firestore,
            llm_service=llm
        )
    
    @pytest.mark.asyncio
    async def test_score_valid_output(self, scorer):
        """Test scoring a valid location output."""
        output = get_valid_location_output()
        input_data = get_denver_clarification_input()
        
        result = await scorer.score(
            estimate_id="est-test-001",
            output=output,
            input_data=input_data
        )
        
        assert result["score"] >= 80
        assert result["passed"] is True
        assert "breakdown" in result
    
    @pytest.mark.asyncio
    async def test_score_incomplete_output(self, scorer):
        """Test scoring an incomplete location output."""
        output = get_incomplete_location_output()
        input_data = get_denver_clarification_input()
        
        result = await scorer.score(
            estimate_id="est-test-001",
            output=output,
            input_data=input_data
        )
        
        # Incomplete output should score below threshold
        assert result["score"] < 80
        assert result["passed"] is False
    
    @pytest.mark.asyncio
    async def test_score_invalid_output(self, scorer):
        """Test scoring an invalid location output."""
        output = get_invalid_location_output()
        input_data = get_denver_clarification_input()
        
        result = await scorer.score(
            estimate_id="est-test-001",
            output=output,
            input_data=input_data
        )
        
        # Invalid output should score poorly
        assert result["score"] < 70
        assert result["passed"] is False
    
    @pytest.mark.asyncio
    async def test_check_labor_rates_complete(self, scorer):
        """Test labor rates check with complete data."""
        output = {
            "laborRates": {
                "electrician": 50.0,
                "plumber": 55.0,
                "carpenter": 42.0,
                "hvac": 52.0,
                "general_labor": 30.0,
                "painter": 38.0,
                "tile_setter": 45.0,
                "roofer": 40.0,
                "concrete_finisher": 43.0,
                "drywall_installer": 40.0
            }
        }
        
        result = await scorer.evaluate_criterion(
            {"name": "labor_rates_completeness"},
            output,
            {}
        )
        
        assert result["score"] >= 90
    
    @pytest.mark.asyncio
    async def test_check_location_factor_valid(self, scorer):
        """Test location factor check with valid value."""
        output = {"locationFactor": 1.05}
        
        result = await scorer.evaluate_criterion(
            {"name": "location_factor_validity"},
            output,
            {}
        )
        
        assert result["score"] == 100
    
    @pytest.mark.asyncio
    async def test_check_location_factor_out_of_range(self, scorer):
        """Test location factor check with out-of-range value."""
        output = {"locationFactor": 2.5}
        
        result = await scorer.evaluate_criterion(
            {"name": "location_factor_validity"},
            output,
            {}
        )
        
        assert result["score"] <= 30


# =============================================================================
# LOCATION CRITIC TESTS
# =============================================================================


class TestLocationCritic:
    """Tests for LocationCritic."""
    
    @pytest.fixture
    def mock_llm(self):
        """Create mock LLM service."""
        llm = MagicMock()
        llm.generate_json = AsyncMock(return_value={
            "content": {
                "issues": ["Missing labor rates for carpenter"],
                "why_wrong": "Cannot estimate carpentry costs without rates",
                "how_to_fix": ["Add carpenter labor rate"],
                "suggestions": ["Use regional average if specific data unavailable"],
                "priority": "high"
            },
            "tokens_used": 100
        })
        return llm
    
    @pytest.fixture
    def critic(self, mock_llm):
        """Create critic with mocked dependencies."""
        firestore = MagicMock()
        return LocationCritic(
            firestore_service=firestore,
            llm_service=mock_llm
        )
    
    @pytest.mark.asyncio
    async def test_critique_incomplete_output(self, critic):
        """Test critique of incomplete output."""
        output = get_incomplete_location_output()
        input_data = get_denver_clarification_input()
        
        result = await critic.critique(
            estimate_id="est-test-001",
            output=output,
            input_data=input_data,
            score=65,
            scorer_feedback="Missing labor rates"
        )
        
        assert "issues" in result
        assert "how_to_fix" in result
        assert len(result["issues"]) > 0
    
    @pytest.mark.asyncio
    async def test_analyze_missing_labor_rates(self, critic):
        """Test analysis of missing labor rates."""
        output = {
            "laborRates": {
                "electrician": 50.0,
                # Missing most required trades
            }
        }
        
        result = await critic.analyze_output(
            output=output,
            input_data={},
            score=60,
            scorer_feedback="Incomplete"
        )
        
        assert any("Missing labor rates" in issue for issue in result["issues"])
    
    @pytest.mark.asyncio
    async def test_analyze_invalid_location_factor(self, critic):
        """Test analysis of invalid location factor."""
        output = {
            "laborRates": {
                "electrician": 50.0,
                "plumber": 55.0,
                "carpenter": 42.0,
                "hvac": 52.0,
                "general_labor": 30.0,
                "painter": 38.0
            },
            "locationFactor": 3.0  # Out of range
        }
        
        result = await critic.analyze_output(
            output=output,
            input_data={},
            score=60,
            scorer_feedback="Invalid factor"
        )
        
        assert any("Location factor" in issue for issue in result["issues"])
    
    def test_suggest_location_factor(self, critic):
        """Test location factor suggestion by state."""
        # High cost state
        assert critic._suggest_location_factor("NY") == 1.35
        assert critic._suggest_location_factor("CA") == 1.25
        
        # Low cost state
        assert critic._suggest_location_factor("MS") == 0.88
        assert critic._suggest_location_factor("AR") == 0.90
        
        # Average state
        assert critic._suggest_location_factor("CO") == 1.0


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestLocationAgentIntegration:
    """Integration tests for location agent workflow."""
    
    @pytest.mark.asyncio
    async def test_full_workflow_pass(self):
        """Test full workflow with passing score."""
        # Setup mocks
        mock_firestore = MagicMock()
        mock_firestore.save_agent_output = AsyncMock()
        mock_firestore.update_agent_status = AsyncMock()
        
        mock_llm = MagicMock()
        mock_llm.generate_json = AsyncMock(return_value={
            "content": {
                "analysis": "Comprehensive analysis of location factors.",
                "key_findings": ["Finding 1", "Finding 2", "Finding 3"],
                "recommendations": ["Rec 1", "Rec 2"],
                "risk_factors": ["Risk 1"],
                "confidence_assessment": "High"
            },
            "tokens_used": 150
        })
        
        mock_cost_service = MagicMock()
        mock_cost_service.get_location_factors = AsyncMock(
            return_value=DENVER_LOCATION_FACTORS
        )
        
        # Create agent and run
        agent = LocationAgent(
            firestore_service=mock_firestore,
            llm_service=mock_llm,
            cost_data_service=mock_cost_service
        )
        
        input_data = get_denver_clarification_input()
        agent_output = await agent.run(
            estimate_id="est-test-001",
            input_data=input_data
        )
        
        # Create scorer and score output
        scorer = LocationScorer(
            firestore_service=mock_firestore,
            llm_service=mock_llm
        )
        
        score_result = await scorer.score(
            estimate_id="est-test-001",
            output=agent_output,
            input_data=input_data
        )
        
        # Should pass
        assert score_result["passed"] is True
        assert score_result["score"] >= 80
    
    @pytest.mark.asyncio
    async def test_full_workflow_fail_and_critique(self):
        """Test full workflow with failing score triggering critic."""
        # Setup mocks
        mock_firestore = MagicMock()
        mock_firestore.save_agent_output = AsyncMock()
        
        mock_llm = MagicMock()
        mock_llm.generate_json = AsyncMock(return_value={
            "content": {
                "issues": ["Missing data"],
                "why_wrong": "Incomplete",
                "how_to_fix": ["Add missing fields"],
                "suggestions": [],
                "priority": "high"
            },
            "tokens_used": 100
        })
        
        # Use incomplete output
        agent_output = get_incomplete_location_output()
        input_data = get_denver_clarification_input()
        
        # Score output
        scorer = LocationScorer(
            firestore_service=mock_firestore,
            llm_service=mock_llm
        )
        
        score_result = await scorer.score(
            estimate_id="est-test-001",
            output=agent_output,
            input_data=input_data
        )
        
        # Should fail
        assert score_result["passed"] is False
        assert score_result["score"] < 80
        
        # Generate critique
        critic = LocationCritic(
            firestore_service=mock_firestore,
            llm_service=mock_llm
        )
        
        critique = await critic.critique(
            estimate_id="est-test-001",
            output=agent_output,
            input_data=input_data,
            score=score_result["score"],
            scorer_feedback=score_result["feedback"]
        )
        
        # Should have actionable feedback
        assert len(critique["issues"]) > 0
        assert len(critique["how_to_fix"]) > 0



