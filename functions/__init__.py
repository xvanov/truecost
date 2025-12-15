"""TrueCost Deep Agent Pipeline - Cloud Functions.

This package contains the Python Cloud Functions for the TrueCost
construction estimation pipeline using LangChain Deep Agents and A2A Protocol.

Architecture:
- 6 Primary Agents: Location, Scope, Cost, Risk, Timeline, Final
- 6 Scorer Agents: Objective scoring (0-100) for each primary
- 6 Critic Agents: Qualitative feedback when score < 80
- 1 Orchestrator: Coordinates all agents with retry logic
"""

__version__ = "1.0.0"



# TrueCost Python Cloud Functions

