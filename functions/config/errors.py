"""TrueCost error handling.

Custom exceptions and error codes for the deep agent pipeline.
"""

from typing import Optional, Dict, Any


# Error Codes
class ErrorCode:
    """Error code constants."""
    
    # Validation Errors (1xxx)
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_SCHEMA = "INVALID_SCHEMA"
    MISSING_FIELD = "MISSING_FIELD"
    INVALID_FIELD = "INVALID_FIELD"
    
    # Agent Errors (2xxx)
    AGENT_TIMEOUT = "AGENT_TIMEOUT"
    AGENT_FAILED = "AGENT_FAILED"
    AGENT_VALIDATION_FAILED = "AGENT_VALIDATION_FAILED"
    AGENT_MAX_RETRIES_EXCEEDED = "AGENT_MAX_RETRIES_EXCEEDED"
    
    # Pipeline Errors (3xxx)
    PIPELINE_FAILED = "PIPELINE_FAILED"
    PIPELINE_TIMEOUT = "PIPELINE_TIMEOUT"
    PIPELINE_INVALID_STATE = "PIPELINE_INVALID_STATE"
    
    # A2A Protocol Errors (4xxx)
    A2A_CONNECTION_ERROR = "A2A_CONNECTION_ERROR"
    A2A_TIMEOUT = "A2A_TIMEOUT"
    A2A_INVALID_RESPONSE = "A2A_INVALID_RESPONSE"
    A2A_METHOD_NOT_FOUND = "A2A_METHOD_NOT_FOUND"
    
    # Firestore Errors (5xxx)
    FIRESTORE_ERROR = "FIRESTORE_ERROR"
    ESTIMATE_NOT_FOUND = "ESTIMATE_NOT_FOUND"
    FIRESTORE_WRITE_FAILED = "FIRESTORE_WRITE_FAILED"
    
    # LLM Errors (6xxx)
    LLM_ERROR = "LLM_ERROR"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    LLM_CONTEXT_TOO_LONG = "LLM_CONTEXT_TOO_LONG"
    
    # External Service Errors (7xxx)
    EXTERNAL_API_ERROR = "EXTERNAL_API_ERROR"
    COST_DATA_ERROR = "COST_DATA_ERROR"
    MONTE_CARLO_ERROR = "MONTE_CARLO_ERROR"


class TrueCostError(Exception):
    """Base exception for TrueCost errors.
    
    Provides structured error information for API responses.
    
    Attributes:
        code: Error code from ErrorCode constants
        message: Human-readable error message
        details: Additional error context
    """
    
    def __init__(
        self,
        code: str,
        message: str,
        details: Optional[Dict[str, Any]] = None
    ):
        """Initialize TrueCostError.
        
        Args:
            code: Error code from ErrorCode constants
            message: Human-readable error message
            details: Additional error context
        """
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert error to dictionary for API response.
        
        Returns:
            Dictionary with code, message, and details.
        """
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details
        }
    
    def __repr__(self) -> str:
        return f"TrueCostError(code={self.code!r}, message={self.message!r})"


class ValidationError(TrueCostError):
    """Validation-specific error."""
    
    def __init__(self, message: str, field: Optional[str] = None, details: Optional[Dict] = None):
        super().__init__(
            code=ErrorCode.VALIDATION_ERROR,
            message=message,
            details={**(details or {}), "field": field} if field else details
        )


class AgentError(TrueCostError):
    """Agent-specific error."""
    
    def __init__(
        self,
        code: str,
        message: str,
        agent_name: str,
        details: Optional[Dict] = None
    ):
        super().__init__(
            code=code,
            message=message,
            details={**(details or {}), "agent_name": agent_name}
        )
        self.agent_name = agent_name


class PipelineError(TrueCostError):
    """Pipeline-specific error."""
    
    def __init__(
        self,
        code: str,
        message: str,
        estimate_id: str,
        current_agent: Optional[str] = None,
        details: Optional[Dict] = None
    ):
        super().__init__(
            code=code,
            message=message,
            details={
                **(details or {}),
                "estimate_id": estimate_id,
                "current_agent": current_agent
            }
        )
        self.estimate_id = estimate_id
        self.current_agent = current_agent


class A2AError(TrueCostError):
    """A2A protocol-specific error."""
    
    def __init__(
        self,
        code: str,
        message: str,
        target_agent: str,
        details: Optional[Dict] = None
    ):
        super().__init__(
            code=code,
            message=message,
            details={**(details or {}), "target_agent": target_agent}
        )
        self.target_agent = target_agent




