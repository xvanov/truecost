"""Pytest configuration and shared fixtures for TrueCost tests."""

import os
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any


# ============================================================================
# Ensure local imports work (agents/, models/, services/, config/)
# ============================================================================
#
# On some Windows/Python/pytest combinations (especially with importlib import mode),
# the repository root may not reliably be on sys.path during collection.
# Our codebase uses absolute imports like `from models...` / `from agents...`.
#
# This guarantees that `functions/` is importable as the top-level module root.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================================
# Firebase Mocks
# ============================================================================

@pytest.fixture
def mock_firestore_client():
    """Mock Firestore client."""
    client = MagicMock()
    
    # Mock collection and document methods
    collection_mock = MagicMock()
    document_mock = MagicMock()
    
    # Set up chain: client.collection().document()
    client.collection.return_value = collection_mock
    collection_mock.document.return_value = document_mock
    
    # Mock async methods
    document_mock.get = AsyncMock(return_value=MagicMock(
        exists=True,
        id="test-estimate-id",
        to_dict=lambda: {"status": "processing"}
    ))
    document_mock.set = AsyncMock()
    document_mock.update = AsyncMock()
    document_mock.delete = AsyncMock()
    
    # Mock subcollection
    subcollection_mock = MagicMock()
    document_mock.collection.return_value = subcollection_mock
    subcollection_mock.document.return_value = document_mock
    
    return client


@pytest.fixture
def mock_firestore_service(mock_firestore_client):
    """Mock FirestoreService with mocked client."""
    from services.firestore_service import FirestoreService
    
    service = FirestoreService(db=mock_firestore_client)
    return service


# ============================================================================
# LLM Mocks
# ============================================================================

@pytest.fixture
def mock_llm_response():
    """Standard mock LLM response."""
    return {
        "content": "Mock LLM response",
        "tokens_used": 100
    }


@pytest.fixture
def mock_llm_json_response():
    """Mock LLM JSON response."""
    return {
        "content": {
            "result": "success",
            "data": {"key": "value"}
        },
        "tokens_used": 150
    }


@pytest.fixture
def mock_chat_openai():
    """Mock ChatOpenAI client."""
    mock = AsyncMock()
    mock.ainvoke.return_value = MagicMock(
        content="Mock response content",
        response_metadata={"token_usage": {"total_tokens": 100}}
    )
    return mock


@pytest.fixture
def mock_llm_service(mock_chat_openai):
    """Mock LLMService."""
    from services.llm_service import LLMService
    
    with patch('services.llm_service.ChatOpenAI', return_value=mock_chat_openai):
        service = LLMService(api_key="test-api-key")
        service._client = mock_chat_openai
        return service


# ============================================================================
# A2A Mocks
# ============================================================================

@pytest.fixture
def mock_a2a_success_response():
    """Mock successful A2A response."""
    return {
        "jsonrpc": "2.0",
        "id": "test-request-id",
        "result": {
            "task_id": "test-task-id",
            "status": "completed",
            "result": {
                "output": "Test output",
                "data": {"key": "value"}
            }
        }
    }


@pytest.fixture
def mock_a2a_failed_response():
    """Mock failed A2A response."""
    return {
        "jsonrpc": "2.0",
        "id": "test-request-id",
        "result": {
            "task_id": "test-task-id",
            "status": "failed",
            "error": "Test error message"
        }
    }


@pytest.fixture
def mock_a2a_client(mock_a2a_success_response):
    """Mock A2AClient."""
    from services.a2a_client import A2AClient
    
    client = A2AClient(base_url="http://localhost:5001")
    client.send_task = AsyncMock(return_value=mock_a2a_success_response)
    client.get_task_status = AsyncMock(return_value=mock_a2a_success_response)
    
    return client


# ============================================================================
# Sample Data Fixtures
# ============================================================================

@pytest.fixture
def sample_estimate_id():
    """Sample estimate ID."""
    return "est-test-12345"


@pytest.fixture
def sample_clarification_output():
    """Sample ClarificationOutput data."""
    return {
        "estimateId": "est-test-12345",
        "schemaVersion": "3.0.0",
        "projectBrief": {
            "projectType": "kitchen_remodel",
            "location": {
                "zipCode": "80202",
                "city": "Denver",
                "state": "CO",
                "fullAddress": "123 Main St, Denver, CO 80202"
            },
            "scopeSummary": {
                "totalSqft": 150,
                "finishLevel": "mid_range",
                "description": "Kitchen remodel with new cabinets and countertops"
            },
            "timeline": {
                # TimelineAgent requires desiredStart (no default offset fallback)
                "desiredStart": "2025-02-01",
                # Back-compat: some older fixtures used preferredStart
                "preferredStart": "2025-02-01",
                "flexibilityDays": 14
            }
        },
        "csiScope": {
            "div01_general_requirements": {
                "status": "included",
                "lineItems": []
            },
            "div06_wood_plastics_composites": {
                "status": "included",
                "lineItems": [
                    {
                        "description": "Kitchen cabinets - wall mounted",
                        "quantity": 10,
                        "unit": "LF"
                    },
                    {
                        "description": "Kitchen cabinets - base",
                        "quantity": 12,
                        "unit": "LF"
                    }
                ]
            },
            "div09_finishes": {
                "status": "included",
                "lineItems": [
                    {
                        "description": "Granite countertops",
                        "quantity": 35,
                        "unit": "SF"
                    }
                ]
            }
        },
        "cadData": {
            "fileUrl": "https://storage.example.com/cad/kitchen.pdf",
            "spaceModel": {
                "rooms": [
                    {
                        "name": "Kitchen",
                        "area": 150,
                        "perimeter": 50
                    }
                ],
                "walls": [],
                "openings": []
            }
        }
    }


@pytest.fixture
def sample_location_factors():
    """Sample location factors output."""
    return {
        "zipCode": "80202",
        "city": "Denver",
        "state": "CO",
        "region": "Mountain",
        "laborRates": {
            "electrician": 55.0,
            "plumber": 60.0,
            "carpenter": 45.0,
            "hvac": 58.0,
            "general_labor": 35.0
        },
        "isUnion": False,
        "permitCosts": {
            "buildingPermit": 500,
            "electricalPermit": 150,
            "plumbingPermit": 150
        },
        "locationFactor": 1.05,
        "weatherFactors": {
            "winterImpact": "moderate",
            "seasonalAdjustment": 1.02
        }
    }


@pytest.fixture
def sample_bill_of_quantities():
    """Sample enriched Bill of Quantities."""
    return {
        "divisions": [
            {
                "division": "06",
                "name": "Wood, Plastics, and Composites",
                "lineItems": [
                    {
                        "description": "Kitchen cabinets - wall mounted",
                        "quantity": 10,
                        "unit": "LF",
                        "costCode": "06-4100",
                        "unitCost": 250.0
                    },
                    {
                        "description": "Kitchen cabinets - base",
                        "quantity": 12,
                        "unit": "LF",
                        "costCode": "06-4100",
                        "unitCost": 300.0
                    }
                ]
            },
            {
                "division": "09",
                "name": "Finishes",
                "lineItems": [
                    {
                        "description": "Granite countertops",
                        "quantity": 35,
                        "unit": "SF",
                        "costCode": "09-6600",
                        "unitCost": 85.0
                    }
                ]
            }
        ],
        "totalLineItems": 3,
        "totalDivisions": 2
    }


@pytest.fixture
def sample_cost_estimate():
    """Sample cost estimate output."""
    return {
        "subtotals": {
            "materials": 8575.0,
            "labor": 3500.0,
            "equipment": 250.0
        },
        "adjustments": {
            "locationFactor": 1.05,
            "overhead": 0.10,
            "profit": 0.10
        },
        "total": 14273.63,
        "confidence": 0.85
    }


@pytest.fixture
def sample_a2a_request():
    """Sample A2A JSON-RPC request."""
    return {
        "jsonrpc": "2.0",
        "id": "req-test-001",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [
                    {
                        "type": "data",
                        "data": {
                            "estimate_id": "est-test-12345",
                            "input": {"key": "value"}
                        }
                    }
                ]
            },
            "context": {
                "thread_id": "est-test-12345"
            }
        }
    }


# ============================================================================
# Agent Test Fixtures
# ============================================================================

@pytest.fixture
def mock_base_agent(mock_firestore_service, mock_llm_service):
    """Create a concrete implementation of BaseA2AAgent for testing."""
    from agents.base_agent import BaseA2AAgent
    
    class TestAgent(BaseA2AAgent):
        async def run(self, estimate_id, input_data, feedback=None):
            return {"test": "output", "estimate_id": estimate_id}
    
    return TestAgent(
        name="test_agent",
        firestore_service=mock_firestore_service,
        llm_service=mock_llm_service
    )


@pytest.fixture
def mock_base_scorer(mock_firestore_service, mock_llm_service):
    """Create a concrete implementation of BaseScorer for testing."""
    from agents.scorers.base_scorer import BaseScorer
    
    class TestScorer(BaseScorer):
        def get_scoring_criteria(self):
            return [
                {"name": "completeness", "weight": 1, "description": "Check completeness"},
                {"name": "accuracy", "weight": 1, "description": "Check accuracy"}
            ]
        
        async def evaluate_criterion(self, criterion, output, input_data):
            return {"score": 85, "feedback": "Good"}
    
    return TestScorer(
        name="test_scorer",
        primary_agent_name="test_agent",
        firestore_service=mock_firestore_service,
        llm_service=mock_llm_service
    )


@pytest.fixture
def mock_base_critic(mock_firestore_service, mock_llm_service):
    """Create a concrete implementation of BaseCritic for testing."""
    from agents.critics.base_critic import BaseCritic
    
    class TestCritic(BaseCritic):
        def get_critique_prompt(self):
            return "You are a test critic."
        
        async def analyze_output(self, output, input_data, score, scorer_feedback):
            return {
                "issues": ["Test issue"],
                "why_wrong": "Test reason",
                "how_to_fix": ["Test fix"]
            }
    
    return TestCritic(
        name="test_critic",
        primary_agent_name="test_agent",
        firestore_service=mock_firestore_service,
        llm_service=mock_llm_service
    )


# ============================================================================
# Environment Setup
# ============================================================================

@pytest.fixture(autouse=True)
def mock_settings():
    """Mock settings for all tests."""
    with patch('config.settings.settings') as mock:
        mock.openai_api_key = "test-api-key"
        mock.llm_model = "gpt-4o"
        mock.llm_temperature = 0.1
        mock.use_firebase_emulators = True
        mock.a2a_base_url = "http://localhost:5001"
        mock.a2a_timeout_seconds = 300
        mock.pipeline_max_retries = 2
        mock.pipeline_passing_score = 80
        mock.log_level = "INFO"
        yield mock



