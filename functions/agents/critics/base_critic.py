"""Base Critic Agent for TrueCost.

Abstract base class for critic agents that provide qualitative
feedback when a primary agent's output scores below threshold.
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


class BaseCritic(ABC):
    """Abstract base class for critic agents.
    
    Critic agents:
    - Only called when scorer returns score < 80
    - Provide detailed feedback on what's wrong
    - Explain why it's wrong
    - Suggest how to fix it
    - Feedback is sent back to primary agent for retry
    
    Subclasses must implement:
    - get_critique_prompt() - returns the system prompt for critique
    - analyze_output(output, input_data, score, scorer_feedback) - analyzes issues
    """
    
    def __init__(
        self,
        name: str,
        primary_agent_name: str,
        firestore_service: Optional[FirestoreService] = None,
        llm_service: Optional[LLMService] = None
    ):
        """Initialize BaseCritic.
        
        Args:
            name: Critic agent name (e.g., "location_critic").
            primary_agent_name: Name of primary agent being critiqued.
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
            A2A JSON-RPC 2.0 response with critique.
        """
        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id", str(uuid4()))
        
        if method == "message/send":
            return await self._process_critique(params, request_id)
        else:
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"}
            }
    
    async def _process_critique(
        self,
        params: Dict[str, Any],
        request_id: str
    ) -> Dict[str, Any]:
        """Process critique request.
        
        Args:
            params: Message parameters.
            request_id: Request ID for response.
            
        Returns:
            A2A response with critique feedback.
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
            score = data.get("score", 0)
            scorer_feedback = data.get("scorer_feedback", "")
            
            logger.info(
                "critic_processing",
                critic=self.name,
                agent=agent_name,
                estimate_id=estimate_id,
                score=score
            )
            
            # Generate critique
            critique_result = await self.critique(
                estimate_id=estimate_id,
                output=output,
                input_data=input_data,
                score=score,
                scorer_feedback=scorer_feedback
            )
            
            logger.info(
                "critic_completed",
                critic=self.name,
                agent=agent_name,
                issues_count=len(critique_result.get("issues", [])),
                duration_ms=self.duration_ms
            )
            
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "task_id": task_id,
                    "status": "completed",
                    "result": critique_result
                }
            }
            
        except Exception as e:
            logger.exception("critic_error", critic=self.name, error=str(e))
            return {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "task_id": task_id,
                    "status": "failed",
                    "error": str(e)
                }
            }
    
    async def critique(
        self,
        estimate_id: str,
        output: Dict[str, Any],
        input_data: Dict[str, Any],
        score: int,
        scorer_feedback: str
    ) -> Dict[str, Any]:
        """Generate critique of the primary agent's output.
        
        Args:
            estimate_id: The estimate document ID.
            output: Primary agent's output to critique.
            input_data: Original input to the primary agent.
            score: Scorer's numerical score.
            scorer_feedback: Feedback from the scorer.
            
        Returns:
            Dict with issues, why_wrong, how_to_fix, and suggestions.
        """
        # Analyze the output for issues
        analysis = await self.analyze_output(
            output=output,
            input_data=input_data,
            score=score,
            scorer_feedback=scorer_feedback
        )
        
        # Use LLM to generate detailed critique
        critique_prompt = self.get_critique_prompt()
        
        user_message = f"""
Score: {score}/100
Scorer Feedback: {scorer_feedback}

## Input Data:
{self._format_for_prompt(input_data)}

## Agent Output:
{self._format_for_prompt(output)}

## Initial Analysis:
{self._format_for_prompt(analysis)}

Please provide a detailed critique with:
1. Specific issues found
2. Why each issue is problematic
3. How to fix each issue
4. Priority order for fixes
"""
        
        try:
            llm_response = await self.llm.generate_json(
                system_prompt=critique_prompt,
                user_message=user_message
            )
            
            critique = llm_response.get("content", {})
            
            return {
                "issues": critique.get("issues", analysis.get("issues", [])),
                "why_wrong": critique.get("why_wrong", analysis.get("why_wrong", "")),
                "how_to_fix": critique.get("how_to_fix", analysis.get("how_to_fix", [])),
                "suggestions": critique.get("suggestions", []),
                "priority": critique.get("priority", "high"),
                "score": score,
                "scorer_feedback": scorer_feedback
            }
            
        except Exception as e:
            # Fall back to analysis if LLM fails
            logger.warning(
                "critic_llm_fallback",
                critic=self.name,
                error=str(e)
            )
            return {
                "issues": analysis.get("issues", ["Unable to generate detailed critique"]),
                "why_wrong": analysis.get("why_wrong", "Output did not meet quality standards"),
                "how_to_fix": analysis.get("how_to_fix", ["Review and improve the output"]),
                "suggestions": [],
                "priority": "high",
                "score": score,
                "scorer_feedback": scorer_feedback
            }
    
    @abstractmethod
    def get_critique_prompt(self) -> str:
        """Get the system prompt for critique generation.
        
        Returns:
            System prompt string for the LLM.
        """
        raise NotImplementedError
    
    @abstractmethod
    async def analyze_output(
        self,
        output: Dict[str, Any],
        input_data: Dict[str, Any],
        score: int,
        scorer_feedback: str
    ) -> Dict[str, Any]:
        """Analyze output for issues (before LLM critique).
        
        This is a preliminary analysis that can be done
        programmatically before involving the LLM.
        
        Args:
            output: Primary agent's output.
            input_data: Original input data.
            score: Scorer's numerical score.
            scorer_feedback: Feedback from the scorer.
            
        Returns:
            Dict with preliminary issues, why_wrong, how_to_fix.
        """
        raise NotImplementedError
    
    def _format_for_prompt(self, data: Any) -> str:
        """Format data for inclusion in prompt.
        
        Args:
            data: Data to format.
            
        Returns:
            Formatted string representation.
        """
        import json
        
        if isinstance(data, (dict, list)):
            try:
                return json.dumps(data, indent=2, default=str)
            except Exception:
                return str(data)
        return str(data)
    
    def get_base_critique_prompt(self) -> str:
        """Get the base critique prompt template.
        
        Subclasses can use this as a starting point.
        
        Returns:
            Base system prompt string.
        """
        return f"""You are a quality assurance critic for the {self.primary_agent_name} agent in a construction estimation pipeline.

Your role is to:
1. Identify specific issues with the agent's output
2. Explain WHY each issue is problematic
3. Provide actionable suggestions on HOW to fix each issue

You must respond with valid JSON in this format:
{{
    "issues": ["List of specific issues found"],
    "why_wrong": "Explanation of why these issues are problematic",
    "how_to_fix": ["Specific, actionable steps to fix each issue"],
    "suggestions": ["Additional recommendations for improvement"],
    "priority": "high|medium|low"
}}

Be specific and constructive. Focus on issues that would affect:
- Accuracy of the construction estimate
- Completeness of required data
- Consistency with input data
- Compliance with industry standards
"""




