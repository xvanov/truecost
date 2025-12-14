"""A2A Agent Cards Registry for TrueCost.

Contains metadata for all 19 agents in the pipeline:
- 6 Primary agents
- 6 Scorer agents
- 6 Critic agents
- 1 Orchestrator
"""

from typing import Dict, Any

# Primary Agents - Do the actual work
PRIMARY_AGENT_CARDS: Dict[str, Dict[str, Any]] = {
    "location": {
        "name": "TrueCost Location Agent",
        "description": "Analyzes location factors for construction estimates including labor rates, permits, and regional adjustments",
        "version": "1.0.0",
        "capabilities": ["location-analysis", "labor-rates", "permit-costs", "weather-factors"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/location"
    },
    "scope": {
        "name": "TrueCost Scope Agent",
        "description": "Enriches Bill of Quantities with cost codes and validates completeness",
        "version": "1.0.0",
        "capabilities": ["boq-enrichment", "cost-codes", "validation", "csi-mapping"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/scope"
    },
    "code_compliance": {
        "name": "TrueCost Code Compliance Agent",
        "description": "Generates ICC (IBC/IRC/IECC family) code-related warnings for the project scope and location",
        "version": "1.0.0",
        "capabilities": ["icc-codes", "code-warnings", "compliance-considerations"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/code_compliance"
    },
    "cost": {
        "name": "TrueCost Cost Agent",
        "description": "Calculates material, labor, and equipment costs with location adjustments",
        "version": "1.0.0",
        "capabilities": ["cost-calculation", "pricing", "labor-estimation", "equipment-costs"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/cost"
    },
    "risk": {
        "name": "TrueCost Risk Agent",
        "description": "Performs Monte Carlo simulation for risk analysis and contingency calculation",
        "version": "1.0.0",
        "capabilities": ["monte-carlo", "risk-assessment", "contingency", "uncertainty-modeling"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/risk"
    },
    "timeline": {
        "name": "TrueCost Timeline Agent",
        "description": "Generates project timeline with task dependencies and critical path analysis",
        "version": "1.0.0",
        "capabilities": ["timeline-generation", "task-sequencing", "critical-path", "duration-estimation"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/timeline"
    },
    "final": {
        "name": "TrueCost Final Agent",
        "description": "Synthesizes final estimate with executive summary and recommendations",
        "version": "1.0.0",
        "capabilities": ["synthesis", "reporting", "recommendations", "summary-generation"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/final"
    }
}

# Scorer Agents - Objective numerical scoring (0-100)
SCORER_AGENT_CARDS: Dict[str, Dict[str, Any]] = {
    "location_scorer": {
        "name": "TrueCost Location Scorer",
        "description": "Objectively scores location agent output for completeness and accuracy",
        "version": "1.0.0",
        "capabilities": ["scoring", "validation", "quality-assessment"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/location_scorer",
        "scores": "location"
    },
    "scope_scorer": {
        "name": "TrueCost Scope Scorer",
        "description": "Objectively scores scope agent output for BoQ completeness and cost code accuracy",
        "version": "1.0.0",
        "capabilities": ["scoring", "validation", "cost-code-validation"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/scope_scorer",
        "scores": "scope"
    },
    "code_compliance_scorer": {
        "name": "TrueCost Code Compliance Scorer",
        "description": "Objectively scores code compliance warnings output for structure/completeness",
        "version": "1.0.0",
        "capabilities": ["scoring", "validation", "quality-assessment"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/code_compliance_scorer",
        "scores": "code_compliance"
    },
    "cost_scorer": {
        "name": "TrueCost Cost Scorer",
        "description": "Objectively scores cost calculations for mathematical accuracy and completeness",
        "version": "1.0.0",
        "capabilities": ["scoring", "math-verification", "rate-validation"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/cost_scorer",
        "scores": "cost"
    },
    "risk_scorer": {
        "name": "TrueCost Risk Scorer",
        "description": "Objectively scores risk analysis for statistical validity and coverage",
        "version": "1.0.0",
        "capabilities": ["scoring", "statistical-check", "risk-validation"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/risk_scorer",
        "scores": "risk"
    },
    "timeline_scorer": {
        "name": "TrueCost Timeline Scorer",
        "description": "Objectively scores timeline for realistic durations and logical dependencies",
        "version": "1.0.0",
        "capabilities": ["scoring", "timeline-validation", "dependency-check"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/timeline_scorer",
        "scores": "timeline"
    },
    "final_scorer": {
        "name": "TrueCost Final Scorer",
        "description": "Objectively scores final estimate for consistency, completeness, and quality",
        "version": "1.0.0",
        "capabilities": ["scoring", "consistency-check", "completeness-check"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/final_scorer",
        "scores": "final"
    }
}

# Critic Agents - Qualitative feedback when score < 80
CRITIC_AGENT_CARDS: Dict[str, Dict[str, Any]] = {
    "location_critic": {
        "name": "TrueCost Location Critic",
        "description": "Provides qualitative feedback on location agent output issues and fixes",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "improvement-suggestions"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/location_critic",
        "critiques": "location"
    },
    "scope_critic": {
        "name": "TrueCost Scope Critic",
        "description": "Provides qualitative feedback on scope/BoQ issues and completeness gaps",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "boq-improvement"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/scope_critic",
        "critiques": "scope"
    },
    "code_compliance_critic": {
        "name": "TrueCost Code Compliance Critic",
        "description": "Provides qualitative feedback on ICC code warning quality and completeness",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "compliance-improvement"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/code_compliance_critic",
        "critiques": "code_compliance"
    },
    "cost_critic": {
        "name": "TrueCost Cost Critic",
        "description": "Provides qualitative feedback on cost calculation issues and pricing errors",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "cost-improvement"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/cost_critic",
        "critiques": "cost"
    },
    "risk_critic": {
        "name": "TrueCost Risk Critic",
        "description": "Provides qualitative feedback on risk analysis gaps and methodology issues",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "risk-improvement"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/risk_critic",
        "critiques": "risk"
    },
    "timeline_critic": {
        "name": "TrueCost Timeline Critic",
        "description": "Provides qualitative feedback on timeline issues and scheduling problems",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "timeline-improvement"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/timeline_critic",
        "critiques": "timeline"
    },
    "final_critic": {
        "name": "TrueCost Final Critic",
        "description": "Provides qualitative feedback on final estimate consistency and presentation",
        "version": "1.0.0",
        "capabilities": ["critique", "feedback", "final-improvement"],
        "input_modes": ["json"],
        "output_modes": ["json"],
        "endpoint": "/a2a/final_critic",
        "critiques": "final"
    }
}

# Orchestrator Agent
ORCHESTRATOR_CARD: Dict[str, Any] = {
    "name": "TrueCost Orchestrator",
    "description": "Coordinates the deep agent pipeline with scorer/critic validation flow",
    "version": "1.0.0",
    "capabilities": [
        "pipeline-coordination",
        "agent-sequencing",
        "retry-management",
        "progress-tracking"
    ],
    "input_modes": ["json"],
    "output_modes": ["json"],
    "endpoint": "/a2a/orchestrator"
}

# Combined registry for all agents
AGENT_CARDS: Dict[str, Dict[str, Any]] = {
    **PRIMARY_AGENT_CARDS,
    **SCORER_AGENT_CARDS,
    **CRITIC_AGENT_CARDS,
    "orchestrator": ORCHESTRATOR_CARD
}

# Agent sequence for pipeline execution
# NOTE: `code_compliance` runs after scope so it can use the structured scope output.
AGENT_SEQUENCE = ["location", "scope", "code_compliance", "cost", "risk", "timeline", "final"]

# Helper functions
def get_agent_card(agent_name: str) -> Dict[str, Any]:
    """Get agent card by name.
    
    Args:
        agent_name: Name of the agent.
        
    Returns:
        Agent card dictionary or empty dict if not found.
    """
    return AGENT_CARDS.get(agent_name, {})


def get_primary_agents() -> list:
    """Get list of primary agent names."""
    return list(PRIMARY_AGENT_CARDS.keys())


def get_scorer_for_primary(primary_name: str) -> str:
    """Get scorer agent name for a primary agent."""
    return f"{primary_name}_scorer"


def get_critic_for_primary(primary_name: str) -> str:
    """Get critic agent name for a primary agent."""
    return f"{primary_name}_critic"


def get_all_endpoints() -> Dict[str, str]:
    """Get all agent endpoints.
    
    Returns:
        Dict mapping agent names to endpoint paths.
    """
    return {
        name: card.get("endpoint", f"/a2a/{name}")
        for name, card in AGENT_CARDS.items()
    }



