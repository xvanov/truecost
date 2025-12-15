"""Base Scorer Agent for TrueCost.

Abstract base class for scorer agents that provide objective
numerical evaluation (0-100) of primary agent outputs.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from uuid import uuid4
import time
import structlog

from services.firestore_service import FirestoreService
from services.llm_service import LLMService
from config.settings import settings

logger = structlog.get_logger()


class BaseScorer(ABC):
    """Abstract base class for scorer agents.
    
    Scorer agents:
    - Evaluate primary agent output objectively
    - Return a numerical score from 0-100
    - Score >= 80 means PASS (move to next agent)
    - Score < 80 triggers the critic agent
    
    Subclasses must implement:
    - get_scoring_criteria() - returns list of criteria with weights
    - evaluate_criterion(criterion, output, input_data) - evaluates one criterion
    """
    
    def __init__(
        self,
        name: str,
        primary_agent_name: str,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize BaseScorer.
        
        Args:
            name: Scorer agent name (e.g., "location_scorer").
            primary_agent_name: Name of primary agent being scored.
            firestore_service: Optional Firestore service instance.
            llm_service: Optional LLM service instance.
        """
        self.name = name
        self.primary_agent_name = primary_agent_name
        self.firestore = firestore_service or FirestoreService()
        self.llm = llm_service or LLMService()
        
        self._start_time: Optional[float] = None
    
    @property
    def duration_ms(self) -> int:
        """Get duration of current run in milliseconds."""
        if self._start_time is None:
            return 0
        return int((time.time() - self._start_time) * 1000)
    
    async def handle_a2a_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming A2A JSON-RPC request.
        
        Args:
            request: A2A JSON-RPC 2.0 request.
            
        Returns:
            A2A JSON-RPC 2.0 response with score.
        """
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id", str(uuid4()))
        
        if method == "message/send":
            return await self._process_scoring(params, request_id)
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"}
            }
    
    async def _process_scoring(
        self,
        params: Dict[str, Any],
        request_id: str
    ) -> Dict[str, Any]:
        """Process scoring request.
        
        Args:
            params: Message parameters.
            request_id: Request ID for response.
            
        Returns:
            A2A response with score and feedback.
        """
        task_id = str(uuid4())
        self._start_time = time.time()
        
        try:
            # Extract data from message
            message = params.get("message", {})
            parts = message.get("parts", [])
            data = next(
                (p.get("data") for p in parts if p.get("type") == "data"),
                {}
            )
            
            estimate_id = data.get("estimate_id")
            agent_name = data.get("agent_name")
            output = data.get("output", {})
            input_data = data.get("input", {})
            
            logger.info(
                "scorer_processing",
                scorer=self.name,
                agent=agent_name,
                estimate_id=estimate_id
            )
            
            # Run scoring
            score_result = await self.score(
                estimate_id=estimate_id,
                output=output,
                input_data=input_data
            )
            
            logger.info(
                "scorer_completed",
                scorer=self.name,
                agent=agent_name,
                score=score_result["score"],
                duration_ms=self.duration_ms
            )
            
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "task_id": task_id,
                    "status": "completed",
                    "result": score_result
                }
            }
            
        except Exception as e:
            logger.exception("scorer_error", scorer=self.name, error=str(e))
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "task_id": task_id,
                    "status": "failed",
                    "error": str(e)
                }
            }
    
    async def score(
        self,
        estimate_id: str,
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Score the primary agent's output.
        
        Args:
            estimate_id: The estimate document ID.
            output: Primary agent's output to score.
            input_data: Original input to the primary agent.
            
        Returns:
            Dict with score (0-100), breakdown, and feedback.
        """
        criteria = self.get_scoring_criteria()
        
        breakdown = []
        total_weight = sum(c.get("weight", 1) for c in criteria)
        weighted_sum = 0
        
        for criterion in criteria:
            # Evaluate each criterion
            criterion_result = await self.evaluate_criterion(
                criterion=criterion,
                output=output,
                input_data=input_data
            )
            
            weight = criterion.get("weight", 1)
            criterion_score = criterion_result.get("score", 0)
            weighted_sum += criterion_score * weight
            
            breakdown.append({
                "criterion": criterion.get("name"),
                "weight": weight,
                "score": criterion_score,
                "max_score": 100,
                "feedback": criterion_result.get("feedback", "")
            })
        
        # Calculate final score
        final_score = int(weighted_sum / total_weight) if total_weight > 0 else 0
        
        # Generate overall feedback
        feedback = self._generate_feedback(final_score, breakdown)
        
        return {
            "score": final_score,
            "breakdown": breakdown,
            "feedback": feedback,
            "passed": final_score >= settings.pipeline_passing_score
        }
    
    @abstractmethod
    def get_scoring_criteria(self) -> List[Dict[str, Any]]:
        """Get scoring criteria with weights.
        
        Returns:
            List of criteria dicts with:
            - name: Criterion name
            - description: What it checks
            - weight: Relative weight (default 1)
        """
        raise NotImplementedError
    
    @abstractmethod
    async def evaluate_criterion(
        self,
        criterion: Dict[str, Any],
        output: Dict[str, Any],
        input_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Evaluate a single scoring criterion.
        
        Args:
            criterion: Criterion definition.
            output: Primary agent's output.
            input_data: Original input data.
            
        Returns:
            Dict with score (0-100) and feedback.
        """
        raise NotImplementedError
    
    def _generate_feedback(
        self,
        score: int,
        breakdown: List[Dict[str, Any]]
    ) -> str:
        """Generate overall feedback message.
        
        Args:
            score: Final score.
            breakdown: Scoring breakdown.
            
        Returns:
            Human-readable feedback message.
        """
        if score >= 90:
            return "Excellent output with high quality across all criteria."
        elif score >= 80:
            return "Good output that meets quality standards."
        elif score >= 70:
            return "Acceptable output with some areas for improvement."
        elif score >= 60:
            return "Below standard output requiring significant improvements."
        else:
            return "Poor quality output with major issues that must be addressed."




