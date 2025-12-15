"""LLM service for TrueCost.

Provides LangChain/OpenAI integration for Deep Agents.
"""

from typing import Dict, Any, Optional, List
import structlog
from langchain_openai import ChatOpenAI
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

from config.settings import settings
from config.errors import TrueCostError, ErrorCode

logger = structlog.get_logger()


class LLMService:
    """Service for LLM operations using LangChain.
    
    Provides a wrapper around ChatOpenAI with token tracking
    and error handling.
    """
    
    def __init__(
        self,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        api_key: Optional[str] = None
    ):
        """Initialize LLMService.
        
        Args:
            model: Model name (default from settings).
            temperature: Temperature (default from settings).
            api_key: OpenAI API key (default from settings).
        """
        self.model = model or settings.llm_model
        self.temperature = temperature or settings.llm_temperature
        self.api_key = api_key or settings.openai_api_key
        
        self._client: Optional[ChatOpenAI] = None
        self._total_tokens_used = 0
    
    @property
    def client(self) -> ChatOpenAI:
        """Get LangChain ChatOpenAI client (lazy initialization)."""
        if self._client is None:
            self._client = ChatOpenAI(
                model=self.model,
                temperature=self.temperature,
                api_key=self.api_key
            )
        return self._client
    
    @property
    def total_tokens_used(self) -> int:
        """Get total tokens used across all calls."""
        return self._total_tokens_used
    
    async def generate(
        self,
        messages: List[BaseMessage],
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Generate a response from the LLM.
        
        Args:
            messages: List of LangChain messages.
            max_tokens: Optional max tokens for response.
            
        Returns:
            Dict with content and token usage.
            
        Raises:
            TrueCostError: If LLM call fails.
        """
        try:
            kwargs = {}
            if max_tokens:
                kwargs["max_tokens"] = max_tokens
            
            response = await self.client.ainvoke(messages, **kwargs)
            
            # Track token usage if available
            tokens_used = 0
            if hasattr(response, "response_metadata"):
                usage = response.response_metadata.get("token_usage", {})
                tokens_used = usage.get("total_tokens", 0)
                self._total_tokens_used += tokens_used
            
            logger.info(
                "llm_generated",
                model=self.model,
                tokens_used=tokens_used,
                content_length=len(response.content)
            )
            
            return {
                "content": response.content,
                "tokens_used": tokens_used
            }
            
        except Exception as e:
            error_msg = str(e)
            
            # Detect specific error types
            if "rate_limit" in error_msg.lower():
                raise TrueCostError(
                    code=ErrorCode.LLM_RATE_LIMIT,
                    message="OpenAI rate limit exceeded",
                    details={"original_error": error_msg}
                )
            elif "context_length" in error_msg.lower() or "maximum context" in error_msg.lower():
                raise TrueCostError(
                    code=ErrorCode.LLM_CONTEXT_TOO_LONG,
                    message="Input too long for model context",
                    details={"original_error": error_msg}
                )
            else:
                raise TrueCostError(
                    code=ErrorCode.LLM_ERROR,
                    message=f"LLM generation failed: {error_msg}",
                    details={"original_error": error_msg}
                )
    
    async def generate_with_system_prompt(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Generate a response with system prompt.
        
        Args:
            system_prompt: System prompt for context.
            user_message: User message/query.
            max_tokens: Optional max tokens for response.
            
        Returns:
            Dict with content and token usage.
        """
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message)
        ]
        return await self.generate(messages, max_tokens)
    
    async def generate_json(
        self,
        system_prompt: str,
        user_message: str,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """Generate a JSON response.
        
        Adds JSON formatting instructions to the system prompt.
        
        Args:
            system_prompt: System prompt for context.
            user_message: User message/query.
            max_tokens: Optional max tokens for response.
            
        Returns:
            Dict with parsed JSON content and token usage.
            
        Raises:
            TrueCostError: If response is not valid JSON.
        """
        import json
        
        json_prompt = f"""{system_prompt}

IMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation, just JSON."""
        
        result = await self.generate_with_system_prompt(
            json_prompt,
            user_message,
            max_tokens
        )
        
        try:
            # Parse JSON from response
            content = result["content"].strip()
            
            # Handle markdown code blocks
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            
            parsed = json.loads(content.strip())
            
            return {
                "content": parsed,
                "tokens_used": result["tokens_used"]
            }
            
        except json.JSONDecodeError as e:
            raise TrueCostError(
                code=ErrorCode.LLM_ERROR,
                message="LLM did not return valid JSON",
                details={
                    "parse_error": str(e),
                    "raw_content": result["content"][:500]
                }
            )
    
    def create_chat_model(
        self,
        model: Optional[str] = None,
        temperature: Optional[float] = None
    ) -> ChatOpenAI:
        """Create a new ChatOpenAI instance.
        
        Useful for creating models with different configurations
        for different agents.
        
        Args:
            model: Model name (default from settings).
            temperature: Temperature (default from settings).
            
        Returns:
            Configured ChatOpenAI instance.
        """
        return ChatOpenAI(
            model=model or self.model,
            temperature=temperature if temperature is not None else self.temperature,
            api_key=self.api_key
        )




