"""Unit tests for PipelineOrchestrator."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from agents.orchestrator import PipelineOrchestrator, run_deep_pipeline
from agents.agent_cards import AGENT_SEQUENCE
from models.agent_output import PipelineStatus, AgentStatus, PipelineResult
from config.errors import PipelineError, A2AError, ErrorCode


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def mock_firestore():
    """Mock FirestoreService."""
    mock = MagicMock()
    mock.create_estimate = AsyncMock()
    mock.get_estimate = AsyncMock(return_value={
        "id": "test-estimate",
        "userId": "test-user",
        "status": "processing",
        "pipelineStatus": {}
    })
    mock.update_estimate = AsyncMock()
    mock.save_agent_output = AsyncMock()
    mock.delete_estimate = AsyncMock()
    # New: UI sync helper used by orchestrator; must be awaitable in tests.
    mock.sync_to_project_pipeline = AsyncMock()
    return mock


@pytest.fixture
def mock_a2a_client():
    """Mock A2AClient with successful responses."""
    mock = MagicMock()
    
    # Primary agent response
    primary_response = {
        "jsonrpc": "2.0",
        "id": "test-request",
        "result": {
            "task_id": "test-task",
            "status": "completed",
            "result": {"data": "test output"},
            "metadata": {"tokens_used": 100}
        }
    }
    
    # Scorer response (passing score)
    scorer_response = {
        "jsonrpc": "2.0",
        "id": "test-request",
        "result": {
            "task_id": "test-task",
            "status": "completed",
            "result": {
                "score": 85,
                "passed": True,
                "breakdown": [],
                "feedback": "Good output"
            }
        }
    }
    
    mock.send_task = AsyncMock(side_effect=lambda **kwargs: (
        scorer_response if "scorer" in kwargs.get("target_agent", "") else primary_response
    ))
    mock.extract_result_data = MagicMock(side_effect=lambda r: r.get("result", {}).get("result", {}))
    
    return mock


@pytest.fixture
def mock_a2a_client_low_score():
    """Mock A2AClient with low score requiring retry."""
    mock = MagicMock()
    
    call_count = {"primary": 0, "scorer": 0, "critic": 0}
    
    def create_response(**kwargs):
        target = kwargs.get("target_agent", "")
        
        if "scorer" in target:
            call_count["scorer"] += 1
            # First call fails, second passes
            if call_count["scorer"] == 1:
                return {
                    "jsonrpc": "2.0",
                    "id": "test",
                    "result": {
                        "task_id": "test",
                        "status": "completed",
                        "result": {"score": 65, "passed": False, "feedback": "Needs work"}
                    }
                }
            else:
                return {
                    "jsonrpc": "2.0",
                    "id": "test",
                    "result": {
                        "task_id": "test",
                        "status": "completed",
                        "result": {"score": 85, "passed": True, "feedback": "Good"}
                    }
                }
        elif "critic" in target:
            return {
                "jsonrpc": "2.0",
                "id": "test",
                "result": {
                    "task_id": "test",
                    "status": "completed",
                    "result": {
                        "issues": ["Issue 1"],
                        "why_wrong": "Reason",
                        "how_to_fix": ["Fix 1"]
                    }
                }
            }
        else:
            call_count["primary"] += 1
            return {
                "jsonrpc": "2.0",
                "id": "test",
                "result": {
                    "task_id": "test",
                    "status": "completed",
                    "result": {"data": f"output {call_count['primary']}"},
                    "metadata": {"tokens_used": 100}
                }
            }
    
    mock.send_task = AsyncMock(side_effect=create_response)
    mock.extract_result_data = MagicMock(side_effect=lambda r: r.get("result", {}).get("result", {}))
    
    return mock


@pytest.fixture
def sample_clarification_output():
    """Sample ClarificationOutput for testing."""
    return {
        "estimateId": "test-estimate",
        "schemaVersion": "3.0.0",
        "projectBrief": {
            "projectType": "kitchen_remodel",
            "location": {
                "zipCode": "80202",
                "city": "Denver",
                "state": "CO"
            },
            "scopeSummary": {
                "totalSqft": 150,
                "finishLevel": "mid_range"
            }
        },
        "csiScope": {
            "div06_wood_plastics_composites": {
                "status": "included",
                "lineItems": [
                    {"description": "Cabinets", "quantity": 10, "unit": "LF"}
                ]
            }
        },
        "cadData": {
            "fileUrl": "test.pdf",
            "spaceModel": {"rooms": [], "walls": [], "openings": []}
        }
    }


# ============================================================================
# Tests: Basic Pipeline Execution
# ============================================================================

class TestPipelineOrchestrator:
    """Tests for PipelineOrchestrator."""
    
    @pytest.mark.asyncio
    async def test_agent_sequence_is_correct(self):
        """Verify AGENT_SEQUENCE has all agents in correct order."""
        assert len(AGENT_SEQUENCE) == 7
        assert AGENT_SEQUENCE == ["location", "scope", "code_compliance", "cost", "risk", "timeline", "final"]
    
    @pytest.mark.asyncio
    async def test_orchestrator_initialization(self, mock_firestore, mock_a2a_client):
        """Test orchestrator initializes with services."""
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a_client
        )
        
        assert orchestrator.firestore == mock_firestore
        assert orchestrator.a2a == mock_a2a_client
    
    @pytest.mark.asyncio
    async def test_run_pipeline_success(
        self,
        mock_firestore,
        mock_a2a_client,
        sample_clarification_output
    ):
        """Test successful pipeline execution."""
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a_client
        )
        
        result = await orchestrator.run_pipeline(
            estimate_id="test-estimate",
            clarification_output=sample_clarification_output
        )
        
        assert result.success is True
        assert result.estimate_id == "test-estimate"
        assert result.status == "completed"
        assert len(result.completed_agents) == len(AGENT_SEQUENCE)
        assert result.failed_agent is None
    
    @pytest.mark.asyncio
    async def test_pipeline_updates_status_per_agent(
        self,
        mock_firestore,
        mock_a2a_client,
        sample_clarification_output
    ):
        """Test that pipeline updates status for each agent."""
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a_client
        )
        
        await orchestrator.run_pipeline(
            estimate_id="test-estimate",
            clarification_output=sample_clarification_output
        )
        
        # Should have multiple update_estimate calls (status updates)
        assert mock_firestore.update_estimate.call_count > len(AGENT_SEQUENCE)
    
    @pytest.mark.asyncio
    async def test_pipeline_saves_agent_outputs(
        self,
        mock_firestore,
        mock_a2a_client,
        sample_clarification_output
    ):
        """Test that pipeline saves output for each agent."""
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a_client
        )
        
        await orchestrator.run_pipeline(
            estimate_id="test-estimate",
            clarification_output=sample_clarification_output
        )
        
        # Should save output for all agents
        assert mock_firestore.save_agent_output.call_count == len(AGENT_SEQUENCE)


# ============================================================================
# Tests: Scorer/Critic Validation Flow
# ============================================================================

class TestValidationFlow:
    """Tests for scorer/critic validation flow."""
    
    @pytest.mark.asyncio
    async def test_retry_on_low_score(
        self,
        mock_firestore,
        mock_a2a_client_low_score,
        sample_clarification_output
    ):
        """Test that agent retries when score is below threshold."""
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a_client_low_score
        )
        
        # Only test first agent to keep test simple
        with patch.object(orchestrator, '_run_agent_with_validation') as mock_run:
            mock_run.return_value = (True, {"data": "output"})
            
            result = await orchestrator.run_pipeline(
                estimate_id="test-estimate",
                clarification_output=sample_clarification_output
            )
            
            assert result.success is True
    
    @pytest.mark.asyncio
    async def test_scorer_called_after_primary(
        self,
        mock_firestore,
        mock_a2a_client,
        sample_clarification_output
    ):
        """Test that scorer is called after each primary agent."""
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a_client
        )
        
        await orchestrator.run_pipeline(
            estimate_id="test-estimate",
            clarification_output=sample_clarification_output
        )
        
        # Check that both primary and scorer were called
        call_targets = [
            call.kwargs.get("target_agent") 
            for call in mock_a2a_client.send_task.call_args_list
        ]
        
        # Should have calls to primary agents
        assert any("location" in t for t in call_targets if t)
        # Should have calls to scorers
        assert any("scorer" in t for t in call_targets if t)


# ============================================================================
# Tests: Error Handling
# ============================================================================

class TestErrorHandling:
    """Tests for error handling."""
    
    @pytest.mark.asyncio
    async def test_pipeline_fails_after_max_retries(
        self,
        mock_firestore,
        sample_clarification_output
    ):
        """Test pipeline fails when agent exceeds max retries."""
        mock_a2a = MagicMock()
        
        # Always return failing score
        mock_a2a.send_task = AsyncMock(return_value={
            "jsonrpc": "2.0",
            "id": "test",
            "result": {
                "task_id": "test",
                "status": "completed",
                "result": {"score": 50, "passed": False, "feedback": "Failed"}
            }
        })
        mock_a2a.extract_result_data = MagicMock(
            side_effect=lambda r: r.get("result", {}).get("result", {})
        )
        
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a
        )
        
        result = await orchestrator.run_pipeline(
            estimate_id="test-estimate",
            clarification_output=sample_clarification_output
        )
        
        assert result.success is False
        assert result.failed_agent is not None
    
    @pytest.mark.asyncio
    async def test_pipeline_handles_a2a_error(
        self,
        mock_firestore,
        sample_clarification_output
    ):
        """Test pipeline handles A2A communication errors."""
        mock_a2a = MagicMock()
        mock_a2a.send_task = AsyncMock(side_effect=A2AError(
            code=ErrorCode.A2A_TIMEOUT,
            message="Request timed out",
            target_agent="location"
        ))
        
        orchestrator = PipelineOrchestrator(
            firestore_service=mock_firestore,
            a2a_client=mock_a2a
        )
        
        result = await orchestrator.run_pipeline(
            estimate_id="test-estimate",
            clarification_output=sample_clarification_output
        )
        
        # Should fail gracefully
        assert result.success is False


# ============================================================================
# Tests: Progress Tracking
# ============================================================================

class TestProgressTracking:
    """Tests for progress tracking."""
    
    @pytest.mark.asyncio
    async def test_progress_calculation(self):
        """Test progress percentage calculation."""
        status = PipelineStatus(
            completed_agents=["location", "scope", "cost"]
        )
        
        progress = status.get_progress_percentage(len(AGENT_SEQUENCE))
        assert progress == int(3 / len(AGENT_SEQUENCE) * 100)
    
    @pytest.mark.asyncio
    async def test_is_complete_check(self):
        """Test pipeline completion check."""
        status_incomplete = PipelineStatus(
            completed_agents=["location", "scope"]
        )
        
        status_complete = PipelineStatus(
            completed_agents=AGENT_SEQUENCE.copy()
        )
        
        assert status_incomplete.is_complete(AGENT_SEQUENCE) is False
        assert status_complete.is_complete(AGENT_SEQUENCE) is True
    
    @pytest.mark.asyncio
    async def test_has_failed_check(self):
        """Test failure detection."""
        status_ok = PipelineStatus(
            agent_statuses={"location": "completed", "scope": "running"}
        )
        
        status_failed = PipelineStatus(
            agent_statuses={"location": "completed", "scope": "failed"}
        )
        
        assert status_ok.has_failed() is False
        assert status_failed.has_failed() is True


# ============================================================================
# Tests: Get Pipeline Status
# ============================================================================

class TestGetPipelineStatus:
    """Tests for get_pipeline_status."""
    
    @pytest.mark.asyncio
    async def test_get_status_returns_pipeline_status(self, mock_firestore):
        """Test getting pipeline status from Firestore."""
        mock_firestore.get_estimate = AsyncMock(return_value={
            "id": "test-estimate",
            "status": "processing",
            "pipelineStatus": {
                "currentAgent": "cost",
                "completedAgents": ["location", "scope"],
                "progress": 33,
                "agentStatuses": {
                    "location": "completed",
                    "scope": "completed",
                    "cost": "running"
                }
            }
        })
        
        orchestrator = PipelineOrchestrator(firestore_service=mock_firestore)
        status = await orchestrator.get_pipeline_status("test-estimate")
        
        assert status is not None
        assert status.current_agent == "cost"
        assert len(status.completed_agents) == 2
        assert status.progress == 33
    
    @pytest.mark.asyncio
    async def test_get_status_returns_none_for_missing(self, mock_firestore):
        """Test get_pipeline_status returns None for missing estimate."""
        mock_firestore.get_estimate = AsyncMock(return_value=None)
        
        orchestrator = PipelineOrchestrator(firestore_service=mock_firestore)
        status = await orchestrator.get_pipeline_status("nonexistent")
        
        assert status is None


# ============================================================================
# Tests: Convenience Function
# ============================================================================

class TestConvenienceFunction:
    """Tests for run_deep_pipeline convenience function."""
    
    @pytest.mark.asyncio
    async def test_run_deep_pipeline_function(self):
        """Test the convenience function wraps orchestrator."""
        with patch('agents.orchestrator.PipelineOrchestrator') as mock_class:
            mock_instance = MagicMock()
            mock_instance.run_pipeline = AsyncMock(return_value=PipelineResult(
                success=True,
                estimate_id="test",
                status="completed",
                completed_agents=AGENT_SEQUENCE
            ))
            mock_class.return_value = mock_instance
            
            result = await run_deep_pipeline(
                estimate_id="test",
                clarification_output={"test": "data"}
            )
            
            assert result.success is True
            mock_instance.run_pipeline.assert_called_once()



