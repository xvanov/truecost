#!/usr/bin/env python3
"""Demo script to test the full TrueCost Deep Agent Pipeline locally.

This script:
1. Loads the clarification-output-example.json
2. Runs each agent in sequence with mock services
3. Outputs the final estimate as JSON

Usage:
    cd functions
    python demo_pipeline.py
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime
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
# MOCK SERVICES
# =============================================================================


class MockFirestoreService:
    """In-memory mock Firestore for testing."""
    
    def __init__(self):
        self.estimates: Dict[str, Dict[str, Any]] = {}
        self.agent_outputs: Dict[str, Dict[str, Dict[str, Any]]] = {}
    
    async def get_estimate(self, estimate_id: str) -> Optional[Dict[str, Any]]:
        return self.estimates.get(estimate_id)
    
    async def update_estimate(self, estimate_id: str, data: Dict[str, Any]) -> None:
        if estimate_id not in self.estimates:
            self.estimates[estimate_id] = {"id": estimate_id}
        
        # Handle nested updates (dot notation)
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
        
        self.estimates[estimate_id]["updatedAt"] = datetime.utcnow().isoformat()
    
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
                "agentStatuses": {},
                "scores": {},
                "retries": {}
            },
            "createdAt": datetime.utcnow().isoformat(),
            "updatedAt": datetime.utcnow().isoformat()
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
            "createdAt": datetime.utcnow().isoformat()
        }
        
        # Also update main estimate
        await self.update_estimate(estimate_id, {
            f"{agent_name}Output": output,
            f"pipelineStatus.agentStatuses.{agent_name}": "completed"
        })
    
    async def delete_estimate(self, estimate_id: str) -> None:
        self.estimates.pop(estimate_id, None)
        self.agent_outputs.pop(estimate_id, None)


class MockLLMService:
    """Mock LLM service that returns deterministic responses."""
    
    async def generate_json(
        self,
        system_prompt: str,
        user_message: str
    ) -> Dict[str, Any]:
        """Return a mock JSON response based on context."""
        
        # Determine which agent is calling based on prompt content
        if "construction cost analyst specializing in location" in system_prompt.lower():
            return {
                "tokens_used": 500,
                "content": {
                    "analysis": "This Denver location in Colorado offers favorable construction conditions with moderate labor costs compared to coastal cities. The 80202 ZIP code indicates downtown Denver, which has good contractor availability but potential parking and access challenges for construction vehicles.",
                    "key_findings": [
                        "Denver's location factor of 1.05 is slightly above national average",
                        "Non-union market allows for competitive labor pricing",
                        "Moderate seasonal weather impact - winter months may affect exterior work",
                        "Good contractor availability in the Denver metro area"
                    ],
                    "recommendations": [
                        "Schedule exterior work for spring through fall months",
                        "Verify HOA requirements for condo remodels",
                        "Coordinate deliveries during off-peak hours for downtown access"
                    ],
                    "risk_factors": [
                        "Downtown parking may increase material delivery costs",
                        "Building elevator scheduling for material transport",
                        "Potential noise restrictions in residential building"
                    ],
                    "confidence_assessment": "High confidence - Denver is a well-documented market with reliable cost data. Data confidence: 92%."
                }
            }
        
        elif "construction scope analyst" in system_prompt.lower():
            return {
                "tokens_used": 600,
                "content": {
                    "summary": "Complete kitchen remodel scope with 10 CSI divisions included. Bill of quantities includes 52 line items covering demolition, cabinetry, countertops, flooring, plumbing, and electrical work.",
                    "recommendations": [
                        "Verify exact cabinet dimensions before ordering",
                        "Confirm granite slab availability for countertop selection"
                    ]
                }
            }
        
        elif "construction cost estimation" in system_prompt.lower():
            return {
                "tokens_used": 700,
                "content": {
                    "summary": "Total estimated cost range: $34,500 (P50) to $43,125 (P90). Major cost drivers are cabinetry (35%), countertops (20%), and labor (28%).",
                    "cost_drivers": [
                        {"item": "Custom cabinets", "impact": "high", "notes": "Shaker style maple cabinets with soft-close hardware"},
                        {"item": "Granite countertops", "impact": "medium", "notes": "Level 2 granite with standard edging"},
                        {"item": "Appliance package", "impact": "medium", "notes": "Mid-range stainless steel appliances"}
                    ],
                    "savings_opportunities": [
                        "Stock cabinets vs semi-custom could save 15-20%",
                        "Quartz alternatives to granite may reduce countertop costs"
                    ]
                }
            }
        
        elif "risk analyst" in system_prompt.lower():
            return {
                "tokens_used": 550,
                "content": {
                    "summary": "Risk analysis complete. Recommended contingency: 10% ($3,450). Top risk factors include material price volatility and potential hidden conditions behind walls.",
                    "top_risks": [
                        "Material price increases for cabinets and appliances",
                        "Hidden plumbing or electrical issues during demo",
                        "Permit delays from city building department"
                    ],
                    "mitigation_strategies": [
                        "Lock in cabinet and appliance prices early",
                        "Include allowance for unforeseen conditions",
                        "Submit permit application as early as possible"
                    ]
                }
            }
        
        elif "construction timeline" in system_prompt.lower():
            return {
                "tokens_used": 450,
                "content": {
                    "summary": "Estimated project duration: 6 weeks from demolition to completion. Critical path runs through cabinet delivery and installation.",
                    "milestones": [
                        {"name": "Permit approval", "week": 1},
                        {"name": "Demo complete", "week": 2},
                        {"name": "Rough-in inspections", "week": 3},
                        {"name": "Cabinets installed", "week": 4},
                        {"name": "Countertops installed", "week": 5},
                        {"name": "Final inspection", "week": 6}
                    ],
                    "schedule_risks": [
                        "Cabinet lead time: 2-3 weeks - order early",
                        "Granite templating must wait for cabinet installation"
                    ]
                }
            }
        
        elif "synthesis" in system_prompt.lower() or "final" in system_prompt.lower():
            return {
                "tokens_used": 800,
                "content": {
                    "executive_summary": "This kitchen remodel in downtown Denver is a well-defined project with moderate complexity. The estimated cost range is $34,500 to $43,125 with a recommended 10% contingency. Timeline is 6 weeks with cabinet delivery as the critical path item.",
                    "key_recommendations": [
                        "Lock in cabinet pricing and order immediately upon contract signing",
                        "Plan demolition for a weekday when building elevator access is guaranteed",
                        "Schedule countertop templating within 24 hours of cabinet installation completion"
                    ],
                    "disclaimers": [
                        "Estimate based on scope as described; changes may affect pricing",
                        "Permit fees and timeline subject to city building department approval",
                        "Material prices valid for 30 days from estimate date"
                    ]
                }
            }
        
        # Default response
        return {
            "tokens_used": 300,
            "content": {
                "analysis": "Analysis completed successfully.",
                "key_findings": ["Finding 1", "Finding 2"],
                "recommendations": ["Recommendation 1"]
            }
        }


# =============================================================================
# DIRECT AGENT RUNNER
# =============================================================================


async def run_agent_directly(
    agent_class,
    agent_name: str,
    estimate_id: str,
    accumulated_context: Dict[str, Any],
    firestore: MockFirestoreService,
    llm: MockLLMService
) -> Dict[str, Any]:
    """Run an agent directly without A2A protocol."""
    from services.cost_data_service import CostDataService
    from services.monte_carlo_service import MonteCarloService
    
    logger.info(f"🚀 Running {agent_name} agent...")
    
    # Create agent with mock services
    if agent_name == "location":
        from agents.primary.location_agent import LocationAgent
        agent = LocationAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=CostDataService()
        )
    elif agent_name == "scope":
        from agents.primary.scope_agent import ScopeAgent
        agent = ScopeAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=CostDataService()
        )
    elif agent_name == "cost":
        from agents.primary.cost_agent import CostAgent
        agent = CostAgent(
            firestore_service=firestore,
            llm_service=llm,
            cost_data_service=CostDataService()
        )
    elif agent_name == "risk":
        from agents.primary.risk_agent import RiskAgent
        agent = RiskAgent(
            firestore_service=firestore,
            llm_service=llm,
            monte_carlo_service=MonteCarloService()
        )
    elif agent_name == "timeline":
        from agents.primary.timeline_agent import TimelineAgent
        agent = TimelineAgent(
            firestore_service=firestore,
            llm_service=llm
        )
    elif agent_name == "final":
        from agents.primary.final_agent import FinalAgent
        agent = FinalAgent(
            firestore_service=firestore,
            llm_service=llm
        )
    else:
        raise ValueError(f"Unknown agent: {agent_name}")
    
    # Run the agent
    output = await agent.run(
        estimate_id=estimate_id,
        input_data=accumulated_context
    )
    
    logger.info(f"✅ {agent_name} agent completed", output_keys=list(output.keys()) if output else [])
    
    return output


async def run_scorer_directly(
    agent_name: str,
    output: Dict[str, Any],
    input_data: Dict[str, Any]
) -> Dict[str, Any]:
    """Run a scorer agent directly."""
    logger.info(f"📊 Running {agent_name} scorer...")
    
    if agent_name == "location":
        from agents.scorers.location_scorer import LocationScorer
        scorer = LocationScorer()
    elif agent_name == "scope":
        from agents.scorers.scope_scorer import ScopeScorer
        scorer = ScopeScorer()
    elif agent_name == "cost":
        from agents.scorers.cost_scorer import CostScorer
        scorer = CostScorer()
    elif agent_name == "risk":
        from agents.scorers.risk_scorer import RiskScorer
        scorer = RiskScorer()
    elif agent_name == "timeline":
        from agents.scorers.timeline_scorer import TimelineScorer
        scorer = TimelineScorer()
    elif agent_name == "final":
        from agents.scorers.final_scorer import FinalScorer
        scorer = FinalScorer()
    else:
        raise ValueError(f"Unknown scorer for: {agent_name}")
    
    result = scorer.score(output, input_data)
    
    logger.info(f"📊 {agent_name} score: {result.get('score', 0)}/100 - {'PASS' if result.get('passed') else 'FAIL'}")
    
    return result


# =============================================================================
# MAIN PIPELINE RUNNER
# =============================================================================


async def run_demo_pipeline():
    """Run the complete demo pipeline."""
    
    print("\n" + "="*80)
    print("🏠 TrueCost Deep Agent Pipeline - Demo Run")
    print("="*80 + "\n")
    
    # Load the clarification output example
    example_path = Path(__file__).parent.parent / "docs" / "clarification-output-example.json"
    
    if not example_path.exists():
        print(f"❌ Error: Could not find {example_path}")
        sys.exit(1)
    
    with open(example_path, "r") as f:
        clarification_output = json.load(f)
    
    print(f"📋 Loaded clarification output: {clarification_output.get('estimateId', 'unknown')}")
    print(f"   Project: {clarification_output.get('projectBrief', {}).get('projectType', 'unknown')}")
    print(f"   Location: {clarification_output.get('projectBrief', {}).get('location', {}).get('fullAddress', 'unknown')}")
    print(f"   Total Sqft: {clarification_output.get('projectBrief', {}).get('scopeSummary', {}).get('totalSqft', 0)}")
    print()
    
    # Initialize mock services
    firestore = MockFirestoreService()
    llm = MockLLMService()
    
    # Generate estimate ID
    estimate_id = clarification_output.get("estimateId", "demo_kitchen_2024")
    
    # Create estimate document
    await firestore.create_estimate(
        estimate_id=estimate_id,
        user_id="demo_user",
        clarification_output=clarification_output
    )
    
    # Agent sequence
    agent_sequence = ["location", "scope", "cost", "risk", "timeline", "final"]
    
    # Accumulated context from all agents
    accumulated_context = {
        "clarification_output": clarification_output
    }
    
    results = {}
    
    # Run each agent in sequence
    for agent_name in agent_sequence:
        try:
            # Run primary agent
            output = await run_agent_directly(
                agent_class=None,
                agent_name=agent_name,
                estimate_id=estimate_id,
                accumulated_context=accumulated_context,
                firestore=firestore,
                llm=llm
            )
            
            # Run scorer
            score_result = await run_scorer_directly(
                agent_name=agent_name,
                output=output,
                input_data=accumulated_context
            )
            
            # Store result
            results[agent_name] = {
                "output": output,
                "score": score_result
            }
            
            # Add to accumulated context for next agent
            accumulated_context[f"{agent_name}_output"] = output
            
            print()
            
        except Exception as e:
            logger.error(f"❌ {agent_name} agent failed: {e}")
            import traceback
            traceback.print_exc()
            break
    
    # Build final output document
    print("\n" + "="*80)
    print("📄 Final Estimate Output")
    print("="*80 + "\n")
    
    # Get the final estimate from Firestore
    final_estimate = firestore.estimates.get(estimate_id, {})
    
    # Build the Dev 4 integration format
    dev4_output = build_dev4_output(
        estimate_id=estimate_id,
        clarification_output=clarification_output,
        results=results,
        firestore=firestore
    )
    
    # Save to file
    output_path = Path(__file__).parent / "demo_output.json"
    with open(output_path, "w") as f:
        json.dump(dev4_output, f, indent=2, default=str)
    
    print(f"💾 Output saved to: {output_path}")
    
    # Print summary
    print("\n" + "-"*60)
    print("📊 ESTIMATE SUMMARY")
    print("-"*60)
    print(f"Estimate ID:      {dev4_output.get('estimate_id')}")
    print(f"Project:          {dev4_output.get('projectName')}")
    print(f"Address:          {dev4_output.get('address')}")
    print(f"Total Cost (P50): ${dev4_output.get('totalCost', 0):,.2f}")
    print(f"P80 Estimate:     ${dev4_output.get('p80', 0):,.2f}")
    print(f"P90 Estimate:     ${dev4_output.get('p90', 0):,.2f}")
    print(f"Contingency:      {dev4_output.get('contingencyPct', 0):.1f}%")
    print(f"Timeline:         {dev4_output.get('timelineWeeks', 0)} weeks")
    print("-"*60)
    
    # Print agent scores
    print("\n📊 AGENT SCORES")
    print("-"*30)
    for agent_name, result in results.items():
        score = result.get("score", {}).get("score", 0)
        passed = result.get("score", {}).get("passed", False)
        status = "✅" if passed else "❌"
        print(f"  {agent_name:12} {score:3d}/100 {status}")
    print("-"*30)
    
    return dev4_output


def build_dev4_output(
    estimate_id: str,
    clarification_output: Dict[str, Any],
    results: Dict[str, Any],
    firestore: MockFirestoreService
) -> Dict[str, Any]:
    """Build output in Dev 4's required format per dev2-integration-spec.md"""
    
    project_brief = clarification_output.get("projectBrief", {})
    location = project_brief.get("location", {})
    scope_summary = project_brief.get("scopeSummary", {})
    
    # Extract outputs from each agent
    location_output = results.get("location", {}).get("output", {})
    scope_output = results.get("scope", {}).get("output", {})
    cost_output = results.get("cost", {}).get("output", {})
    risk_output = results.get("risk", {}).get("output", {})
    timeline_output = results.get("timeline", {}).get("output", {})
    final_output = results.get("final", {}).get("output", {})
    
    # Get cost values
    cost_summary = cost_output.get("summary", {})
    total_cost = cost_summary.get("grandTotal", {})
    
    p50 = total_cost.get("low", 34500) if isinstance(total_cost, dict) else 34500
    p80 = total_cost.get("medium", 37950) if isinstance(total_cost, dict) else 37950
    p90 = total_cost.get("high", 39675) if isinstance(total_cost, dict) else 39675
    
    # Get risk analysis values
    risk_analysis = risk_output.get("riskAnalysis", {})
    monte_carlo = risk_analysis.get("monteCarloResults", {})
    contingency_pct = risk_analysis.get("contingencyRecommendation", 10.0)
    
    # Build labor analysis
    labor_analysis = build_labor_analysis(scope_output, cost_output, location_output)
    
    # Build schedule
    schedule = build_schedule(timeline_output)
    
    # Build cost breakdown by division
    cost_breakdown = build_cost_breakdown(scope_output, cost_output)
    
    # Build bill of quantities
    bill_of_quantities = build_boq(scope_output, cost_output)
    
    # Build assumptions
    assumptions = build_assumptions(clarification_output, final_output)
    
    return {
        # Identification
        "estimate_id": estimate_id,
        
        # Project Information
        "projectName": f"Kitchen Remodel - {location.get('streetAddress', '123 Main St')}",
        "address": location.get("fullAddress", "Unknown Address"),
        "projectType": project_brief.get("projectType", "kitchen_remodel").replace("_", " ").title(),
        "scope": scope_summary.get("description", "Kitchen remodel project"),
        "squareFootage": scope_summary.get("totalSqft", 196),
        
        # Cost Summary
        "totalCost": p50,
        "p50": p50,
        "p80": p80,
        "p90": p90,
        "contingencyPct": contingency_pct,
        "timelineWeeks": timeline_output.get("totalWeeks", 6),
        "monteCarloIterations": monte_carlo.get("iterations", 1000),
        
        # Internal notes
        "internalNotes": "Demo estimate generated by pipeline test",
        
        # Cost drivers
        "costDrivers": [
            {"name": "Cabinetry", "cost": 4500, "percentage": 13},
            {"name": "Countertops", "cost": 3400, "percentage": 10},
            {"name": "Appliances", "cost": 7500, "percentage": 22},
            {"name": "Labor", "cost": 12075, "percentage": 35},
            {"name": "Flooring", "cost": 2400, "percentage": 7},
            {"name": "Other", "cost": 4625, "percentage": 13}
        ],
        
        # Sub-objects
        "laborAnalysis": labor_analysis,
        "schedule": schedule,
        "cost_breakdown": cost_breakdown,
        "risk_analysis": build_risk_analysis_output(risk_output, p50, p80, p90),
        "bill_of_quantities": bill_of_quantities,
        "assumptions": assumptions,
        "cad_data": build_cad_data(clarification_output.get("cadData"))
    }


def build_labor_analysis(scope_output, cost_output, location_output) -> Dict[str, Any]:
    """Build labor analysis in Dev 4 format."""
    # Use mock data for demo
    trades = [
        {"name": "Carpenter", "hours": 80.0, "rate": 52.00, "base_cost": 4160, "burden": 1456, "total": 5616},
        {"name": "Electrician", "hours": 32.0, "rate": 65.00, "base_cost": 2080, "burden": 728, "total": 2808},
        {"name": "Plumber", "hours": 24.0, "rate": 62.00, "base_cost": 1488, "burden": 521, "total": 2009},
        {"name": "Painter", "hours": 40.0, "rate": 40.00, "base_cost": 1600, "burden": 560, "total": 2160},
        {"name": "Tile Setter", "hours": 16.0, "rate": 48.00, "base_cost": 768, "burden": 269, "total": 1037},
        {"name": "General Labor", "hours": 48.0, "rate": 30.00, "base_cost": 1440, "burden": 504, "total": 1944}
    ]
    
    total_hours = sum(t["hours"] for t in trades)
    base_total = sum(t["base_cost"] for t in trades)
    burden_total = sum(t["burden"] for t in trades)
    
    return {
        "total_hours": total_hours,
        "base_total": base_total,
        "burden_total": burden_total,
        "total": base_total + burden_total,
        "labor_pct": 35,
        "estimated_days": 30,
        "trades": trades,
        "location_factors": {
            "is_union": location_output.get("unionStatus", "mixed") == "union",
            "union_premium": 1.0
        }
    }


def build_schedule(timeline_output) -> Dict[str, Any]:
    """Build schedule in Dev 4 format."""
    tasks = timeline_output.get("tasks", [])
    
    formatted_tasks = [
        {"number": 1, "name": "Pre-Construction", "duration": "1 week", "start": "Week 1", "end": "Week 1", "is_milestone": True, "dependencies": []},
        {"number": "1.1", "name": "Permits & Approvals", "duration": "3-5 days", "start": "Day 1", "end": "Day 5", "dependencies": ["Contract signed"]},
        {"number": 2, "name": "Demolition", "duration": "2-3 days", "start": "Week 2", "end": "Week 2", "is_milestone": True, "dependencies": ["Pre-construction"]},
        {"number": 3, "name": "Rough Plumbing", "duration": "2 days", "start": "Week 2", "end": "Week 2", "dependencies": ["Demolition"]},
        {"number": 4, "name": "Rough Electrical", "duration": "2 days", "start": "Week 2", "end": "Week 3", "dependencies": ["Demolition"]},
        {"number": 5, "name": "Drywall Repair", "duration": "2-3 days", "start": "Week 3", "end": "Week 3", "dependencies": ["Rough-in inspections"]},
        {"number": 6, "name": "Cabinet Installation", "duration": "3-4 days", "start": "Week 4", "end": "Week 4", "is_milestone": True, "dependencies": ["Drywall complete"]},
        {"number": 7, "name": "Countertop Template & Install", "duration": "3-5 days", "start": "Week 4", "end": "Week 5", "dependencies": ["Cabinets installed"]},
        {"number": 8, "name": "Flooring", "duration": "2 days", "start": "Week 5", "end": "Week 5", "dependencies": ["Cabinets installed"]},
        {"number": 9, "name": "Finish Plumbing", "duration": "1 day", "start": "Week 5", "end": "Week 5", "dependencies": ["Countertops installed"]},
        {"number": 10, "name": "Finish Electrical", "duration": "1 day", "start": "Week 5", "end": "Week 5", "dependencies": ["Countertops installed"]},
        {"number": 11, "name": "Paint & Touch-up", "duration": "2 days", "start": "Week 5", "end": "Week 6", "dependencies": ["All finishes installed"]},
        {"number": 12, "name": "Appliance Install", "duration": "1 day", "start": "Week 6", "end": "Week 6", "dependencies": ["Plumbing/electrical complete"]},
        {"number": 13, "name": "Final Inspection", "duration": "1 day", "start": "Week 6", "end": "Week 6", "is_milestone": True, "dependencies": ["All work complete"]},
    ]
    
    return {
        "total_weeks": timeline_output.get("totalWeeks", 6),
        "start_date": "Upon contract signing",
        "end_date": "6 weeks from start",
        "tasks": formatted_tasks,
        "notes": [
            "Schedule assumes normal weather conditions",
            "Permit timeline may vary (typically 3-10 business days)",
            "Cabinet lead time: 2-3 weeks (order placed during pre-construction)",
            "Appliance delivery coordinated for Week 5"
        ]
    }


def build_cost_breakdown(scope_output, cost_output) -> Dict[str, Any]:
    """Build cost breakdown in Dev 4 format."""
    # Use demo values
    return {
        "total_material": 18975.00,
        "total_labor": 12075.00,
        "permits": 1035.00,
        "overhead": 2415.00,
        "material_pct": 55,
        "labor_pct": 35,
        "permits_pct": 3,
        "overhead_pct": 7,
        "divisions": [
            {
                "code": "02",
                "name": "Existing Conditions (Demolition)",
                "total": 1800,
                "material_subtotal": 300,
                "labor_subtotal": 1500,
                "items": [
                    {"description": "Kitchen demolition", "quantity": 1, "unit": "ls", "unit_cost": 1500, "material_cost": 300, "labor_cost": 1200}
                ]
            },
            {
                "code": "06",
                "name": "Wood, Plastics, and Composites",
                "total": 5700,
                "material_subtotal": 4500,
                "labor_subtotal": 1200,
                "items": [
                    {"description": "Kitchen Cabinets - Base", "quantity": 16, "unit": "lf", "unit_cost": 225, "material_cost": 3600, "labor_cost": 800},
                    {"description": "Kitchen Cabinets - Upper", "quantity": 14, "unit": "lf", "unit_cost": 150, "material_cost": 900, "labor_cost": 400}
                ]
            },
            {
                "code": "09",
                "name": "Finishes",
                "total": 4200,
                "material_subtotal": 3200,
                "labor_subtotal": 1000,
                "items": [
                    {"description": "Hardwood Flooring", "quantity": 210, "unit": "sf", "unit_cost": 12, "material_cost": 2520, "labor_cost": 630},
                    {"description": "Interior Paint", "quantity": 450, "unit": "sf", "unit_cost": 1.50, "material_cost": 675, "labor_cost": 370}
                ]
            },
            {
                "code": "12",
                "name": "Furnishings",
                "total": 7900,
                "material_subtotal": 6900,
                "labor_subtotal": 1000,
                "items": [
                    {"description": "Granite Countertops", "quantity": 70, "unit": "sf", "unit_cost": 85, "material_cost": 5950, "labor_cost": 700},
                    {"description": "Undermount Sink", "quantity": 1, "unit": "ea", "unit_cost": 450, "material_cost": 450, "labor_cost": 150},
                    {"description": "Kitchen Faucet", "quantity": 1, "unit": "ea", "unit_cost": 500, "material_cost": 500, "labor_cost": 150}
                ]
            },
            {
                "code": "22",
                "name": "Plumbing",
                "total": 2200,
                "material_subtotal": 800,
                "labor_subtotal": 1400,
                "items": [
                    {"description": "Plumbing rough-in and fixtures", "quantity": 1, "unit": "ls", "unit_cost": 2200, "material_cost": 800, "labor_cost": 1400}
                ]
            },
            {
                "code": "26",
                "name": "Electrical",
                "total": 3500,
                "material_subtotal": 1200,
                "labor_subtotal": 2300,
                "items": [
                    {"description": "Electrical work - recessed lights, outlets, undercabinet", "quantity": 1, "unit": "ls", "unit_cost": 3500, "material_cost": 1200, "labor_cost": 2300}
                ]
            }
        ]
    }


def build_risk_analysis_output(risk_output, p50, p80, p90) -> Dict[str, Any]:
    """Build risk analysis in Dev 4 format."""
    contingency_pct = 10.0
    
    # Build histogram bins
    min_val = p50 * 0.85
    max_val = p90 * 1.10
    bin_width = (max_val - min_val) / 20
    
    histogram = []
    for i in range(20):
        low = min_val + i * bin_width
        high = low + bin_width
        # Simple bell curve approximation
        center_dist = abs(i - 10) / 10
        pct = max(0.5, (1 - center_dist) * 15)
        histogram.append({
            "range_low": round(low, 2),
            "range_high": round(high, 2),
            "count": int(pct * 10),
            "percentage": round(pct, 1)
        })
    
    return {
        "iterations": 1000,
        "p50": p50,
        "p80": p80,
        "p90": p90,
        "contingency_pct": contingency_pct,
        "contingency_amount": p50 * contingency_pct / 100,
        "min": min_val,
        "max": max_val,
        "max_percentage": 15.0,
        "histogram": histogram,
        "top_risks": [
            {"item": "Appliance package", "impact": 2000.00, "probability": 0.33, "sensitivity": 0.85},
            {"item": "Cabinet installation", "impact": 1500.00, "probability": 0.33, "sensitivity": 0.78},
            {"item": "Electrical rough-in", "impact": 1000.00, "probability": 0.33, "sensitivity": 0.72},
            {"item": "Plumbing rough-in", "impact": 800.00, "probability": 0.33, "sensitivity": 0.68},
            {"item": "Countertop materials", "impact": 700.00, "probability": 0.33, "sensitivity": 0.65}
        ]
    }


def build_boq(scope_output, cost_output) -> Dict[str, Any]:
    """Build bill of quantities in Dev 4 format."""
    items = [
        {"line_number": 1, "description": "Kitchen demolition and haul-away", "quantity": 1, "unit": "ls", "unit_cost": 1500.00, "total": 1500, "csi_division": "02"},
        {"line_number": 2, "description": "Base cabinets, shaker maple painted white", "quantity": 16, "unit": "lf", "unit_cost": 225.00, "total": 3600, "csi_division": "06"},
        {"line_number": 3, "description": "Upper cabinets, 42\" height, soft-close", "quantity": 14, "unit": "lf", "unit_cost": 150.00, "total": 2100, "csi_division": "06"},
        {"line_number": 4, "description": "Island cabinet 60x36", "quantity": 1, "unit": "ea", "unit_cost": 1200.00, "total": 1200, "csi_division": "06"},
        {"line_number": 5, "description": "Pantry cabinet 84\" tall", "quantity": 1, "unit": "ea", "unit_cost": 800.00, "total": 800, "csi_division": "06"},
        {"line_number": 6, "description": "Cabinet hardware", "quantity": 46, "unit": "ea", "unit_cost": 8.00, "total": 368, "csi_division": "08"},
        {"line_number": 7, "description": "Granite countertops - Level 2", "quantity": 70, "unit": "sf", "unit_cost": 85.00, "total": 5950, "csi_division": "12"},
        {"line_number": 8, "description": "Undermount double-bowl sink", "quantity": 1, "unit": "ea", "unit_cost": 450.00, "total": 450, "csi_division": "22"},
        {"line_number": 9, "description": "Kitchen faucet - pull-down", "quantity": 1, "unit": "ea", "unit_cost": 350.00, "total": 350, "csi_division": "22"},
        {"line_number": 10, "description": "Garbage disposal 3/4 HP", "quantity": 1, "unit": "ea", "unit_cost": 250.00, "total": 250, "csi_division": "22"},
        {"line_number": 11, "description": "Engineered hardwood flooring", "quantity": 210, "unit": "sf", "unit_cost": 12.00, "total": 2520, "csi_division": "09"},
        {"line_number": 12, "description": "Flooring underlayment", "quantity": 200, "unit": "sf", "unit_cost": 1.00, "total": 200, "csi_division": "09"},
        {"line_number": 13, "description": "Interior paint - walls", "quantity": 450, "unit": "sf", "unit_cost": 1.50, "total": 675, "csi_division": "09"},
        {"line_number": 14, "description": "Subway tile backsplash", "quantity": 35, "unit": "sf", "unit_cost": 12.00, "total": 420, "csi_division": "09"},
        {"line_number": 15, "description": "Recessed LED lights", "quantity": 6, "unit": "ea", "unit_cost": 125.00, "total": 750, "csi_division": "26"},
        {"line_number": 16, "description": "Under-cabinet LED lighting", "quantity": 14, "unit": "lf", "unit_cost": 35.00, "total": 490, "csi_division": "26"},
        {"line_number": 17, "description": "GFCI outlets", "quantity": 4, "unit": "ea", "unit_cost": 85.00, "total": 340, "csi_division": "26"},
        {"line_number": 18, "description": "Refrigerator - French door", "quantity": 1, "unit": "ea", "unit_cost": 2200.00, "total": 2200, "csi_division": "11"},
        {"line_number": 19, "description": "Gas range - 5 burner", "quantity": 1, "unit": "ea", "unit_cost": 1100.00, "total": 1100, "csi_division": "11"},
        {"line_number": 20, "description": "Dishwasher - built-in", "quantity": 1, "unit": "ea", "unit_cost": 850.00, "total": 850, "csi_division": "11"},
        {"line_number": 21, "description": "Range hood - wall mount", "quantity": 1, "unit": "ea", "unit_cost": 450.00, "total": 450, "csi_division": "11"},
        {"line_number": 22, "description": "Microwave - countertop", "quantity": 1, "unit": "ea", "unit_cost": 200.00, "total": 200, "csi_division": "11"},
        {"line_number": 23, "description": "Contingency allowance", "quantity": 1, "unit": "ls", "unit_cost": 3000.00, "total": 3000, "csi_division": "01"}
    ]
    
    subtotal = sum(item["total"] for item in items)
    
    return {
        "items": items,
        "subtotal": subtotal,
        "permits": 1035.00,
        "overhead": 2415.00,
        "markup_pct": 7
    }


def build_assumptions(clarification_output, final_output) -> Dict[str, Any]:
    """Build assumptions in Dev 4 format."""
    special_requirements = clarification_output.get("projectBrief", {}).get("specialRequirements", [])
    exclusions = clarification_output.get("projectBrief", {}).get("exclusions", [])
    
    return {
        "items": [
            "Site access is adequate for material delivery and crew parking",
            "Work performed during normal business hours (8am-5pm, Monday-Friday)",
            "No hidden damage, asbestos, lead paint, or mold present",
            "All required permits will be obtainable within 5 business days",
            "Existing electrical panel has adequate capacity for new loads",
            "Existing plumbing can support fixture locations without relocation",
            "Material prices valid for 30 days from estimate date",
            "Client will make timely decisions on selections"
        ],
        "inclusions": [
            "All materials, labor, and equipment as specified",
            "Project management and site supervision",
            "Permit fees and inspection costs",
            "Standard 1-year workmanship warranty",
            "Daily cleanup and final construction cleaning",
            "Dumpster rental and debris disposal",
            "Protection of adjacent surfaces during construction"
        ] + special_requirements,
        "exclusions": [
            {
                "category": "Structural Work",
                "items": ["Load-bearing wall modifications", "Foundation repairs", "Structural engineering"]
            },
            {
                "category": "Hazardous Materials",
                "items": ["Asbestos abatement", "Lead paint remediation", "Mold remediation"]
            },
            {
                "category": "HVAC",
                "items": ["HVAC system replacement", "Ductwork modifications"]
            },
            {
                "category": "Other",
                "items": exclusions if exclusions else ["Owner-supplied items installation"]
            }
        ]
    }


def build_cad_data(cad_data) -> Optional[Dict[str, Any]]:
    """Build CAD data in Dev 4 format."""
    if not cad_data:
        return None
    
    space_model = cad_data.get("spaceModel", {})
    rooms = space_model.get("rooms", [])
    
    return {
        "file_url": cad_data.get("fileUrl"),
        "extracted_measurements": {
            "rooms": [{"name": r.get("name"), "sqft": r.get("sqft"), "width": r.get("dimensions", {}).get("width"), "length": r.get("dimensions", {}).get("length")} for r in rooms],
            "walls": [],
            "openings": []
        },
        "image_url": None,
        "extraction_method": cad_data.get("extractionMethod", "vision")
    }


# =============================================================================
# ENTRY POINT
# =============================================================================


if __name__ == "__main__":
    try:
        result = asyncio.run(run_demo_pipeline())
        print("\n✅ Pipeline demo completed successfully!")
    except Exception as e:
        print(f"\n❌ Pipeline demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)




