"""
Agent Tools module for TrueCost.

Provides LangChain-compatible tools for LLM agents to access data services.
These tools follow the OpenAI function calling schema for compatibility
with LangChain/LangGraph agent pipelines.

Usage:
    from tools import DATA_TOOLS

    # Add to agent's tool list
    agent = create_react_agent(
        llm=model,
        tools=[...existing_tools, *DATA_TOOLS],
    )

References:
- Story 4.5: Real Data Integration (AC 4.5.10-4.5.16)
- LangChain Tools: https://python.langchain.com/docs/modules/agents/tools
"""

from .data_tools import (
    get_labor_rates,
    get_weather_factors,
    get_location_factors,
)
from .simulation_tools import run_monte_carlo
from .price_tools import get_material_prices_tool

# Export all data tools for agent registration (Task 4.7)
DATA_TOOLS = [
    get_labor_rates,
    get_weather_factors,
    get_location_factors,
    run_monte_carlo,
    get_material_prices_tool,
]

__all__ = [
    "DATA_TOOLS",
    "get_labor_rates",
    "get_weather_factors",
    "get_location_factors",
    "run_monte_carlo",
    "get_material_prices_tool",
]
