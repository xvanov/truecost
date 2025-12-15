"""Unit tests for LLM service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestLLMService:
    """Tests for LLMService."""
    
    def test_initialization(self):
        """Test LLMService initialization."""
        with patch('services.llm_service.ChatOpenAI'):
            from services.llm_service import LLMService
            
            service = LLMService(
                model="gpt-4-turbo",
                temperature=0.2,
                api_key="test-key"
            )
            
            assert service.model == "gpt-4-turbo"
            assert service.temperature == 0.2
            assert service.api_key == "test-key"
    
    def test_default_initialization(self, mock_settings):
        """Test LLMService uses settings defaults."""
        with patch('services.llm_service.ChatOpenAI'):
            from services.llm_service import LLMService
            
            service = LLMService()
            
            # Should use mock_settings values
            assert service.model == "gpt-4o"
    
    @pytest.mark.asyncio
    async def test_generate(self, mock_llm_service):
        """Test generate method."""
        from langchain_core.messages import HumanMessage
        
        messages = [HumanMessage(content="Hello")]
        
        result = await mock_llm_service.generate(messages)
        
        assert "content" in result
        assert "tokens_used" in result
    
    @pytest.mark.asyncio
    async def test_generate_with_system_prompt(self, mock_llm_service):
        """Test generate_with_system_prompt method."""
        result = await mock_llm_service.generate_with_system_prompt(
            system_prompt="You are a helpful assistant.",
            user_message="What is 2+2?"
        )
        
        assert "content" in result
        assert "tokens_used" in result
    
    @pytest.mark.asyncio
    async def test_generate_json(self, mock_llm_service):
        """Test generate_json method."""
        # Mock the response to return valid JSON
        mock_llm_service._client.ainvoke.return_value = MagicMock(
            content='{"result": "success", "value": 42}',
            response_metadata={"token_usage": {"total_tokens": 50}}
        )
        
        result = await mock_llm_service.generate_json(
            system_prompt="Return JSON.",
            user_message="Give me a number."
        )
        
        assert "content" in result
        assert isinstance(result["content"], dict)
        assert result["content"]["result"] == "success"
    
    @pytest.mark.asyncio
    async def test_generate_json_handles_markdown(self, mock_llm_service):
        """Test generate_json handles markdown code blocks."""
        mock_llm_service._client.ainvoke.return_value = MagicMock(
            content='```json\n{"result": "success"}\n```',
            response_metadata={"token_usage": {"total_tokens": 50}}
        )
        
        result = await mock_llm_service.generate_json(
            system_prompt="Return JSON.",
            user_message="Give me JSON."
        )
        
        assert result["content"]["result"] == "success"
    
    @pytest.mark.asyncio
    async def test_generate_json_invalid_response(self, mock_llm_service):
        """Test generate_json handles invalid JSON."""
        from config.errors import TrueCostError
        
        mock_llm_service._client.ainvoke.return_value = MagicMock(
            content='This is not valid JSON',
            response_metadata={"token_usage": {"total_tokens": 50}}
        )
        
        with pytest.raises(TrueCostError) as exc_info:
            await mock_llm_service.generate_json(
                system_prompt="Return JSON.",
                user_message="Give me JSON."
            )
        
        assert exc_info.value.code == "LLM_ERROR"
    
    def test_create_chat_model(self, mock_llm_service):
        """Test creating a new chat model."""
        with patch('services.llm_service.ChatOpenAI') as mock_chat:
            mock_chat.return_value = MagicMock()
            
            model = mock_llm_service.create_chat_model(
                model="gpt-4-turbo",
                temperature=0.5
            )
            
            mock_chat.assert_called_once_with(
                model="gpt-4-turbo",
                temperature=0.5,
                api_key=mock_llm_service.api_key
            )
    
    def test_token_tracking(self, mock_llm_service):
        """Test token usage tracking."""
        assert mock_llm_service.total_tokens_used == 0




