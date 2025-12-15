"""Deep Agents factory + JSON helper for TrueCost primary agents.

Primary agents should call `deep_agent_generate_json(...)` instead of calling
`LLMService.generate_json(...)` directly. This keeps the migration to Deep Agents
localized and makes unit tests easy to patch (mock this function).
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import structlog
from langchain_openai import ChatOpenAI
from langchain_core.callbacks import BaseCallbackHandler

from config.settings import settings
from services.firestore_service import FirestoreService
from services.deep_agents_backend import FirestoreAgentFsBackend

logger = structlog.get_logger(__name__)

# Enable verbose LLM logging via environment variable
VERBOSE_LLM_LOGGING = os.environ.get("TRUECOST_VERBOSE_LLM", "false").lower() in ("true", "1", "yes")


def _truncate(text: str, max_len: int = 500) -> str:
    """Truncate text for logging."""
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return text[:max_len] + f"... [truncated, {len(text)} chars total]"


def _format_json_for_log(data: Any, indent: int = 2, max_len: int = 1500) -> str:
    """Format JSON data for logging with truncation."""
    try:
        formatted = json.dumps(data, indent=indent, ensure_ascii=False)
        return _truncate(formatted, max_len)
    except Exception:
        return str(data)[:max_len]


class _TokenCountingCallback(BaseCallbackHandler):
    """Accumulate token usage across all LLM calls in one deep agent run."""

    def __init__(self):
        self.total_tokens = 0

    def on_llm_end(self, response, **kwargs):  # noqa: ANN001
        # response is typically an LLMResult
        try:
            llm_output = getattr(response, "llm_output", None) or {}
            if isinstance(llm_output, dict):
                usage = llm_output.get("token_usage") or llm_output.get("usage") or {}
                if isinstance(usage, dict):
                    self.total_tokens += int(usage.get("total_tokens") or 0)
        except Exception:
            # Token usage is best-effort; don't fail the agent run for this.
            return


def _parse_json_strict(content: str) -> Dict[str, Any]:
    """Parse JSON-only responses, optionally stripping markdown code fences."""
    raw = (content or "").strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    if raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    cleaned = raw.strip()
    if not cleaned:
        return {}
    try:
        return json.loads(cleaned)
    except Exception:
        # Best-effort recovery: extract the first JSON object/array from the text.
        # This protects the pipeline from minor model formatting drift (preambles/epilogues).
        start_candidates = [i for i in (cleaned.find("{"), cleaned.find("[")) if i != -1]
        if not start_candidates:
            raise
        start = min(start_candidates)
        end_obj = cleaned.rfind("}")
        end_arr = cleaned.rfind("]")
        end_candidates = [i for i in (end_obj, end_arr) if i != -1]
        if not end_candidates:
            raise
        end = max(end_candidates)
        snippet = cleaned[start : end + 1].strip()
        return json.loads(snippet)


async def deep_agent_generate_json(
    *,
    estimate_id: str,
    agent_name: str,
    system_prompt: str,
    user_message: str,
    firestore_service: Optional[FirestoreService] = None,
    tools: Optional[List[Any]] = None,
    max_tokens: Optional[int] = None,
) -> Dict[str, Any]:
    """Invoke a Deep Agent and return `{content: dict, tokens_used: int}`.

    This is the drop-in replacement for `LLMService.generate_json`.
    """
    import time
    from datetime import datetime
    start_time = time.time()

    # Console log: LLM call starting
    print("\n" + "=" * 80)
    print(f"LLM CALL: {agent_name.upper()} AGENT")
    print("=" * 80)
    print(f"Estimate ID: {estimate_id}")
    print(f"Model: {settings.llm_model}")
    print(f"Max Tokens: {max_tokens or 'default'}")
    print("-" * 40)
    print("SYSTEM PROMPT:")
    print("-" * 40)
    print(_truncate(system_prompt, 800))
    print("-" * 40)
    print("USER MESSAGE:")
    print("-" * 40)
    print(_truncate(user_message, 1200))
    print("-" * 40)

    # Import here so tests can patch this module even when deepagents isn't installed.
    from deepagents import create_deep_agent

    firestore_service = firestore_service or FirestoreService()
    token_cb = _TokenCountingCallback()

    model = ChatOpenAI(
        model=settings.llm_model,
        temperature=settings.llm_temperature,
        api_key=settings.openai_api_key,
        max_tokens=max_tokens,
        callbacks=[token_cb],
    )

    backend = lambda _rt: FirestoreAgentFsBackend(  # noqa: E731
        db=firestore_service.db,
        estimate_id=estimate_id,
        agent_name=agent_name,
    )

    deep_agent = create_deep_agent(
        model=model,
        system_prompt=system_prompt,
        tools=tools or [],
        backend=backend,
    )

    try:
        result = await deep_agent.ainvoke(
            {
                "messages": [
                    ("user", user_message),
                ]
            }
        )

        # Deep agents returns a messages-like structure; most commonly a dict with "messages"
        # or the last message object directly. Be defensive.
        content_text: Optional[str] = None
        if isinstance(result, dict) and "messages" in result and result["messages"]:
            last = result["messages"][-1]
            content_text = getattr(last, "content", None) or (last.get("content") if isinstance(last, dict) else None)
        else:
            content_text = getattr(result, "content", None) if result is not None else None

        parsed = _parse_json_strict(content_text or "")

        elapsed_ms = int((time.time() - start_time) * 1000)
        tokens_used = int(token_cb.total_tokens or 0)

        # Console log: LLM response
        print("LLM RESPONSE:")
        print("-" * 40)
        print(_format_json_for_log(parsed, max_len=2000))
        print("-" * 40)
        print(f"Tokens Used: {tokens_used}")
        print(f"Duration: {elapsed_ms}ms")
        print("=" * 80 + "\n")

        # Save LLM log to Firestore for frontend visibility
        try:
            await _save_llm_log(
                firestore_service=firestore_service,
                estimate_id=estimate_id,
                agent_name=agent_name,
                log_data={
                    "type": "llm_call",
                    "agent": agent_name,
                    "model": settings.llm_model,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "durationMs": elapsed_ms,
                    "tokensUsed": tokens_used,
                    "systemPrompt": _truncate(system_prompt, 500),
                    "userMessage": _truncate(user_message, 1000),
                    "response": parsed,
                    "status": "success",
                }
            )
        except Exception as log_err:
            # Non-fatal: don't fail the agent if logging fails
            logger.debug("llm_log_save_failed", error=str(log_err))

        logger.info(
            "llm_call_completed",
            agent=agent_name,
            estimate_id=estimate_id,
            tokens_used=tokens_used,
            duration_ms=elapsed_ms,
        )

        return {"content": parsed, "tokens_used": tokens_used}

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        print("LLM ERROR:")
        print("-" * 40)
        print(f"Error: {str(e)}")
        print(f"Duration: {elapsed_ms}ms")
        print("=" * 80 + "\n")

        # Save error log to Firestore
        try:
            from datetime import datetime
            await _save_llm_log(
                firestore_service=firestore_service,
                estimate_id=estimate_id,
                agent_name=agent_name,
                log_data={
                    "type": "llm_call",
                    "agent": agent_name,
                    "model": settings.llm_model,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                    "durationMs": elapsed_ms,
                    "systemPrompt": _truncate(system_prompt, 500),
                    "userMessage": _truncate(user_message, 1000),
                    "error": str(e),
                    "status": "error",
                }
            )
        except Exception:
            pass

        logger.warning(
            "deep_agent_generate_json_failed",
            estimate_id=estimate_id,
            agent=agent_name,
            error=str(e),
        )
        raise


async def _save_llm_log(
    firestore_service: FirestoreService,
    estimate_id: str,
    agent_name: str,
    log_data: Dict[str, Any],
) -> None:
    """Save LLM call log to Firestore for frontend visibility.

    Saves to /estimates/{estimateId}/llmLogs/{logId}
    """
    import uuid
    try:
        log_id = f"{agent_name}-{uuid.uuid4().hex[:8]}"
        log_ref = (
            firestore_service.db
            .collection("estimates")
            .document(estimate_id)
            .collection("llmLogs")
            .document(log_id)
        )
        log_ref.set(log_data)
    except Exception as e:
        logger.debug("save_llm_log_failed", error=str(e))


