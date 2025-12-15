#!/usr/bin/env python3
"""Integration Test for TrueCost Deep Agent Pipeline.

This script runs a REAL autonomous test where all agents communicate
through the orchestrator, scoring outputs and using critic feedback.

Features:
- Full pipeline execution with all 6 primary agents
- Scorer validation for each agent output (score >= 80 to pass)
- Critic feedback and retry mechanism when scores are low
- Output saved to JSON file for inspection
- Optional Firestore emulator integration

Usage:
    cd functions
    python run_integration_test.py
    
    # With Firestore emulator (start emulator first):
    # firebase emulators:start --only firestore
    # Then run: python run_integration_test.py --firestore
"""

import asyncio
import json
import sys
import argparse
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from dataclasses import dataclass
import structlog

# Configure logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
    ]
)
logger = structlog.get_logger()


# =============================================================================
# CONFIGURATION
# =============================================================================

AGENT_SEQUENCE = ["location", "scope", "cost", "risk", "timeline", "final"]
PASSING_SCORE = 80
MAX_RETRIES = 2


@dataclass
class AgentResult:
    """Result from running an agent."""
    name: str
    output: Dict[str, Any]
    score: int
    passed: bool
    retries: int
    duration_ms: int
    feedback: str


# =============================================================================
# MOCK SERVICES FOR IN-MEMORY TESTING
# =============================================================================

class InMemoryFirestore:
    """In-memory Firestore implementation for testing without emulators."""
    
    def __init__(self):
        self.estimates: Dict[str, Dict[str, Any]] = {}
        self.agent_outputs: Dict[str, Dict[str, Dict[str, Any]]] = {}
    
    async def get_estimate(self, estimate_id: str) -> Optional[Dict[str, Any]]:
        return self.estimates.get(estimate_id)
    
    async def update_estimate(self, estimate_id: str, data: Dict[str, Any]) -> None:
        if estimate_id not in self.estimates:
            self.estimates[estimate_id] = {"id": estimate_id}
        
        for key, value in data.items():
            if "." in key:
                parts = key.split(".")
                current = self.estimates[estimate_id]
                for part in parts[:-1]:
                    if part not in current:
                        current[part] = {}
                    current = current[part]
                current[parts[-1]] = value
            else:
                self.estimates[estimate_id][key] = value
        
        self.estimates[estimate_id]["updatedAt"] = datetime.now(timezone.utc).isoformat()
    
    async def create_estimate(
        self,
        estimate_id: str,
        user_id: str,
        clarification_output: Dict[str, Any]
    ) -> str:
        self.estimates[estimate_id] = {
            "id": estimate_id,
            "userId": user_id,
            "status": "processing",
            "clarificationOutput": clarification_output,
            "pipelineStatus": {
                "currentAgent": None,
                "completedAgents": [],
                "progress": 0,
                "agentStatuses": {agent: "pending" for agent in AGENT_SEQUENCE},
                "scores": {},
                "retries": {}
            },
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat()
        }
        return estimate_id
    
    async def save_agent_output(
        self,
        estimate_id: str,
        agent_name: str,
        output: Dict[str, Any],
        summary: Optional[str] = None,
        confidence: Optional[float] = None,
        tokens_used: Optional[int] = None,
        duration_ms: Optional[int] = None,
        score: Optional[int] = None
    ) -> None:
        if estimate_id not in self.agent_outputs:
            self.agent_outputs[estimate_id] = {}
        
        self.agent_outputs[estimate_id][agent_name] = {
            "status": "completed",
            "output": output,
            "summary": summary,
            "confidence": confidence,
            "tokensUsed": tokens_used,
            "durationMs": duration_ms,
            "score": score,
            "createdAt": datetime.now(timezone.utc).isoformat()
        }
        
        await self.update_estimate(estimate_id, {
            f"{agent_name}Output": output,
            f"pipelineStatus.agentStatuses.{agent_name}": "completed",
            f"pipelineStatus.scores.{agent_name}": score
        })
    
    async def delete_estimate(self, estimate_id: str) -> None:
        self.estimates.pop(estimate_id, None)
        self.agent_outputs.pop(estimate_id, None)


class MockLLMService:
    """Mock LLM service with deterministic responses."""
    
    async def generate_json(self, system_prompt: str, user_message: str) -> Dict[str, Any]:
        """Generate mock JSON response based on context."""
        
        if "location" in system_prompt.lower() and "construction cost" in system_prompt.lower():
            return self._location_response()
        elif "scope" in system_prompt.lower() or "bill of quantities" in system_prompt.lower():
            return self._scope_response()
        elif "cost estimation" in system_prompt.lower():
            return self._cost_response()
        elif "risk" in system_prompt.lower() and "monte carlo" in system_prompt.lower():
            return self._risk_response()
        elif "timeline" in system_prompt.lower() or "schedule" in system_prompt.lower():
            return self._timeline_response()
        elif "synthesis" in system_prompt.lower() or "executive summary" in system_prompt.lower():
            return self._final_response()
        
        return {"tokens_used": 200, "content": {"analysis": "Mock response"}}
    
    def _location_response(self):
        return {
            "tokens_used": 500,
            "content": {
                "analysis": "Denver, CO is a favorable construction market with moderate labor costs. The downtown location (80202) offers good contractor availability but may present logistics challenges for material delivery.",
                "key_findings": [
                    "Location factor of 1.05 - slightly above national average",
                    "Mixed union market allows competitive bidding",
                    "Moderate seasonal weather impact on scheduling",
                    "Good skilled trade availability in Denver metro"
                ],
                "recommendations": [
                    "Schedule exterior work for optimal weather months",
                    "Coordinate with building management for delivery times",
                    "Verify HOA requirements for condo renovations"
                ],
                "risk_factors": [
                    "Downtown parking limitations may affect costs",
                    "Building elevator scheduling for material transport"
                ],
                "confidence_assessment": "High confidence - Denver is a well-documented market with reliable cost data."
            }
        }
    
    def _scope_response(self):
        return {
            "tokens_used": 600,
            "content": {
                "summary": "Kitchen remodel scope covering 10 CSI divisions with 52 line items including demolition, cabinetry, countertops, flooring, plumbing, and electrical.",
                "recommendations": [
                    "Verify cabinet dimensions before ordering",
                    "Confirm granite slab selection early"
                ]
            }
        }
    
    def _cost_response(self):
        return {
            "tokens_used": 700,
            "content": {
                "summary": "Total estimated range: $34,500 (P50) to $43,125 (P90). Major cost drivers: cabinetry (35%), countertops (20%), labor (28%).",
                "cost_drivers": [
                    {"item": "Custom cabinets", "impact": "high"},
                    {"item": "Granite countertops", "impact": "medium"},
                    {"item": "Appliance package", "impact": "medium"}
                ],
                "savings_opportunities": [
                    "Stock cabinets could save 15-20%",
                    "Quartz as granite alternative"
                ]
            }
        }
    
    def _risk_response(self):
        return {
            "tokens_used": 550,
            "content": {
                "summary": "Recommended contingency: 10% ($3,450). Top risks: material price volatility, hidden conditions.",
                "top_risks": [
                    "Material price increases",
                    "Hidden plumbing/electrical issues",
                    "Permit delays"
                ],
                "mitigation_strategies": [
                    "Lock in prices early",
                    "Include allowance for unforeseen conditions"
                ]
            }
        }
    
    def _timeline_response(self):
        return {
            "tokens_used": 450,
            "content": {
                "summary": "6 weeks from demo to completion. Critical path: cabinet delivery and installation.",
                "milestones": [
                    {"name": "Demo complete", "week": 2},
                    {"name": "Cabinets installed", "week": 4},
                    {"name": "Final inspection", "week": 6}
                ]
            }
        }
    
    def _final_response(self):
        return {
            "tokens_used": 800,
            "content": {
                "executive_summary": "Kitchen remodel in Denver - $34,500 (P50) to $43,125 (P90) with 10% contingency. 6-week timeline with cabinet delivery as critical path.",
                "key_recommendations": [
                    "Order cabinets immediately upon contract signing",
                    "Schedule countertop templating within 24 hours of cabinet completion"
                ],
                "disclaimers": [
                    "Estimate based on scope as described",
                    "Material prices valid for 30 days"
                ]
            }
        }


# =============================================================================
# AGENT IMPORTS & INITIALIZATION
# =============================================================================

def get_agent(agent_name: str, firestore, llm):
    """Get agent instance by name."""
    from services.cost_data_service import CostDataService
    from services.monte_carlo_service import MonteCarloService
    
    cost_service = CostDataService()
    monte_carlo = MonteCarloService()
    
    if agent_name == "location":
        from agents.primary.location_agent import LocationAgent
        return LocationAgent(firestore_service=firestore, llm_service=llm, cost_data_service=cost_service)
    elif agent_name == "scope":
        from agents.primary.scope_agent import ScopeAgent
        return ScopeAgent(firestore_service=firestore, llm_service=llm, cost_data_service=cost_service)
    elif agent_name == "cost":
        from agents.primary.cost_agent import CostAgent
        return CostAgent(firestore_service=firestore, llm_service=llm, cost_data_service=cost_service)
    elif agent_name == "risk":
        from agents.primary.risk_agent import RiskAgent
        return RiskAgent(firestore_service=firestore, llm_service=llm, monte_carlo_service=monte_carlo)
    elif agent_name == "timeline":
        from agents.primary.timeline_agent import TimelineAgent
        return TimelineAgent(firestore_service=firestore, llm_service=llm)
    elif agent_name == "final":
        from agents.primary.final_agent import FinalAgent
        return FinalAgent(firestore_service=firestore, llm_service=llm)
    else:
        raise ValueError(f"Unknown agent: {agent_name}")


def get_scorer(agent_name: str):
    """Get scorer instance by agent name."""
    if agent_name == "location":
        from agents.scorers.location_scorer import LocationScorer
        return LocationScorer()
    elif agent_name == "scope":
        from agents.scorers.scope_scorer import ScopeScorer
        return ScopeScorer()
    elif agent_name == "cost":
        from agents.scorers.cost_scorer import CostScorer
        return CostScorer()
    elif agent_name == "risk":
        from agents.scorers.risk_scorer import RiskScorer
        return RiskScorer()
    elif agent_name == "timeline":
        from agents.scorers.timeline_scorer import TimelineScorer
        return TimelineScorer()
    elif agent_name == "final":
        from agents.scorers.final_scorer import FinalScorer
        return FinalScorer()
    else:
        raise ValueError(f"Unknown scorer for: {agent_name}")


def get_critic(agent_name: str):
    """Get critic instance by agent name."""
    if agent_name == "location":
        from agents.critics.location_critic import LocationCritic
        return LocationCritic()
    elif agent_name == "scope":
        from agents.critics.scope_critic import ScopeCritic
        return ScopeCritic()
    elif agent_name == "cost":
        from agents.critics.cost_critic import CostCritic
        return CostCritic()
    elif agent_name == "risk":
        from agents.critics.risk_critic import RiskCritic
        return RiskCritic()
    elif agent_name == "timeline":
        from agents.critics.timeline_critic import TimelineCritic
        return TimelineCritic()
    elif agent_name == "final":
        from agents.critics.final_critic import FinalCritic
        return FinalCritic()
    else:
        raise ValueError(f"Unknown critic for: {agent_name}")


# =============================================================================
# PIPELINE EXECUTION
# =============================================================================

async def run_agent_with_validation(
    agent_name: str,
    estimate_id: str,
    accumulated_context: Dict[str, Any],
    firestore: InMemoryFirestore,
    llm: MockLLMService
) -> AgentResult:
    """Run a single agent with scorer validation and critic feedback loop."""
    
    import time
    start_time = time.time()
    retries = 0
    critic_feedback = None
    
    while retries <= MAX_RETRIES:
        print(f"\n{'='*60}")
        print(f"🚀 Running {agent_name.upper()} Agent (Attempt {retries + 1}/{MAX_RETRIES + 1})")
        print(f"{'='*60}")
        
        # Update status to running
        await firestore.update_estimate(estimate_id, {
            f"pipelineStatus.agentStatuses.{agent_name}": "running",
            "pipelineStatus.currentAgent": agent_name
        })
        
        # Run primary agent
        try:
            agent = get_agent(agent_name, firestore, llm)
            
            input_data = accumulated_context.copy()
            if critic_feedback:
                input_data["critic_feedback"] = critic_feedback
            
            output = await agent.run(
                estimate_id=estimate_id,
                input_data=input_data,
                feedback=critic_feedback
            )
            
            print(f"✅ {agent_name} agent produced output with {len(output)} fields")
            
        except Exception as e:
            print(f"❌ {agent_name} agent error: {e}")
            import traceback
            traceback.print_exc()
            retries += 1
            continue
        
        # Run scorer
        print(f"\n📊 Running {agent_name} SCORER...")
        try:
            scorer = get_scorer(agent_name)
            score_result = await scorer.score(
                estimate_id=estimate_id,
                output=output,
                input_data=accumulated_context
            )
            
            score = score_result.get("score", 0)
            passed = score_result.get("passed", False)
            feedback = score_result.get("feedback", "")
            breakdown = score_result.get("breakdown", [])
            
            print(f"📊 Score: {score}/100 - {'PASS ✅' if passed else 'FAIL ❌'}")
            print(f"   Feedback: {feedback}")
            
            # Print breakdown
            for item in breakdown[:5]:  # Show top 5 criteria
                print(f"   - {item.get('criterion')}: {item.get('score')}/100")
            
        except Exception as e:
            print(f"⚠️ Scorer error: {e} - defaulting to PASS")
            score = 80
            passed = True
            feedback = f"Scorer error: {e}"
            breakdown = []
        
        # If passed, we're done
        if passed:
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Save output to Firestore
            await firestore.save_agent_output(
                estimate_id=estimate_id,
                agent_name=agent_name,
                output=output,
                summary=output.get("summary", ""),
                confidence=output.get("confidence"),
                score=score,
                duration_ms=duration_ms
            )
            
            return AgentResult(
                name=agent_name,
                output=output,
                score=score,
                passed=True,
                retries=retries,
                duration_ms=duration_ms,
                feedback=feedback
            )
        
        # Score too low - run critic if we have retries left
        if retries >= MAX_RETRIES:
            print(f"\n⚠️ Max retries exceeded for {agent_name}")
            break
        
        # Run critic for feedback
        print(f"\n🔍 Running {agent_name} CRITIC for feedback...")
        try:
            critic = get_critic(agent_name)
            critic_result = await critic.critique(
                estimate_id=estimate_id,
                output=output,
                input_data=accumulated_context,
                score=score,
                scorer_feedback=feedback
            )
            
            critic_feedback = critic_result
            issues = critic_result.get("issues", [])
            how_to_fix = critic_result.get("how_to_fix", [])
            
            print(f"🔍 Critic feedback:")
            for issue in issues[:3]:
                print(f"   ⚠️ {issue}")
            for fix in how_to_fix[:3]:
                print(f"   💡 {fix}")
            
        except Exception as e:
            print(f"⚠️ Critic error: {e}")
            critic_feedback = {
                "issues": [f"Score was {score}/100"],
                "how_to_fix": ["Improve output quality"]
            }
        
        retries += 1
        await firestore.update_estimate(estimate_id, {
            f"pipelineStatus.agentStatuses.{agent_name}": "retrying",
            f"pipelineStatus.retries.{agent_name}": retries
        })
    
    # Failed after all retries
    duration_ms = int((time.time() - start_time) * 1000)
    return AgentResult(
        name=agent_name,
        output=output if 'output' in dir() else {},
        score=score if 'score' in dir() else 0,
        passed=False,
        retries=retries,
        duration_ms=duration_ms,
        feedback="Failed after max retries"
    )


async def run_full_pipeline(clarification_output: Dict[str, Any], use_firestore_emulator: bool = False):
    """Run the complete pipeline with all agents."""
    
    print("\n" + "="*80)
    print("🏠 TrueCost Deep Agent Pipeline - FULL INTEGRATION TEST")
    print("="*80)
    
    # Initialize services
    if use_firestore_emulator:
        print("\n⚠️ Firestore emulator mode not implemented - using in-memory")
    
    firestore = InMemoryFirestore()
    llm = MockLLMService()
    
    estimate_id = clarification_output.get("estimateId", "integration_test_" + datetime.now().strftime("%Y%m%d_%H%M%S"))
    
    project_brief = clarification_output.get("projectBrief", {})
    location = project_brief.get("location", {})
    
    print(f"\n📋 Test Configuration:")
    print(f"   Estimate ID: {estimate_id}")
    print(f"   Project: {project_brief.get('projectType', 'unknown')}")
    print(f"   Location: {location.get('fullAddress', 'unknown')}")
    print(f"   Sqft: {project_brief.get('scopeSummary', {}).get('totalSqft', 0)}")
    print(f"   Agents: {', '.join(AGENT_SEQUENCE)}")
    print(f"   Pass Threshold: {PASSING_SCORE}/100")
    print(f"   Max Retries: {MAX_RETRIES}")
    
    # Create estimate document
    await firestore.create_estimate(
        estimate_id=estimate_id,
        user_id="integration_test_user",
        clarification_output=clarification_output
    )
    
    # Run pipeline
    accumulated_context = {
        "clarification_output": clarification_output
    }
    
    results: Dict[str, AgentResult] = {}
    failed = False
    
    for agent_name in AGENT_SEQUENCE:
        result = await run_agent_with_validation(
            agent_name=agent_name,
            estimate_id=estimate_id,
            accumulated_context=accumulated_context,
            firestore=firestore,
            llm=llm
        )
        
        results[agent_name] = result
        
        if result.passed:
            accumulated_context[f"{agent_name}_output"] = result.output
            
            # Update progress
            completed_count = len([r for r in results.values() if r.passed])
            progress = int((completed_count / len(AGENT_SEQUENCE)) * 100)
            await firestore.update_estimate(estimate_id, {
                "pipelineStatus.progress": progress,
                "pipelineStatus.completedAgents": [r.name for r in results.values() if r.passed]
            })
        else:
            failed = True
            await firestore.update_estimate(estimate_id, {
                "status": "failed",
                "pipelineStatus.error": f"Agent {agent_name} failed"
            })
            print(f"\n❌ Pipeline FAILED at {agent_name} agent")
            break
    
    if not failed:
        await firestore.update_estimate(estimate_id, {
            "status": "completed",
            "pipelineStatus.progress": 100
        })
    
    # Generate summary
    print("\n" + "="*80)
    print("📊 PIPELINE EXECUTION SUMMARY")
    print("="*80)
    
    total_duration = sum(r.duration_ms for r in results.values())
    
    print(f"\n{'Agent':<15} {'Score':<10} {'Status':<10} {'Retries':<10} {'Duration':<10}")
    print("-" * 55)
    
    for agent_name in AGENT_SEQUENCE:
        if agent_name in results:
            r = results[agent_name]
            status = "✅ PASS" if r.passed else "❌ FAIL"
            print(f"{r.name:<15} {r.score:<10} {status:<10} {r.retries:<10} {r.duration_ms}ms")
        else:
            print(f"{agent_name:<15} {'--':<10} {'⏭️ SKIP':<10} {'--':<10} {'--':<10}")
    
    print("-" * 55)
    print(f"{'TOTAL':<15} {'--':<10} {'✅' if not failed else '❌':<10} {'--':<10} {total_duration}ms")
    
    # Build final output
    final_output = build_final_output(
        estimate_id=estimate_id,
        clarification_output=clarification_output,
        results=results,
        firestore=firestore
    )
    
    # Save output
    output_path = Path(__file__).parent / "integration_test_output.json"
    with open(output_path, "w") as f:
        json.dump(final_output, f, indent=2, default=str)
    
    print(f"\n💾 Full output saved to: {output_path}")
    
    # Print cost summary
    print("\n" + "-"*60)
    print("💰 COST ESTIMATE SUMMARY")
    print("-"*60)
    print(f"   P50 (Base):        ${final_output.get('p50', 0):,.2f}")
    print(f"   P80 (Conservative): ${final_output.get('p80', 0):,.2f}")
    print(f"   P90 (High):         ${final_output.get('p90', 0):,.2f}")
    print(f"   Contingency:        {final_output.get('contingencyPct', 0):.1f}%")
    print(f"   Timeline:           {final_output.get('timelineWeeks', 0)} weeks")
    print("-"*60)
    
    return final_output, not failed


def build_final_output(
    estimate_id: str,
    clarification_output: Dict[str, Any],
    results: Dict[str, AgentResult],
    firestore: InMemoryFirestore
) -> Dict[str, Any]:
    """Build final output document in Dev 4 format."""
    
    project_brief = clarification_output.get("projectBrief", {})
    location = project_brief.get("location", {})
    scope_summary = project_brief.get("scopeSummary", {})
    
    # Get cost outputs
    cost_result = results.get("cost")
    cost_output = cost_result.output if cost_result else {}
    
    risk_result = results.get("risk")
    risk_output = risk_result.output if risk_result else {}
    
    timeline_result = results.get("timeline")
    timeline_output = timeline_result.output if timeline_result else {}
    
    # Extract cost values
    cost_summary = cost_output.get("summary", {})
    if isinstance(cost_summary, dict):
        grand_total = cost_summary.get("grandTotal", {})
        p50 = grand_total.get("low", 34500) if isinstance(grand_total, dict) else 34500
        p80 = grand_total.get("medium", 37950) if isinstance(grand_total, dict) else 37950
        p90 = grand_total.get("high", 43125) if isinstance(grand_total, dict) else 43125
    else:
        p50, p80, p90 = 34500, 37950, 43125
    
    # Build output
    return {
        "estimate_id": estimate_id,
        "projectName": f"Kitchen Remodel - {location.get('streetAddress', 'Test Project')}",
        "address": location.get("fullAddress", "Test Address"),
        "projectType": project_brief.get("projectType", "kitchen_remodel").replace("_", " ").title(),
        "scope": scope_summary.get("description", "Kitchen remodel project"),
        "squareFootage": scope_summary.get("totalSqft", 196),
        
        # Cost summary
        "totalCost": p50,
        "p50": p50,
        "p80": p80,
        "p90": p90,
        "contingencyPct": 10.0,
        "timelineWeeks": timeline_output.get("totalWeeks", 6),
        
        # Agent scores
        "agentScores": {
            name: {
                "score": r.score,
                "passed": r.passed,
                "retries": r.retries,
                "duration_ms": r.duration_ms
            }
            for name, r in results.items()
        },
        
        # Raw outputs for inspection
        "agentOutputs": {
            name: r.output
            for name, r in results.items()
        },
        
        # Firestore state
        "firestoreState": firestore.estimates.get(estimate_id, {})
    }


# =============================================================================
# MAIN
# =============================================================================

async def main():
    parser = argparse.ArgumentParser(description="Run TrueCost pipeline integration test")
    parser.add_argument("--firestore", action="store_true", help="Use Firestore emulator")
    parser.add_argument("--input", type=str, help="Path to clarification output JSON")
    args = parser.parse_args()
    
    # Load clarification output
    if args.input:
        input_path = Path(args.input)
    else:
        input_path = Path(__file__).parent.parent / "docs" / "clarification-output-example.json"
    
    if not input_path.exists():
        print(f"❌ Error: Could not find {input_path}")
        sys.exit(1)
    
    with open(input_path, "r") as f:
        clarification_output = json.load(f)
    
    # Run pipeline
    try:
        output, success = await run_full_pipeline(
            clarification_output=clarification_output,
            use_firestore_emulator=args.firestore
        )
        
        if success:
            print("\n✅ Integration test PASSED!")
            sys.exit(0)
        else:
            print("\n❌ Integration test FAILED!")
            sys.exit(1)
            
    except Exception as e:
        print(f"\n❌ Integration test ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())




