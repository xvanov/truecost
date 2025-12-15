"""TrueCost Deep Agents.

This package contains all agent implementations:
- Base classes for A2A-compatible agents
- Primary agents (Location, Scope, Cost, Risk, Timeline, Final)
- Scorer agents (objective 0-100 scoring)
- Critic agents (qualitative feedback)
- Orchestrator (pipeline coordination)
"""

from agents.base_agent import BaseA2AAgent

__all__ = ["BaseA2AAgent"]




