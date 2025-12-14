"""Unit tests for Risk, Timeline, and Final Agents (PR #7).

Tests cover:
- Risk analysis models
- Monte Carlo service
- Risk Agent, Scorer, Critic
- Timeline models
- Timeline Agent, Scorer, Critic
- Final estimate models
- Final Agent, Scorer, Critic
"""

import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import ValidationError
from config.settings import settings

# Models
from models.risk_analysis import (
    RiskFactor, MonteCarloResult, PercentileValues, DistributionStatistics,
    ContingencyRecommendation, RiskAnalysis, RiskAnalysisSummary,
    RiskCategory, RiskImpact, ConfidenceLevel
)
from models.timeline import (
    TimelineTask, ProjectTimeline, CriticalPath, Milestone,
    TaskDependency, DependencyType, PhaseType, TaskStatus,
    TimelineSummary, WeatherImpact
)
from models.final_estimate import (
    FinalEstimate, ExecutiveSummary, CostBreakdownSummary,
    ConfidenceRange, TimelineSummaryForEstimate, RiskSummaryForEstimate,
    Recommendation, EstimateConfidence, ProjectComplexity
)

# Services
from services.monte_carlo_service import MonteCarloService

# Agents
from agents.primary.risk_agent import RiskAgent
from agents.primary.timeline_agent import TimelineAgent
from agents.primary.final_agent import FinalAgent
from agents.scorers.risk_scorer import RiskScorer
from agents.scorers.timeline_scorer import TimelineScorer
from agents.scorers.final_scorer import FinalScorer
from agents.critics.risk_critic import RiskCritic
from agents.critics.timeline_critic import TimelineCritic
from agents.critics.final_critic import FinalCritic

# Fixtures
from tests.fixtures.mock_risk_timeline_data import (
    get_mock_cost_output, get_mock_location_output, get_mock_scope_output,
    get_mock_clarification_output, get_valid_risk_output, get_invalid_percentiles_output,
    get_valid_timeline_output, get_invalid_timeline_output,
    get_valid_final_output, get_incomplete_final_output
)

@pytest.fixture(autouse=True)
def mock_deep_agent_generate_json():
    """Patch Deep Agents JSON helper so unit tests don't hit real OpenAI/deepagents runtime."""

    async def _default_side_effect(**kwargs):  # noqa: ANN001
        agent_name = kwargs.get("agent_name")
        if agent_name == "risk":
            return {
                "content": {
                    "risk_level_assessment": "Medium risk",
                    "key_insights": ["Monte Carlo completed"],
                    "mitigation_priorities": [{"risk": "Test", "action": "Monitor"}],
                },
                "tokens_used": 100,
            }
        if agent_name == "timeline":
            return {
                "content": {
                    "tasks": [
                        {
                            "name": "Permits & Planning",
                            "phase": "preconstruction",
                            "duration_days": 5,
                            "primary_trade": "general",
                            "depends_on": [],
                        },
                        {
                            "name": "Demolition",
                            "phase": "demolition",
                            "duration_days": 2,
                            "primary_trade": "demolition",
                            "depends_on": ["Permits & Planning"],
                        },
                        {
                            "name": "Final Inspection",
                            "phase": "final_inspection",
                            "duration_days": 1,
                            "primary_trade": "general",
                            "depends_on": ["Demolition"],
                        },
                    ]
                },
                "tokens_used": 50,
            }
        if agent_name == "final":
            return {
                "content": {
                    "recommendations": ["Rec 1", "Rec 2"],
                    "next_steps": ["Step 1"],
                    "key_assumptions": ["Assumption 1"],
                },
                "tokens_used": 10,
            }
        return {"content": {}, "tokens_used": 10}

    with patch(
        "services.deep_agent_factory.deep_agent_generate_json",
        new=AsyncMock(side_effect=_default_side_effect),
    ) as mocked:
        yield mocked


# =============================================================================
# RISK ANALYSIS MODEL TESTS
# =============================================================================


class TestRiskFactorModel:
    """Test RiskFactor Pydantic model."""
    
    def test_valid_risk_factor(self):
        """Test creating a valid risk factor."""
        rf = RiskFactor(
            id="RF001",
            name="Material Price Volatility",
            description="Supply chain issues may affect material costs",
            category=RiskCategory.MATERIAL_COST,
            impact=RiskImpact.HIGH,
            probability=0.35,
            cost_impact_low=500,
            cost_impact_high=2000,
            mitigation="Lock in prices early"
        )
        assert rf.id == "RF001"
        assert rf.probability == 0.35
        assert rf.impact == RiskImpact.HIGH
    
    def test_invalid_probability(self):
        """Test that probability must be 0-1."""
        with pytest.raises(ValidationError):
            RiskFactor(
                id="RF001",
                name="Test",
                description="Test",
                category=RiskCategory.MATERIAL_COST,
                impact=RiskImpact.MEDIUM,
                probability=1.5,  # Invalid - > 1
                cost_impact_low=100,
                cost_impact_high=500
            )
    
    def test_invalid_cost_impact_order(self):
        """Test that cost_impact_low must be <= cost_impact_high."""
        with pytest.raises(ValidationError):
            RiskFactor(
                id="RF001",
                name="Test",
                description="Test",
                category=RiskCategory.MATERIAL_COST,
                impact=RiskImpact.MEDIUM,
                probability=0.5,
                cost_impact_low=1000,  # Invalid - > high
                cost_impact_high=500
            )
    
    def test_expected_impact_calculation(self):
        """Test expected impact calculation."""
        rf = RiskFactor(
            id="RF001",
            name="Test",
            description="Test",
            category=RiskCategory.MATERIAL_COST,
            impact=RiskImpact.MEDIUM,
            probability=0.5,
            cost_impact_low=200,
            cost_impact_high=400
        )
        # Expected = 0.5 * ((200 + 400) / 2) = 0.5 * 300 = 150
        assert rf.expected_impact() == 150


class TestPercentileValues:
    """Test PercentileValues model."""
    
    def test_valid_percentiles(self):
        """Test valid percentile order."""
        pv = PercentileValues(
            p10=25000, p25=27000, p50=29000, p75=31000, p80=32000, p90=34000, p95=36000
        )
        assert pv.p50 == 29000
        assert pv.p90 == 34000
    
    def test_invalid_percentile_order(self):
        """Test that percentiles must be ascending."""
        with pytest.raises(ValidationError):
            PercentileValues(
                p10=30000, p25=27000, p50=29000,  # p10 > p25 - invalid
                p75=31000, p80=32000, p90=34000, p95=36000
            )


class TestMonteCarloResult:
    """Test MonteCarloResult model."""
    
    def test_valid_result(self):
        """Test creating a valid Monte Carlo result."""
        result = MonteCarloResult(
            iterations=1000,
            percentiles=PercentileValues(
                p10=25000, p25=27000, p50=29000, p75=31000, p80=32000, p90=34000, p95=36000
            ),
            statistics=DistributionStatistics(
                min=24000, max=38000, mean=29500, std_dev=3000, median=29000
            )
        )
        assert result.iterations == 1000
        assert result.percentiles.p50 == 29000
    
    def test_range_spread_calculation(self):
        """Test P90/P50 ratio calculation."""
        result = MonteCarloResult(
            iterations=1000,
            percentiles=PercentileValues(
                p10=25000, p25=27000, p50=30000, p75=32000, p80=33000, p90=36000, p95=38000
            ),
            statistics=DistributionStatistics(
                min=24000, max=40000, mean=30500, std_dev=3500, median=30000
            )
        )
        # P90 / P50 = 36000 / 30000 = 1.2
        assert result.get_range_spread() == 1.2


# =============================================================================
# MONTE CARLO SERVICE TESTS
# =============================================================================


class TestMonteCarloService:
    """Test Monte Carlo simulation service."""
    
    @pytest.fixture
    def mc_service(self):
        """Create Monte Carlo service with fixed seed."""
        return MonteCarloService(seed=42)
    
    def test_generate_risk_factors(self, mc_service):
        """Test risk factor generation."""
        factors = mc_service.generate_risk_factors(
            base_cost=30000,
            project_type="renovation",
            location_risk="medium"
        )
        assert len(factors) >= 5
        assert all(isinstance(f, RiskFactor) for f in factors)
    
    @pytest.mark.asyncio
    async def test_run_simulation(self, mc_service):
        """Test Monte Carlo simulation."""
        factors = mc_service.generate_risk_factors(base_cost=30000)
        
        result = await mc_service.run_simulation(
            base_cost=30000,
            risk_factors=factors,
            iterations=100
        )
        
        assert result.iterations == 100
        assert result.percentiles.p50 > 0
        assert result.percentiles.p50 <= result.percentiles.p80 <= result.percentiles.p90
    
    def test_calculate_contingency(self, mc_service):
        """Test contingency calculation."""
        # Create mock Monte Carlo result
        mc_result = MonteCarloResult(
            iterations=1000,
            percentiles=PercentileValues(
                p10=27000, p25=28000, p50=30000, p75=32000, p80=33000, p90=35000, p95=37000
            ),
            statistics=DistributionStatistics(
                min=25000, max=40000, mean=30500, std_dev=3000, median=30000
            )
        )
        
        contingency = mc_service.calculate_contingency(
            base_cost=30000,
            monte_carlo_result=mc_result,
            confidence_level="P80"
        )
        
        # P80 contingency = (33000 - 30000) / 30000 * 100 = 10%
        assert contingency.recommended_percentage == 10.0
        assert contingency.recommended_amount == 3000


# =============================================================================
# RISK AGENT TESTS
# =============================================================================


class TestRiskAgent:
    """Test Risk Agent."""
    
    @pytest.fixture
    def mock_services(self):
        """Create mock services."""
        firestore = AsyncMock()
        llm = AsyncMock()
        llm.generate_json.return_value = {
            "content": {
                "risk_level_assessment": "Medium risk",
                "key_insights": ["Monte Carlo completed"],
                "mitigation_priorities": [{"risk": "Test", "action": "Monitor"}]
            },
            "tokens_used": 100
        }
        return firestore, llm
    
    @pytest.mark.asyncio
    async def test_risk_agent_run(self, mock_services, monkeypatch):
        """Test Risk Agent execution."""
        # Keep unit test fast regardless of production default iterations.
        monkeypatch.setattr(settings, "monte_carlo_iterations", 1000)
        firestore, llm = mock_services
        agent = RiskAgent(
            firestore_service=firestore,
            llm_service=llm
        )
        
        input_data = {
            "clarification_output": get_mock_clarification_output(),
            "location_output": get_mock_location_output(),
            "cost_output": get_mock_cost_output()
        }
        
        result = await agent.run("test-001", input_data)
        
        # Check output structure
        assert "monteCarlo" in result
        assert "contingency" in result
        assert "topRisks" in result
        
        # Check percentiles are valid
        mc = result["monteCarlo"]
        assert mc["p50"] <= mc["p80"] <= mc["p90"]
        
        # Check Firestore was called
        firestore.save_agent_output.assert_called_once()

    @pytest.mark.asyncio
    async def test_risk_agent_missing_cost_does_not_invent_numbers(self, mock_services, monkeypatch):
        """If cost totals/subtotals are missing, RiskAgent must not invent base_cost."""
        monkeypatch.setattr(settings, "monte_carlo_iterations", 1000)
        firestore, llm = mock_services

        agent = RiskAgent(
            firestore_service=firestore,
            llm_service=llm
        )

        # Missing/empty cost output
        input_data = {
            "clarification_output": get_mock_clarification_output(),
            "location_output": get_mock_location_output(),
            "cost_output": {},
        }

        result = await agent.run("test-001", input_data)
        assert result.get("riskLevel") == "n/a"
        assert result.get("monteCarlo") is None
        assert result.get("contingency") is None
        assert result.get("error", {}).get("code") == "INSUFFICIENT_DATA"


class TestRiskScorer:
    """Test Risk Scorer."""
    
    @pytest.fixture
    def scorer(self):
        """Create scorer with mock services."""
        return RiskScorer(
            firestore_service=MagicMock(),
            llm_service=MagicMock()
        )
    
    @pytest.mark.asyncio
    async def test_score_valid_output(self, scorer):
        """Test scoring valid risk output."""
        output = get_valid_risk_output()
        input_data = {"cost_output": get_mock_cost_output()}
        
        result = await scorer.score("test-001", output, input_data)
        
        assert result["score"] >= 80
        # Check breakdown contains our criteria
        criteria_names = [b["criterion"] for b in result["breakdown"]]
        assert "percentiles_valid" in criteria_names
    
    @pytest.mark.asyncio
    async def test_score_invalid_percentiles(self, scorer):
        """Test scoring output with invalid percentiles."""
        output = get_invalid_percentiles_output()
        input_data = {"cost_output": get_mock_cost_output()}
        
        result = await scorer.score("test-001", output, input_data)
        
        # Should score low due to invalid percentile order
        # Find the percentiles_valid criterion in breakdown
        percentiles_score = next(
            b["score"] for b in result["breakdown"] 
            if b["criterion"] == "percentiles_valid"
        )
        assert percentiles_score < 50
    
    @pytest.mark.asyncio
    async def test_check_contingency_reasonable(self, scorer):
        """Test contingency reasonableness check."""
        output = get_valid_risk_output()
        output["contingency"]["recommended"] = 50  # Too high
        
        criterion = {"name": "contingency_reasonable"}
        result = await scorer.evaluate_criterion(criterion, output, {})
        
        assert result["score"] < 80


class TestRiskCritic:
    """Test Risk Critic."""
    
    @pytest.fixture
    def critic(self):
        """Create critic with mock services."""
        return RiskCritic(
            firestore_service=MagicMock(),
            llm_service=MagicMock()
        )
    
    @pytest.mark.asyncio
    async def test_analyze_valid_output(self, critic):
        """Test critiquing valid output."""
        output = get_valid_risk_output()
        input_data = {"cost_output": get_mock_cost_output()}
        
        result = await critic.analyze_output(output, input_data, 90, "Good")
        
        assert "issues" in result
        assert "how_to_fix" in result
    
    @pytest.mark.asyncio
    async def test_analyze_invalid_percentiles(self, critic):
        """Test critiquing output with invalid percentiles."""
        output = get_invalid_percentiles_output()
        
        result = await critic.analyze_output(output, {}, 50, "Bad percentiles")
        
        # Should identify percentile issue
        assert any("percentile" in issue.lower() for issue in result["issues"])


# =============================================================================
# TIMELINE MODEL TESTS
# =============================================================================


class TestTimelineTask:
    """Test TimelineTask model."""
    
    def test_valid_task(self):
        """Test creating a valid timeline task."""
        task = TimelineTask(
            id="task-01",
            name="Permits & Planning",
            phase=PhaseType.PRECONSTRUCTION,
            duration_days=5,
            primary_trade="general"
        )
        assert task.id == "task-01"
        assert task.duration_days == 5
    
    def test_duration_range_defaults(self):
        """Test that duration range defaults are set."""
        task = TimelineTask(
            id="task-01",
            name="Test",
            phase=PhaseType.DEMOLITION,
            duration_days=10
        )
        # Should set optimistic (80%) and pessimistic (130%)
        assert task.duration_range_low == 8
        assert task.duration_range_high == 13


class TestProjectTimeline:
    """Test ProjectTimeline model."""
    
    def test_valid_timeline(self):
        """Test creating a valid project timeline."""
        start = datetime.now()
        timeline = ProjectTimeline(
            estimate_id="test-001",
            project_start_date=start.isoformat(),
            project_end_date=(start + timedelta(days=30)).isoformat(),
            tasks=[],
            milestones=[],
            critical_path=CriticalPath(path_task_ids=[], total_duration=30),
            total_duration_days=30,
            total_calendar_days=42,
            summary=TimelineSummary(
                headline="Test timeline",
                total_working_days=30,
                total_calendar_days=42,
                weeks=6.0
            )
        )
        assert timeline.total_duration_days == 30


# =============================================================================
# TIMELINE AGENT TESTS
# =============================================================================


class TestTimelineAgent:
    """Test Timeline Agent."""
    
    @pytest.fixture
    def mock_services(self):
        """Create mock services."""
        firestore = AsyncMock()
        llm = AsyncMock()
        return firestore, llm
    
    @pytest.mark.asyncio
    async def test_timeline_agent_run(self, mock_services):
        """Test Timeline Agent execution."""
        firestore, llm = mock_services
        llm.generate_json.return_value = {
            "content": {
                "tasks": [
                    {
                        "name": "Permits & Planning",
                        "phase": "preconstruction",
                        "duration_days": 5,
                        "primary_trade": "general",
                        "depends_on": [],
                    },
                    {
                        "name": "Demolition",
                        "phase": "demolition",
                        "duration_days": 2,
                        "primary_trade": "demolition",
                        "depends_on": ["Permits & Planning"],
                    },
                    {
                        "name": "Final Inspection",
                        "phase": "final_inspection",
                        "duration_days": 1,
                        "primary_trade": "general",
                        "depends_on": ["Demolition"],
                    },
                ]
            },
            "tokens_used": 50,
        }
        agent = TimelineAgent(
            firestore_service=firestore,
            llm_service=llm
        )
        
        input_data = {
            "clarification_output": get_mock_clarification_output(),
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output(),
            "cost_output": get_mock_cost_output()
        }
        
        result = await agent.run("test-001", input_data)
        
        # Check output structure
        assert "tasks" in result
        assert "milestones" in result
        assert "criticalPath" in result
        assert "totalDuration" in result
        
        # Check tasks generated
        assert len(result["tasks"]) > 0
        
        # Check Firestore was called
        firestore.save_agent_output.assert_called_once()


class TestTimelineScorer:
    """Test Timeline Scorer."""
    
    @pytest.fixture
    def scorer(self):
        """Create scorer."""
        return TimelineScorer(
            firestore_service=MagicMock(),
            llm_service=MagicMock()
        )
    
    @pytest.mark.asyncio
    async def test_score_valid_output(self, scorer):
        """Test scoring valid timeline output."""
        output = get_valid_timeline_output()
        input_data = {"scope_output": get_mock_scope_output()}
        
        result = await scorer.score("test-001", output, input_data)
        
        assert result["score"] >= 80
    
    @pytest.mark.asyncio
    async def test_score_invalid_output(self, scorer):
        """Test scoring invalid timeline output."""
        output = get_invalid_timeline_output()
        input_data = {"scope_output": get_mock_scope_output()}
        
        result = await scorer.score("test-001", output, input_data)
        
        assert result["score"] < 50


class TestTimelineCritic:
    """Test Timeline Critic."""
    
    @pytest.fixture
    def critic(self):
        """Create critic."""
        return TimelineCritic(
            firestore_service=MagicMock(),
            llm_service=MagicMock()
        )
    
    @pytest.mark.asyncio
    async def test_analyze_valid_output(self, critic):
        """Test critiquing valid output."""
        output = get_valid_timeline_output()
        
        result = await critic.analyze_output(output, {}, 90, "Good")
        
        assert "issues" in result
        assert "how_to_fix" in result
    
    @pytest.mark.asyncio
    async def test_analyze_invalid_output(self, critic):
        """Test critiquing invalid output."""
        output = get_invalid_timeline_output()
        
        result = await critic.analyze_output(output, {}, 30, "No tasks")
        
        # Should identify missing tasks
        assert any("task" in issue.lower() for issue in result["issues"])

    @pytest.mark.asyncio
    async def test_critic_does_not_use_fixed_duration_heuristics(self, critic):
        """TimelineCritic should not enforce arbitrary small/large remodel duration ranges."""
        output = get_valid_timeline_output()
        # Force a duration value that would have triggered the old heuristic when sqft is small
        output["totalDuration"] = 50
        output["durationRange"] = {"optimistic": 45, "expected": 50, "pessimistic": 65}

        input_data = {
            "clarification_output": {
                "projectBrief": {"scopeSummary": {"totalSqft": 50}}
            }
        }

        result = await critic.analyze_output(output, input_data, 90, "Good")

        combined = " ".join(result.get("issues", []) + result.get("how_to_fix", []))
        assert "seems long" not in combined.lower()
        assert "seems short" not in combined.lower()
        assert "20-30%" not in combined


# =============================================================================
# FINAL ESTIMATE MODEL TESTS
# =============================================================================


class TestFinalEstimate:
    """Test FinalEstimate model."""
    
    def test_valid_final_estimate(self):
        """Test creating a valid final estimate."""
        start = datetime.now()
        estimate = FinalEstimate(
            estimate_id="test-001",
            executive_summary=ExecutiveSummary(
                project_type="kitchen_remodel",
                project_location="Denver, CO",
                total_cost=35000,
                base_cost=32000,
                cost_per_sqft=180,
                confidence_range=ConfidenceRange(
                    p50=30000, p80=33000, p90=35000,
                    likely_range_low=30000, likely_range_high=35000
                ),
                duration_days=22,
                duration_weeks=4.4,
                start_date=start.isoformat(),
                end_date=(start + timedelta(days=30)).isoformat()
            ),
            cost_breakdown=CostBreakdownSummary(
                materials=15000, labor=8000, equipment=500,
                direct_costs_subtotal=23500,
                total_before_contingency=32000,
                total_with_contingency=35000
            ),
            timeline_summary=TimelineSummaryForEstimate(
                total_duration_days=22, total_weeks=4.4,
                start_date=start.isoformat(),
                end_date=(start + timedelta(days=30)).isoformat()
            ),
            risk_summary=RiskSummaryForEstimate(
                risk_level="Medium",
                top_risks=["Material costs"],
                contingency_rationale="P80 confidence"
            ),
            summary_headline="Kitchen remodel: $35,000 over 4 weeks"
        )
        assert estimate.executive_summary.total_cost == 35000


# =============================================================================
# FINAL AGENT TESTS
# =============================================================================


class TestFinalAgent:
    """Test Final Agent."""
    
    @pytest.fixture
    def mock_services(self):
        """Create mock services."""
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        firestore.update_estimate = AsyncMock()
        firestore.list_cost_items = AsyncMock(return_value=[])
        llm = AsyncMock()
        llm.generate_json.return_value = {
            "content": {
                "recommendations": [
                    {"category": "cost", "title": "Test", "description": "Test rec", "priority": "high"}
                ],
                "key_assumptions": ["Test assumption"],
                "exclusions": ["Test exclusion"]
            },
            "tokens_used": 100
        }
        return firestore, llm
    
    @pytest.mark.asyncio
    async def test_final_agent_run(self, mock_services):
        """Test Final Agent execution."""
        firestore, llm = mock_services
        agent = FinalAgent(
            firestore_service=firestore,
            llm_service=llm
        )
        
        input_data = {
            "clarification_output": get_mock_clarification_output(),
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output(),
            "cost_output": get_mock_cost_output(),
            "risk_output": get_valid_risk_output(),
            "timeline_output": get_valid_timeline_output()
        }
        
        result = await agent.run("test-001", input_data)
        
        # Check output structure
        assert "executiveSummary" in result
        assert "costBreakdown" in result
        assert "timeline" in result
        assert "riskSummary" in result
        assert "recommendations" in result
        
        # Check estimate is marked complete
        assert result.get("estimateComplete") == True
        
        # Check Firestore was called
        firestore.save_agent_output.assert_called_once()


class TestFinalScorer:
    """Test Final Scorer."""
    
    @pytest.fixture
    def scorer(self):
        """Create scorer."""
        return FinalScorer(
            firestore_service=MagicMock(),
            llm_service=MagicMock()
        )
    
    @pytest.mark.asyncio
    async def test_score_valid_output(self, scorer):
        """Test scoring valid final output."""
        output = get_valid_final_output()
        input_data = {}
        
        result = await scorer.score("test-001", output, input_data)
        
        assert result["score"] >= 80
    
    @pytest.mark.asyncio
    async def test_score_incomplete_output(self, scorer):
        """Test scoring incomplete final output."""
        output = get_incomplete_final_output()
        input_data = {}
        
        result = await scorer.score("test-001", output, input_data)
        
        assert result["score"] < 60


class TestFinalCritic:
    """Test Final Critic."""
    
    @pytest.fixture
    def critic(self):
        """Create critic."""
        return FinalCritic(
            firestore_service=MagicMock(),
            llm_service=MagicMock()
        )
    
    @pytest.mark.asyncio
    async def test_analyze_valid_output(self, critic):
        """Test critiquing valid output."""
        output = get_valid_final_output()
        
        result = await critic.analyze_output(output, {}, 90, "Good")
        
        assert "issues" in result
    
    @pytest.mark.asyncio
    async def test_analyze_incomplete_output(self, critic):
        """Test critiquing incomplete output."""
        output = get_incomplete_final_output()
        
        result = await critic.analyze_output(output, {}, 40, "Incomplete")
        
        # Should identify missing sections
        assert len(result["issues"]) > 0


# =============================================================================
# INTEGRATION TESTS
# =============================================================================


class TestPR7Integration:
    """Integration tests for Risk → Timeline → Final flow."""
    
    @pytest.fixture
    def mock_services(self, mock_deep_agent_generate_json):
        """Create mock services for all agents."""
        firestore = AsyncMock()
        firestore.save_agent_output = AsyncMock()
        firestore.update_estimate = AsyncMock()
        firestore.list_cost_items = AsyncMock(return_value=[])
        llm = AsyncMock()
        async def _generate_json_side_effect(system_prompt: str, user_message: str, max_tokens=None):
            # Timeline agent task-plan request (no hardcoded templates)
            if "TIMELINE_TASK_PLAN_REQUEST" in (user_message or ""):
                return {
                    "content": {
                        "tasks": [
                            {
                                "name": "Permits & Planning",
                                "phase": "preconstruction",
                                "duration_days": 5,
                                "primary_trade": "general",
                                "depends_on": [],
                            },
                            {
                                "name": "Demolition",
                                "phase": "demolition",
                                "duration_days": 2,
                                "primary_trade": "demolition",
                                "depends_on": ["Permits & Planning"],
                            },
                            {
                                "name": "Rough-In",
                                "phase": "rough_in",
                                "duration_days": 5,
                                "primary_trade": "general",
                                "depends_on": ["Demolition"],
                            },
                            {
                                "name": "Final Inspection",
                                "phase": "final_inspection",
                                "duration_days": 1,
                                "primary_trade": "general",
                                "depends_on": ["Rough-In"],
                            },
                        ]
                    },
                    "tokens_used": 50,
                }

            # Default: risk/final analysis requests
            return {
                "content": {
                    "recommendations": [],
                    "key_assumptions": [],
                    "exclusions": []
                },
                "tokens_used": 50
            }

        async def _deep_side_effect(**kwargs):  # noqa: ANN001
            return await _generate_json_side_effect(
                kwargs.get("system_prompt"),
                kwargs.get("user_message"),
                kwargs.get("max_tokens"),
            )

        mock_deep_agent_generate_json.side_effect = _deep_side_effect
        return firestore, llm
    
    @pytest.mark.asyncio
    async def test_risk_to_timeline_to_final_flow(self, mock_services, monkeypatch):
        """Test full agent flow from Risk → Timeline → Final."""
        # Keep unit test fast regardless of production default iterations.
        monkeypatch.setattr(settings, "monte_carlo_iterations", 1000)
        firestore, llm = mock_services
        
        # Prepare input data
        input_data = {
            "clarification_output": get_mock_clarification_output(),
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output(),
            "cost_output": get_mock_cost_output()
        }
        
        # Run Risk Agent
        risk_agent = RiskAgent(firestore_service=firestore, llm_service=llm)
        risk_output = await risk_agent.run("test-001", input_data)
        
        assert risk_output["monteCarlo"]["p50"] > 0
        assert risk_output["contingency"]["recommended"] > 0
        
        # Run Timeline Agent
        timeline_agent = TimelineAgent(firestore_service=firestore, llm_service=llm)
        timeline_output = await timeline_agent.run("test-001", input_data)
        
        assert len(timeline_output["tasks"]) > 0
        assert timeline_output["totalDuration"] > 0
        
        # Run Final Agent with all outputs
        final_input = {
            **input_data,
            "risk_output": risk_output,
            "timeline_output": timeline_output
        }
        
        final_agent = FinalAgent(firestore_service=firestore, llm_service=llm)
        final_output = await final_agent.run("test-001", final_input)
        
        assert final_output["estimateComplete"] == True
        assert final_output["executiveSummary"]["totalCost"] > 0
        assert "recommendations" in final_output
        
        # Verify Firestore called for each agent
        assert firestore.save_agent_output.call_count == 3

    @pytest.mark.asyncio
    async def test_final_agent_integration_payload(self, mock_services):
        """Ensure FinalAgent writes spec-aligned root fields."""
        firestore, llm = mock_services
        llm.generate_json.return_value = {"content": {}, "tokens_used": 10}

        final_agent = FinalAgent(firestore_service=firestore, llm_service=llm)
        final_input = {
            "clarification_output": get_mock_clarification_output(),
            "location_output": get_mock_location_output(),
            "scope_output": get_mock_scope_output(),
            "cost_output": get_mock_cost_output(),
            "risk_output": get_valid_risk_output(),
            "timeline_output": get_valid_timeline_output(),
        }

        await final_agent.run("est-123", final_input)

        # ensure integration payload update executed
        assert firestore.update_estimate.await_count >= 1
        _, payload = firestore.update_estimate.await_args.args
        for key in [
            "projectName", "address", "projectType",
            "totalCost", "p50", "p80", "p90",
            "contingencyPct", "timelineWeeks", "risk_analysis",
            "cost_breakdown", "bill_of_quantities"
        ]:
            assert key in payload

        # laborAnalysis should include trades when possible
        labor = payload["laborAnalysis"]
        assert "trades" in labor
        # risk_analysis should carry histogram/top_risks when present
        ra = payload["risk_analysis"]
        assert "histogram" in ra
    
    @pytest.mark.asyncio
    async def test_scorer_critic_integration(self, mock_services):
        """Test scorer and critic flow for all agents."""
        firestore, llm = mock_services
        
        # Test Risk scorer → critic
        risk_scorer = RiskScorer(firestore_service=firestore, llm_service=llm)
        risk_output = get_valid_risk_output()
        
        risk_score = await risk_scorer.score("test-001", risk_output, {})
        assert risk_score["score"] >= 80
        
        # Test Timeline scorer → critic
        timeline_scorer = TimelineScorer(firestore_service=firestore, llm_service=llm)
        timeline_output = get_valid_timeline_output()
        
        timeline_score = await timeline_scorer.score("test-001", timeline_output, {})
        assert timeline_score["score"] >= 70
        
        # Test Final scorer → critic
        final_scorer = FinalScorer(firestore_service=firestore, llm_service=llm)
        final_output = get_valid_final_output()
        
        final_score = await final_scorer.score("test-001", final_output, {})
        assert final_score["score"] >= 80

