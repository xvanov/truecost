"""Base A2A Agent for TrueCost.

Abstract base class for all agents in the deep pipeline.
Integrates LangChain Deep Agents with A2A Protocol.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from uuid import uuid4
import time
import structlog

from langchain_openai import ChatOpenAI

from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from config.settings import settings
from config.errors import TrueCostError, AgentError, ErrorCode

logger = structlog.get_logger()


class BaseA2AAgent(ABC):
    """Abstract base class for A2A-compatible agents.
    
    Provides:
    - A2A JSON-RPC 2.0 request handling
    - Firestore integration for persistence
    - LLM service integration
    - Token and duration tracking
    - Retry support with critic feedback
    
    Subclasses must implement:
    - run(estimate_id, input_data, feedback) - agent's main logic
    """
    
    def __init__(
        self,
        name: str,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize BaseA2AAgent.
        
        Args:
            name: Agent name (e.g., "location", "scope", "cost").
            firestore_service: Optional Firestore service instance.
            llm_service: Optional LLM service instance.
        """
        self.name = name
        self.firestore = firestore_service or FirestoreService()
        self.llm = llm_service or LLMService()
        
        # Tracking
        self._tokens_used = 0
        self._start_time: Optional[float] = None
    
    @property
    def tokens_used(self) -> int:
        """Get tokens used in current run."""
        return self._tokens_used
    
    @property
    def duration_ms(self) -> int:
        """Get duration of current run in milliseconds."""
        if self._start_time is None:
            return 0
        return int((time.time() - self._start_time) * 1000)
    
    async def handle_a2a_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming A2A JSON-RPC request.
        
        Routes requests to appropriate handlers based on method.
        
        Args:
            request: A2A JSON-RPC 2.0 request.
            
        Returns:
            A2A JSON-RPC 2.0 response.
        """
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id", str(uuid4()))
        
        logger.info(
            "a2a_request_received",
            agent=self.name,
            method=method,
            request_id=request_id
        )
        
        if method == "message/send":
            return await self._process_message(params, request_id)
        elif method == "tasks/get":
            return await self._get_task_status(params, request_id)
        elif method == "agent/card":
            return self._get_agent_card(request_id)
        else:
            return self._error_response(
                code=-32601,
                message=f"Method not found: {method}",
                request_id=request_id
            )
    
    async def _process_message(
        self,
        params: Dict[str, Any],
        request_id: str
    ) -> Dict[str, Any]:
        """Process incoming A2A message and run agent.
        
        Args:
            params: Message parameters.
            request_id: Request ID for response.
            
        Returns:
            A2A response with task result.
        """
        task_id = str(uuid4())
        self._start_time = time.time()
        self._tokens_used = 0
        
        try:
            # Extract data from message parts
            message = params.get("message", {})
            parts = message.get("parts", [])
            data = next(
                (p.get("data") for p in parts if p.get("type") == "data"),
                {}
            )
            
            estimate_id = data.get("estimate_id")
            input_data = data.get("input", data)
            
            # Extract feedback if present (for retries)
            critic_feedback = data.get("critic_feedback")
            retry_attempt = data.get("retry_attempt", 0)
            
            if not estimate_id:
                return self._error_response(
                    code=-32602,
                    message="Missing estimate_id in request",
                    request_id=request_id
                )
            
            logger.info(
                "agent_processing",
                agent=self.name,
                estimate_id=estimate_id,
                task_id=task_id,
                has_feedback=critic_feedback is not None,
                retry_attempt=retry_attempt
            )
            
            # Update status in Firestore
            await self.firestore.update_agent_status(
                estimate_id,
                self.name,
                status="running",
                retry=retry_attempt if retry_attempt > 0 else None
            )
            
            # Run the agent's main logic
            result = await self.run(
                estimate_id=estimate_id,
                input_data=input_data,
                feedback=critic_feedback
            )
            
            # Track LLM tokens if available
            if hasattr(self.llm, 'total_tokens_used'):
                self._tokens_used = self.llm.total_tokens_used
            
            duration = self.duration_ms
            
            logger.info(
                "agent_completed",
                agent=self.name,
                estimate_id=estimate_id,
                task_id=task_id,
                duration_ms=duration,
                tokens_used=self._tokens_used
            )
            
            return self._success_response(
                task_id=task_id,
                result=result,
                request_id=request_id
            )
            
        except TrueCostError as e:
            logger.error(
                "agent_error",
                agent=self.name,
                error_code=e.code,
                error=e.message
            )
            return self._task_failed_response(
                task_id=task_id,
                error=f"{e.code}: {e.message}",
                request_id=request_id
            )
            
        except Exception as e:
            logger.exception(
                "agent_exception",
                agent=self.name,
                error=str(e)
            )
            return self._task_failed_response(
                task_id=task_id,
                error=str(e),
                request_id=request_id
            )
    
    async def _get_task_status(
        self,
        params: Dict[str, Any],
        request_id: str
    ) -> Dict[str, Any]:
        """Get task status (for async tasks).
        
        Currently all tasks are synchronous, so this returns completed.
        
        Args:
            params: Request parameters with task_id.
            request_id: Request ID for response.
            
        Returns:
            Task status response.
        """
        task_id = params.get("task_id")
        
        # For now, all tasks are synchronous
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "task_id": task_id,
                "status": "completed"
            }
        }
    
    def _get_agent_card(self, request_id: str) -> Dict[str, Any]:
        """Return agent card (capability metadata).
        
        Subclasses can override to provide custom cards.
        
        Args:
            request_id: Request ID for response.
            
        Returns:
            Agent card response.
        """
        from agents.agent_cards import AGENT_CARDS
        
        card = AGENT_CARDS.get(self.name, {
            "name": f"TrueCost {self.name.title()} Agent",
            "description": f"Agent for {self.name} processing",
            "version": "1.0.0"
        })
        
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": card
        }
    
    @abstractmethod
    async def run(
        self,
        estimate_id: str,
        input_data: Dict[str, Any],
        feedback: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Run agent's main logic.
        
        Subclasses must implement this method.
        
        Args:
            estimate_id: The estimate document ID.
            input_data: Input data for processing.
            feedback: Optional critic feedback for retry attempts.
            
        Returns:
            Agent output dictionary.
        """
        raise NotImplementedError("Subclasses must implement run()")
    
    def _success_response(
        self,
        task_id: str,
        result: Dict[str, Any],
        request_id: str
    ) -> Dict[str, Any]:
        """Build successful A2A response.
        
        Args:
            task_id: Task ID.
            result: Task result data.
            request_id: Request ID.
            
        Returns:
            A2A JSON-RPC success response.
        """
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "task_id": task_id,
                "status": "completed",
                "result": result,
                "metadata": {
                    "agent": self.name,
                    "duration_ms": self.duration_ms,
                    "tokens_used": self._tokens_used
                }
            }
        }
    
    def _task_failed_response(
        self,
        task_id: str,
        error: str,
        request_id: str
    ) -> Dict[str, Any]:
        """Build failed task A2A response.
        
        Args:
            task_id: Task ID.
            error: Error message.
            request_id: Request ID.
            
        Returns:
            A2A JSON-RPC response with failed status.
        """
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "task_id": task_id,
                "status": "failed",
                "error": error,
                "metadata": {
                    "agent": self.name,
                    "duration_ms": self.duration_ms
                }
            }
        }
    
    def _error_response(
        self,
        code: int,
        message: str,
        request_id: str
    ) -> Dict[str, Any]:
        """Build JSON-RPC error response.
        
        Args:
            code: JSON-RPC error code.
            message: Error message.
            request_id: Request ID.
            
        Returns:
            A2A JSON-RPC error response.
        """
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {
                "code": code,
                "message": message
            }
        }
    
    def build_system_prompt(
        self,
        base_prompt: str,
        feedback: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build system prompt with optional critic feedback.
        
        Args:
            base_prompt: Base system prompt for the agent.
            feedback: Optional critic feedback from previous attempt.
            
        Returns:
            Complete system prompt.
        """
        if not feedback:
            return base_prompt
        
        # Include critic feedback in prompt for retry
        feedback_section = f"""

## IMPORTANT: Previous Attempt Feedback

Your previous attempt scored {feedback.get('score', 'N/A')}/100 and did not pass validation.

### Issues Identified:
{self._format_issues(feedback.get('issues', []))}

### Why It Was Wrong:
{feedback.get('why_wrong', 'Not specified')}

### How To Fix:
{self._format_fixes(feedback.get('how_to_fix', []))}

Please address these issues in your response. Focus on the specific problems identified above.
"""
        return base_prompt + feedback_section
    
    def _format_issues(self, issues: list) -> str:
        """Format issues list for prompt."""
        if not issues:
            return "- No specific issues listed"
        return "\n".join(f"- {issue}" for issue in issues)
    
    def _format_fixes(self, fixes: list) -> str:
        """Format fixes list for prompt."""
        if not fixes:
            return "- No specific fixes suggested"
        return "\n".join(f"- {fix}" for fix in fixes)




