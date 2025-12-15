"""Unit tests for A2A client."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx


class TestA2AClient:
    """Tests for A2AClient."""
    
    def test_initialization(self):
        """Test A2AClient initialization."""
        from services.a2a_client import A2AClient
        
        client = A2AClient(
            base_url="http://localhost:5001",
            timeout=600
        )
        
        assert client.base_url == "http://localhost:5001"
        assert client.timeout == 600
    
    def test_default_initialization(self, mock_settings):
        """Test A2AClient uses settings defaults."""
        from services.a2a_client import A2AClient
        
        client = A2AClient()
        
        assert client.base_url == "http://localhost:5001"
        assert client.timeout == 300
    
    def test_build_a2a_request(self):
        """Test building A2A JSON-RPC request."""
        from services.a2a_client import A2AClient
        
        client = A2AClient()
        
        request = client._build_a2a_request(
            method="message/send",
            params={"key": "value"},
            request_id="test-id"
        )
        
        assert request["jsonrpc"] == "2.0"
        assert request["id"] == "test-id"
        assert request["method"] == "message/send"
        assert request["params"]["key"] == "value"
    
    @pytest.mark.asyncio
    async def test_send_task_success(self, mock_a2a_success_response):
        """Test successful task send."""
        from services.a2a_client import A2AClient
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = mock_a2a_success_response
            mock_response.raise_for_status = MagicMock()
            
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            
            client = A2AClient(base_url="http://localhost:5001")
            
            result = await client.send_task(
                target_agent="location",
                message={"estimate_id": "est-123"},
                thread_id="est-123"
            )
            
            assert result["result"]["status"] == "completed"
    
    @pytest.mark.asyncio
    async def test_send_task_timeout(self):
        """Test task send timeout handling."""
        from services.a2a_client import A2AClient
        from config.errors import A2AError
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=httpx.TimeoutException("Timeout")
            )
            
            client = A2AClient(base_url="http://localhost:5001", timeout=10)
            
            with pytest.raises(A2AError) as exc_info:
                await client.send_task(
                    target_agent="location",
                    message={"estimate_id": "est-123"}
                )
            
            assert exc_info.value.code == "A2A_TIMEOUT"
    
    @pytest.mark.asyncio
    async def test_send_task_connection_error(self):
        """Test task send connection error handling."""
        from services.a2a_client import A2AClient
        from config.errors import A2AError
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            
            client = A2AClient(base_url="http://localhost:5001")
            
            with pytest.raises(A2AError) as exc_info:
                await client.send_task(
                    target_agent="location",
                    message={"estimate_id": "est-123"}
                )
            
            assert exc_info.value.code == "A2A_CONNECTION_ERROR"
    
    @pytest.mark.asyncio
    async def test_get_task_status(self, mock_a2a_success_response):
        """Test getting task status."""
        from services.a2a_client import A2AClient
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = mock_a2a_success_response
            mock_response.raise_for_status = MagicMock()
            
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            
            client = A2AClient(base_url="http://localhost:5001")
            
            result = await client.get_task_status(
                target_agent="location",
                task_id="task-123"
            )
            
            assert result["result"]["status"] == "completed"
    
    def test_extract_result_data_success(self, mock_a2a_success_response):
        """Test extracting result data from successful response."""
        from services.a2a_client import A2AClient
        
        result = A2AClient.extract_result_data(mock_a2a_success_response)
        
        assert "output" in result
        assert result["output"] == "Test output"
    
    def test_extract_result_data_failure(self, mock_a2a_failed_response):
        """Test extracting result data from failed response raises error."""
        from services.a2a_client import A2AClient
        from config.errors import A2AError
        
        with pytest.raises(A2AError) as exc_info:
            A2AClient.extract_result_data(mock_a2a_failed_response)
        
        assert exc_info.value.code == "AGENT_FAILED"
    
    @pytest.mark.asyncio
    async def test_wait_for_completion_immediate(self, mock_a2a_success_response):
        """Test wait_for_completion with immediate completion."""
        from services.a2a_client import A2AClient
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = mock_a2a_success_response
            mock_response.raise_for_status = MagicMock()
            
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            
            client = A2AClient(base_url="http://localhost:5001")
            
            result = await client.wait_for_completion(
                target_agent="location",
                task_id="task-123",
                poll_interval=0.1,
                max_wait=5
            )
            
            assert result["result"]["status"] == "completed"
    
    @pytest.mark.asyncio
    async def test_wait_for_completion_timeout(self):
        """Test wait_for_completion timeout."""
        from services.a2a_client import A2AClient
        from config.errors import A2AError
        
        # Response with "working" status
        working_response = {
            "jsonrpc": "2.0",
            "id": "test-id",
            "result": {
                "task_id": "task-123",
                "status": "working"
            }
        }
        
        with patch('httpx.AsyncClient') as mock_client:
            mock_response = MagicMock()
            mock_response.json.return_value = working_response
            mock_response.raise_for_status = MagicMock()
            
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            
            client = A2AClient(base_url="http://localhost:5001")
            
            with pytest.raises(A2AError) as exc_info:
                await client.wait_for_completion(
                    target_agent="location",
                    task_id="task-123",
                    poll_interval=0.1,
                    max_wait=0.3
                )
            
            assert exc_info.value.code == "A2A_TIMEOUT"




