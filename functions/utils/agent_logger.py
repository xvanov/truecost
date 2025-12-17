"""Agent Output Logger for TrueCost Pipeline.

Provides highly visible, formatted logging for agent outputs
with distinctive visual markers that stand out in log streams.
"""

import json
import structlog
from typing import Dict, Any, Optional
from datetime import datetime

logger = structlog.get_logger()

# Visual markers for different log types
BANNER_WIDTH = 80
AGENT_BANNER_CHAR = "═"
SCORER_BANNER_CHAR = "─"
CRITIC_BANNER_CHAR = "░"
PIPELINE_BANNER_CHAR = "█"


def _create_banner(char: str, text: str, width: int = BANNER_WIDTH) -> str:
    """Create a centered banner with given character."""
    text_with_spaces = f" {text} "
    padding = (width - len(text_with_spaces)) // 2
    return char * padding + text_with_spaces + char * (width - padding - len(text_with_spaces))


def _format_json(data: Dict[str, Any], indent: int = 2) -> str:
    """Format dictionary as pretty JSON string."""
    try:
        return json.dumps(data, indent=indent, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(data)


def _truncate_large_values(data: Dict[str, Any], max_length: int = 500) -> Dict[str, Any]:
    """Truncate large string values for display purposes."""
    if not isinstance(data, dict):
        return data

    result = {}
    for key, value in data.items():
        if isinstance(value, str) and len(value) > max_length:
            result[key] = value[:max_length] + f"... [truncated {len(value) - max_length} chars]"
        elif isinstance(value, dict):
            result[key] = _truncate_large_values(value, max_length)
        elif isinstance(value, list) and len(value) > 10:
            result[key] = value[:10] + [f"... and {len(value) - 10} more items"]
        else:
            result[key] = value
    return result


def log_pipeline_start(estimate_id: str, agent_count: int) -> None:
    """Log pipeline start with prominent banner."""
    timestamp = datetime.utcnow().isoformat()

    print("\n")
    print(PIPELINE_BANNER_CHAR * BANNER_WIDTH)
    print(_create_banner(PIPELINE_BANNER_CHAR, "TRUECOST DEEP PIPELINE STARTED"))
    print(PIPELINE_BANNER_CHAR * BANNER_WIDTH)
    print(f"║ Estimate ID : {estimate_id}")
    print(f"║ Timestamp   : {timestamp}")
    print(f"║ Agents      : {agent_count}")
    print(PIPELINE_BANNER_CHAR * BANNER_WIDTH)
    print("\n")

    logger.info(
        "pipeline_start_logged",
        estimate_id=estimate_id,
        agent_count=agent_count
    )


def log_pipeline_complete(
    estimate_id: str,
    completed_agents: list,
    duration_ms: int,
    total_tokens: int
) -> None:
    """Log pipeline completion with summary."""
    timestamp = datetime.utcnow().isoformat()

    print("\n")
    print(PIPELINE_BANNER_CHAR * BANNER_WIDTH)
    print(_create_banner(PIPELINE_BANNER_CHAR, "✓ PIPELINE COMPLETED SUCCESSFULLY"))
    print(PIPELINE_BANNER_CHAR * BANNER_WIDTH)
    print(f"║ Estimate ID      : {estimate_id}")
    print(f"║ Timestamp        : {timestamp}")
    print(f"║ Duration         : {duration_ms:,} ms ({duration_ms / 1000:.2f}s)")
    print(f"║ Total Tokens     : {total_tokens:,}")
    print(f"║ Completed Agents : {', '.join(completed_agents)}")
    print(PIPELINE_BANNER_CHAR * BANNER_WIDTH)
    print("\n")

    logger.info(
        "pipeline_complete_logged",
        estimate_id=estimate_id,
        duration_ms=duration_ms,
        total_tokens=total_tokens
    )


def log_pipeline_failed(
    estimate_id: str,
    failed_agent: str,
    error: str,
    completed_agents: list
) -> None:
    """Log pipeline failure with details."""
    timestamp = datetime.utcnow().isoformat()

    print("\n")
    print("!" * BANNER_WIDTH)
    print(_create_banner("!", "✗ PIPELINE FAILED"))
    print("!" * BANNER_WIDTH)
    print(f"║ Estimate ID      : {estimate_id}")
    print(f"║ Timestamp        : {timestamp}")
    print(f"║ Failed Agent     : {failed_agent}")
    print(f"║ Error            : {error}")
    print(f"║ Completed Before : {', '.join(completed_agents) if completed_agents else 'None'}")
    print("!" * BANNER_WIDTH)
    print("\n")

    logger.error(
        "pipeline_failed_logged",
        estimate_id=estimate_id,
        failed_agent=failed_agent,
        error=error
    )


def log_agent_start(agent_name: str, estimate_id: str, retry_attempt: int = 0) -> None:
    """Log when an agent starts processing."""
    retry_info = f" (RETRY #{retry_attempt})" if retry_attempt > 0 else ""

    print("\n")
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)
    print(_create_banner(AGENT_BANNER_CHAR, f"▶ AGENT: {agent_name.upper()}{retry_info}"))
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)
    print(f"║ Estimate ID  : {estimate_id}")
    print(f"║ Status       : STARTED")
    print(f"║ Retry        : {retry_attempt}")
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)

    logger.info(
        "agent_start_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        retry_attempt=retry_attempt
    )


def log_agent_output(
    agent_name: str,
    estimate_id: str,
    output: Dict[str, Any],
    duration_ms: int = 0,
    tokens_used: int = 0,
    truncate: bool = True
) -> None:
    """Log agent output with full formatted data."""
    timestamp = datetime.utcnow().isoformat()

    # Optionally truncate large values for display
    display_output = _truncate_large_values(output) if truncate else output
    formatted_output = _format_json(display_output)

    print("\n")
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)
    print(_create_banner(AGENT_BANNER_CHAR, f"✓ AGENT OUTPUT: {agent_name.upper()}"))
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)
    print(f"║ Estimate ID  : {estimate_id}")
    print(f"║ Timestamp    : {timestamp}")
    print(f"║ Duration     : {duration_ms:,} ms")
    print(f"║ Tokens Used  : {tokens_used:,}")
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)
    print("║ OUTPUT DATA:")
    print(AGENT_BANNER_CHAR * BANNER_WIDTH)

    # Print each line of the formatted output with margin
    for line in formatted_output.split('\n'):
        print(f"  {line}")

    print(AGENT_BANNER_CHAR * BANNER_WIDTH)
    print("\n")

    # Also log structured for log aggregation systems
    logger.info(
        "agent_output_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        duration_ms=duration_ms,
        tokens_used=tokens_used,
        output_keys=list(output.keys()) if isinstance(output, dict) else None
    )


def log_scorer_result(
    agent_name: str,
    estimate_id: str,
    score: int,
    passed: bool,
    breakdown: list,
    feedback: str = ""
) -> None:
    """Log scorer agent results."""
    status_icon = "✓ PASSED" if passed else "✗ FAILED"

    print("\n")
    print(SCORER_BANNER_CHAR * BANNER_WIDTH)
    print(_create_banner(SCORER_BANNER_CHAR, f"SCORER: {agent_name.upper()} → {status_icon}"))
    print(SCORER_BANNER_CHAR * BANNER_WIDTH)
    print(f"│ Estimate ID  : {estimate_id}")
    print(f"│ Score        : {score}/100 (threshold: 80)")
    print(f"│ Status       : {'PASSED' if passed else 'FAILED - NEEDS RETRY'}")
    print(SCORER_BANNER_CHAR * BANNER_WIDTH)

    if breakdown:
        print("│ SCORE BREAKDOWN:")
        for item in breakdown:
            if isinstance(item, dict):
                criterion = item.get('criterion', 'Unknown')
                criterion_score = item.get('score', 0)
                weight = item.get('weight', 0)
                print(f"│   • {criterion}: {criterion_score}/100 (weight: {weight})")
            else:
                print(f"│   • {item}")

    if feedback:
        print(SCORER_BANNER_CHAR * BANNER_WIDTH)
        print("│ FEEDBACK:")
        for line in feedback.split('\n'):
            print(f"│   {line}")

    print(SCORER_BANNER_CHAR * BANNER_WIDTH)
    print("\n")

    logger.info(
        "scorer_result_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        score=score,
        passed=passed
    )


def log_critic_feedback(
    agent_name: str,
    estimate_id: str,
    feedback: Dict[str, Any]
) -> None:
    """Log critic agent feedback."""
    print("\n")
    print(CRITIC_BANNER_CHAR * BANNER_WIDTH)
    print(_create_banner(CRITIC_BANNER_CHAR, f"CRITIC FEEDBACK: {agent_name.upper()}"))
    print(CRITIC_BANNER_CHAR * BANNER_WIDTH)
    print(f"░ Estimate ID  : {estimate_id}")
    print(f"░ Score Given  : {feedback.get('score', 'N/A')}/100")
    print(CRITIC_BANNER_CHAR * BANNER_WIDTH)

    # Issues
    issues = feedback.get('issues', [])
    if issues:
        print("░ ISSUES IDENTIFIED:")
        for issue in issues:
            print(f"░   ✗ {issue}")

    # Why wrong
    why_wrong = feedback.get('why_wrong', '')
    if why_wrong:
        print(CRITIC_BANNER_CHAR * BANNER_WIDTH)
        print("░ WHY IT WAS WRONG:")
        for line in str(why_wrong).split('\n'):
            print(f"░   {line}")

    # How to fix
    how_to_fix = feedback.get('how_to_fix', [])
    if how_to_fix:
        print(CRITIC_BANNER_CHAR * BANNER_WIDTH)
        print("░ HOW TO FIX:")
        for fix in how_to_fix:
            print(f"░   → {fix}")

    # Suggestions
    suggestions = feedback.get('suggestions', [])
    if suggestions:
        print(CRITIC_BANNER_CHAR * BANNER_WIDTH)
        print("░ SUGGESTIONS:")
        for suggestion in suggestions:
            print(f"░   💡 {suggestion}")

    print(CRITIC_BANNER_CHAR * BANNER_WIDTH)
    print("\n")

    logger.info(
        "critic_feedback_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        issues_count=len(issues),
        has_fixes=bool(how_to_fix)
    )


def log_agent_error(
    agent_name: str,
    estimate_id: str,
    error: str,
    retry_attempt: int = 0
) -> None:
    """Log agent error."""
    print("\n")
    print("!" * BANNER_WIDTH)
    print(_create_banner("!", f"✗ AGENT ERROR: {agent_name.upper()}"))
    print("!" * BANNER_WIDTH)
    print(f"! Estimate ID  : {estimate_id}")
    print(f"! Retry        : {retry_attempt}")
    print(f"! Error        : {error}")
    print("!" * BANNER_WIDTH)
    print("\n")

    logger.error(
        "agent_error_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        error=error,
        retry_attempt=retry_attempt
    )


def log_agent_retry(
    agent_name: str,
    estimate_id: str,
    retry_number: int,
    previous_score: int
) -> None:
    """Log when an agent is being retried."""
    print("\n")
    print("~" * BANNER_WIDTH)
    print(_create_banner("~", f"↻ RETRY #{retry_number}: {agent_name.upper()}"))
    print("~" * BANNER_WIDTH)
    print(f"~ Estimate ID    : {estimate_id}")
    print(f"~ Previous Score : {previous_score}/100")
    print(f"~ Retry Number   : {retry_number}")
    print(f"~ Action         : Re-running with critic feedback")
    print("~" * BANNER_WIDTH)
    print("\n")

    logger.info(
        "agent_retry_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        retry_number=retry_number,
        previous_score=previous_score
    )


def log_input_context(
    agent_name: str,
    estimate_id: str,
    input_data: Dict[str, Any],
    truncate: bool = True
) -> None:
    """Log the input context being passed to an agent."""
    display_data = _truncate_large_values(input_data) if truncate else input_data

    # Show what keys are available in the context
    context_keys = list(input_data.keys()) if isinstance(input_data, dict) else []

    print("\n")
    print("·" * BANNER_WIDTH)
    print(_create_banner("·", f"INPUT CONTEXT: {agent_name.upper()}"))
    print("·" * BANNER_WIDTH)
    print(f"· Estimate ID    : {estimate_id}")
    print(f"· Context Keys   : {', '.join(context_keys)}")
    print("·" * BANNER_WIDTH)

    # Show summary of each context key
    for key in context_keys:
        value = input_data.get(key)
        if isinstance(value, dict):
            print(f"·   {key}: <dict with {len(value)} keys>")
        elif isinstance(value, list):
            print(f"·   {key}: <list with {len(value)} items>")
        elif isinstance(value, str):
            preview = value[:50] + "..." if len(value) > 50 else value
            print(f"·   {key}: \"{preview}\"")
        else:
            print(f"·   {key}: {value}")

    print("·" * BANNER_WIDTH)
    print("\n")

    logger.info(
        "input_context_logged",
        agent=agent_name,
        estimate_id=estimate_id,
        context_keys=context_keys
    )
