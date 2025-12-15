"""Unit tests for base agent classes."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestBaseA2AAgent:
    """Tests for BaseA2AAgent."""
    
    @pytest.mark.asyncio
    async def test_handle_message_send(self, mock_base_agent, sample_a2a_request):
        """Test handling message/send request."""
        result = await mock_base_agent.handle_a2a_request(sample_a2a_request)
        
        assert result["jsonrpc"] == "2.0"
        assert result["id"] == "req-test-001"
        assert result["result"]["status"] == "completed"
        assert "task_id" in result["result"]
    
    @pytest.mark.asyncio
    async def test_handle_unknown_method(self, mock_base_agent):
        """Test handling unknown method."""
        request = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "method": "unknown/method",
            "params": {}
        }
        
        result = await mock_base_agent.handle_a2a_request(request)
        
        assert "error" in result
        assert result["error"]["code"] == -32601
    
    @pytest.mark.asyncio
    async def test_handle_agent_card_request(self, mock_base_agent):
        """Test handling agent/card request."""
        request = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "method": "agent/card",
            "params": {}
        }
        
        result = await mock_base_agent.handle_a2a_request(request)
        
        assert "result" in result
        # Agent card should have name
        assert "name" in result["result"]
    
    @pytest.mark.asyncio
    async def test_handle_missing_estimate_id(self, mock_base_agent):
        """Test handling request without estimate_id."""
        request = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"type": "data", "data": {"input": {}}}]
                }
            }
        }
        
        result = await mock_base_agent.handle_a2a_request(request)
        
        assert "error" in result
        assert result["error"]["code"] == -32602
    
    @pytest.mark.asyncio
    async def test_handle_agent_error(self, mock_base_agent, sample_a2a_request):
        """Test handling agent run error."""
        # Make run() raise an error
        async def failing_run(*args, **kwargs):
            raise Exception("Agent processing failed")
        
        mock_base_agent.run = failing_run
        
        result = await mock_base_agent.handle_a2a_request(sample_a2a_request)
        
        assert result["result"]["status"] == "failed"
        assert "error" in result["result"]
    
    @pytest.mark.asyncio
    async def test_run_with_critic_feedback(self, mock_firestore_service, mock_llm_service):
        """Test agent run with critic feedback."""
        from agents.base_agent import BaseA2AAgent
        
        class TestAgentWithFeedback(BaseA2AAgent):
            async def run(self, estimate_id, input_data, feedback=None):
                return {
                    "estimate_id": estimate_id,
                    "had_feedback": feedback is not None,
                    "feedback": feedback
                }
        
        agent = TestAgentWithFeedback(
            name="test",
            firestore_service=mock_firestore_service,
            llm_service=mock_llm_service
        )
        
        request = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{
                        "type": "data",
                        "data": {
                            "estimate_id": "est-123",
                            "input": {"key": "value"},
                            "critic_feedback": {
                                "score": 65,
                                "issues": ["Issue 1"],
                                "how_to_fix": ["Fix 1"]
                            },
                            "retry_attempt": 1
                        }
                    }]
                }
            }
        }
        
        result = await agent.handle_a2a_request(request)
        
        assert result["result"]["status"] == "completed"
        assert result["result"]["result"]["had_feedback"] is True
    
    def test_build_system_prompt_without_feedback(self, mock_base_agent):
        """Test building system prompt without feedback."""
        base_prompt = "You are a helpful agent."
        
        result = mock_base_agent.build_system_prompt(base_prompt)
        
        assert result == base_prompt
    
    def test_build_system_prompt_with_feedback(self, mock_base_agent):
        """Test building system prompt with critic feedback."""
        base_prompt = "You are a helpful agent."
        feedback = {
            "score": 65,
            "issues": ["Missing data", "Incorrect format"],
            "why_wrong": "The output was incomplete",
            "how_to_fix": ["Add missing fields", "Fix format"]
        }
        
        result = mock_base_agent.build_system_prompt(base_prompt, feedback)
        
        assert base_prompt in result
        assert "Previous Attempt Feedback" in result
        assert "65" in result
        assert "Missing data" in result
        assert "Add missing fields" in result
    
    def test_token_tracking(self, mock_base_agent):
        """Test token usage tracking."""
        assert mock_base_agent.tokens_used == 0
    
    def test_duration_tracking(self, mock_base_agent):
        """Test duration tracking."""
        assert mock_base_agent.duration_ms == 0


class TestBaseScorer:
    """Tests for BaseScorer."""
    
    @pytest.mark.asyncio
    async def test_handle_scoring_request(self, mock_base_scorer):
        """Test handling scoring request."""
        request = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{
                        "type": "data",
                        "data": {
                            "estimate_id": "est-123",
                            "agent_name": "location",
                            "output": {"laborRates": {}},
                            "input": {}
                        }
                    }]
                }
            }
        }
        
        result = await mock_base_scorer.handle_a2a_request(request)
        
        assert result["result"]["status"] == "completed"
        assert "score" in result["result"]["result"]
    
    @pytest.mark.asyncio
    async def test_score_calculation(self, mock_base_scorer):
        """Test score calculation."""
        result = await mock_base_scorer.score(
            estimate_id="est-123",
            output={"data": "value"},
            input_data={}
        )
        
        assert "score" in result
        assert "breakdown" in result
        assert "feedback" in result
        assert "passed" in result
        assert 0 <= result["score"] <= 100
    
    @pytest.mark.asyncio
    async def test_score_passes_threshold(self, mock_base_scorer):
        """Test score passing threshold check."""
        result = await mock_base_scorer.score(
            estimate_id="est-123",
            output={},
            input_data={}
        )
        
        # Mock scorer returns 85 for all criteria
        assert result["score"] == 85
        assert result["passed"] is True
    
    def test_scoring_criteria(self, mock_base_scorer):
        """Test getting scoring criteria."""
        criteria = mock_base_scorer.get_scoring_criteria()
        
        assert len(criteria) == 2
        assert criteria[0]["name"] == "completeness"
        assert criteria[1]["name"] == "accuracy"


class TestBaseCritic:
    """Tests for BaseCritic."""
    
    @pytest.mark.asyncio
    async def test_handle_critique_request(self, mock_base_critic):
        """Test handling critique request."""
        request = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{
                        "type": "data",
                        "data": {
                            "estimate_id": "est-123",
                            "agent_name": "location",
                            "output": {"laborRates": {}},
                            "input": {},
                            "score": 65,
                            "scorer_feedback": "Below threshold"
                        }
                    }]
                }
            }
        }
        
        result = await mock_base_critic.handle_a2a_request(request)
        
        assert result["result"]["status"] == "completed"
        assert "issues" in result["result"]["result"]
    
    @pytest.mark.asyncio
    async def test_critique_output(self, mock_base_critic):
        """Test critique output structure."""
        # Mock LLM to return valid JSON
        mock_base_critic.llm.generate_json = AsyncMock(return_value={
            "content": {
                "issues": ["LLM found issue"],
                "why_wrong": "LLM explanation",
                "how_to_fix": ["LLM fix suggestion"],
                "suggestions": [],
                "priority": "high"
            },
            "tokens_used": 100
        })
        
        result = await mock_base_critic.critique(
            estimate_id="est-123",
            output={},
            input_data={},
            score=65,
            scorer_feedback="Low score"
        )
        
        assert "issues" in result
        assert "why_wrong" in result
        assert "how_to_fix" in result
        assert result["score"] == 65
    
    @pytest.mark.asyncio
    async def test_critique_fallback(self, mock_base_critic):
        """Test critique falls back to analysis on LLM error."""
        mock_base_critic.llm.generate_json = AsyncMock(
            side_effect=Exception("LLM error")
        )
        
        result = await mock_base_critic.critique(
            estimate_id="est-123",
            output={},
            input_data={},
            score=65,
            scorer_feedback="Low score"
        )
        
        # Should fall back to analyze_output results
        assert "issues" in result
        assert "Test issue" in result["issues"]
    
    def test_get_base_critique_prompt(self, mock_base_critic):
        """Test base critique prompt generation."""
        prompt = mock_base_critic.get_base_critique_prompt()
        
        assert "test_agent" in prompt
        assert "JSON" in prompt
        assert "issues" in prompt




