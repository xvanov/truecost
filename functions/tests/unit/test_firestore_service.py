"""Unit tests for Firestore service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestFirestoreService:
    """Tests for FirestoreService."""
    
    @pytest.mark.asyncio
    async def test_get_estimate_exists(self, mock_firestore_service):
        """Test getting an existing estimate."""
        # Setup mock
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.id = "est-123"
        mock_doc.to_dict.return_value = {"status": "processing", "userId": "user-1"}
        
        mock_firestore_service.db.collection.return_value.document.return_value.get = AsyncMock(
            return_value=mock_doc
        )
        
        result = await mock_firestore_service.get_estimate("est-123")
        
        assert result is not None
        assert result["id"] == "est-123"
        assert result["status"] == "processing"
    
    @pytest.mark.asyncio
    async def test_get_estimate_not_exists(self, mock_firestore_service):
        """Test getting a non-existent estimate."""
        mock_doc = MagicMock()
        mock_doc.exists = False
        
        mock_firestore_service.db.collection.return_value.document.return_value.get = AsyncMock(
            return_value=mock_doc
        )
        
        result = await mock_firestore_service.get_estimate("est-nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_update_estimate(self, mock_firestore_service):
        """Test updating an estimate."""
        mock_firestore_service.db.collection.return_value.document.return_value.update = AsyncMock()
        
        await mock_firestore_service.update_estimate(
            "est-123",
            {"status": "completed"}
        )
        
        # Verify update was called
        mock_firestore_service.db.collection.return_value.document.return_value.update.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_agent_status(self, mock_firestore_service):
        """Test updating agent status."""
        mock_firestore_service.db.collection.return_value.document.return_value.update = AsyncMock()
        
        await mock_firestore_service.update_agent_status(
            estimate_id="est-123",
            agent_name="location",
            status="running"
        )
        
        # Verify update was called
        mock_firestore_service.db.collection.return_value.document.return_value.update.assert_called()
    
    @pytest.mark.asyncio
    async def test_update_agent_status_with_retry(self, mock_firestore_service):
        """Test updating agent status with retry count."""
        mock_firestore_service.db.collection.return_value.document.return_value.update = AsyncMock()
        
        await mock_firestore_service.update_agent_status(
            estimate_id="est-123",
            agent_name="location",
            status="running",
            retry=1
        )
        
        # Verify update was called
        call_args = mock_firestore_service.db.collection.return_value.document.return_value.update.call_args
        assert call_args is not None
    
    @pytest.mark.asyncio
    async def test_save_agent_output(self, mock_firestore_service):
        """Test saving agent output."""
        # Setup mock for subcollection
        mock_doc_ref = MagicMock()
        mock_doc_ref.set = AsyncMock()
        
        mock_firestore_service.db.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_doc_ref
        mock_firestore_service.db.collection.return_value.document.return_value.update = AsyncMock()
        
        await mock_firestore_service.save_agent_output(
            estimate_id="est-123",
            agent_name="location",
            output={"laborRates": {"electrician": 55.0}},
            summary="Location factors retrieved",
            confidence=0.95,
            tokens_used=500,
            duration_ms=2000
        )
        
        # Verify set was called on subcollection document
        mock_doc_ref.set.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_agent_output(self, mock_firestore_service):
        """Test getting agent output."""
        mock_doc = MagicMock()
        mock_doc.exists = True
        mock_doc.to_dict.return_value = {
            "status": "completed",
            "output": {"laborRates": {"electrician": 55.0}}
        }
        
        mock_firestore_service.db.collection.return_value.document.return_value.collection.return_value.document.return_value.get = AsyncMock(
            return_value=mock_doc
        )
        
        result = await mock_firestore_service.get_agent_output("est-123", "location")
        
        assert result is not None
        assert result["status"] == "completed"
    
    @pytest.mark.asyncio
    async def test_create_estimate(self, mock_firestore_service):
        """Test creating a new estimate."""
        mock_firestore_service.db.collection.return_value.document.return_value.set = AsyncMock()
        
        result = await mock_firestore_service.create_estimate(
            estimate_id="est-new",
            user_id="user-1",
            clarification_output={"schemaVersion": "3.0.0"}
        )
        
        assert result == "est-new"
        mock_firestore_service.db.collection.return_value.document.return_value.set.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_firestore_error_handling(self, mock_firestore_service):
        """Test error handling for Firestore operations."""
        from config.errors import TrueCostError
        
        mock_firestore_service.db.collection.return_value.document.return_value.get = AsyncMock(
            side_effect=Exception("Connection failed")
        )
        
        with pytest.raises(TrueCostError) as exc_info:
            await mock_firestore_service.get_estimate("est-123")
        
        assert exc_info.value.code == "FIRESTORE_ERROR"




