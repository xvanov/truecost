# Deep Agents Communication Protocols

## Two Types of Agent Communication

Deep Agents supports **two different communication patterns**, and it's important to understand the distinction:

### 1. **Subagents** (Within a Single Agent)
- **Protocol**: `task` tool (built-in Deep Agents tool)
- **Use Case**: One agent delegates work to subagents for context isolation
- **Communication**: Direct via `task` tool call → subagent returns result

### 2. **Pipeline Agents** (Separate Agent Instances)
- **Protocol**: Firestore (our TrueCost pattern)
- **Use Case**: Sequential pipeline of independent agents
- **Communication**: Indirect via Firestore (agents don't directly call each other)

## Pattern 1: Subagents (task tool)

### How It Works

When a Deep Agent uses the `task` tool, it spawns a **subagent** that:
- Runs in isolated context
- Has its own system prompt and tools
- Executes autonomously
- Returns a single result to the main agent

```python
from deepagents import create_deep_agent

# Main agent with subagents
agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    subagents=[
        {
            "name": "location_analyzer",
            "description": "Analyzes location factors for construction projects",
            "system_prompt": "You are a location intelligence specialist...",
            "tools": [get_location_factors, get_permit_costs]
        },
        {
            "name": "cost_calculator",
            "description": "Calculates material and labor costs",
            "system_prompt": "You are a cost estimation specialist...",
            "tools": [get_material_cost, calculate_labor]
        }
    ],
    system_prompt="""You are a construction estimation coordinator.
    
    Use the task() tool to delegate work to specialized subagents:
    - Use location_analyzer for location analysis
    - Use cost_calculator for cost calculations
    
    This keeps your context clean while getting specialized results.
    """
)

# Agent automatically uses task tool
result = await agent.ainvoke({
    "messages": [("user", "Analyze location and calculate costs")]
})

# Agent internally:
# 1. Calls task("location_analyzer", "Analyze location for zip 80202")
# 2. Subagent runs, returns location factors
# 3. Calls task("cost_calculator", "Calculate costs with these factors")
# 4. Subagent runs, returns cost estimate
# 5. Main agent synthesizes final result
```

### Subagent Communication Protocol

```
Main Agent
    │
    │ task("location_analyzer", "Analyze zip 80202")
    ▼
Subagent (location_analyzer)
    │
    │ Executes with isolated context
    │ Uses its own tools
    │
    │ Returns: {"zipCode": "80202", "laborRates": {...}}
    ▼
Main Agent
    │ Receives result (compressed, no intermediate steps)
    │ Continues with clean context
```

**Key Points:**
- Subagents are **ephemeral** - created on-demand
- Communication is **synchronous** - main agent waits for result
- Subagent's work is **isolated** - doesn't clutter main agent's context
- Result is **compressed** - only final output, not intermediate steps

## Pattern 2: Pipeline Agents (Firestore)

### How It Works

In TrueCost, we have **separate agent instances** that run sequentially:

```python
# These are separate agent classes, not subagents
location_agent = LocationAgent()  # Separate instance
scope_agent = ScopeAgent()         # Separate instance
cost_agent = CostAgent()           # Separate instance

# Orchestrator runs them sequentially
await location_agent.run(estimate_id, clarification_output)
# Location Agent writes to Firestore

await scope_agent.run(estimate_id)
# Scope Agent reads from Firestore, writes to Firestore

await cost_agent.run(estimate_id)
# Cost Agent reads from Firestore, writes to Firestore
```

### Pipeline Communication Protocol

```
Location Agent
    │
    │ Writes to Firestore
    │ /estimates/{id}/locationFactors
    ▼
Firestore (Shared State)
    │
    │ Scope Agent reads
    ▼
Scope Agent
    │
    │ Writes to Firestore
    │ /estimates/{id}/billOfQuantities
    ▼
Firestore (Shared State)
    │
    │ Cost Agent reads
    ▼
Cost Agent
```

**Key Points:**
- Agents are **separate instances** - different classes
- Communication is **asynchronous** - via Firestore
- Each agent **persists** its output
- Orchestrator **coordinates** the sequence

## Which Pattern Should TrueCost Use?

### Current Design: Pipeline Agents (Firestore)

**Why we use this:**
- ✅ Each agent is a **specialized, independent service**
- ✅ Agents can be **tested in isolation**
- ✅ Outputs are **persisted** for debugging/auditing
- ✅ Frontend can **observe progress** in real-time
- ✅ Agents can be **retried independently**
- ✅ **Scalable** - can add new agents without changing existing ones

### Alternative: Subagents (task tool)

**If we used subagents instead:**
- ❌ All agents would run in one execution context
- ❌ Harder to track individual agent progress
- ❌ Can't retry individual agents easily
- ❌ Frontend can't observe intermediate steps
- ✅ Simpler code (one agent with subagents)
- ✅ Automatic context isolation

## Hybrid Approach (Best of Both)

We can use **both patterns** strategically:

### Use Subagents For:
- **Within-agent complexity**: If Location Agent needs to analyze multiple aspects, use subagents
- **Context isolation**: Complex calculations that would bloat main agent context
- **Specialized tools**: Subagents with specific tool sets

### Use Pipeline Agents For:
- **Main pipeline flow**: Location → Scope → Cost → Risk → Final
- **Persistence**: Need to save outputs for next agents
- **Observability**: Frontend needs to see progress
- **Retry logic**: Need to retry individual agents

## Example: Hybrid Approach

```python
class LocationAgent:
    """Location Agent that uses subagents internally."""
    
    def __init__(self):
        # Main agent with subagents for complex analysis
        self.agent = create_deep_agent(
            model=ChatOpenAI(model="gpt-4"),
            subagents=[
                {
                    "name": "labor_rate_analyzer",
                    "description": "Analyzes labor rates by trade",
                    "system_prompt": "Analyze labor rates for construction trades...",
                    "tools": [get_labor_rates, check_union_status]
                },
                {
                    "name": "permit_analyzer",
                    "description": "Analyzes permit costs and requirements",
                    "system_prompt": "Analyze permit costs for construction...",
                    "tools": [get_permit_costs, check_permit_requirements]
                }
            ],
            system_prompt="""You are a location intelligence agent.
            
            Delegate complex analysis to subagents:
            - Use labor_rate_analyzer for labor rate analysis
            - Use permit_analyzer for permit cost analysis
            
            Then synthesize the results into locationFactors.
            """
        )
    
    async def run(self, estimate_id: str, clarification_output: dict):
        """Run location agent (pipeline agent)."""
        
        # Agent uses subagents internally via task tool
        result = await self.agent.ainvoke({
            "messages": [("user", f"Analyze location for estimate {estimate_id}")]
        })
        
        # Extract and save to Firestore (pipeline communication)
        location_factors = self._extract_output(result)
        await self.firestore.update_estimate(estimate_id, {
            "locationFactors": location_factors
        })
        
        return location_factors
```

## Communication Protocols Summary

| Aspect | Subagents (task tool) | Pipeline Agents (Firestore) |
|--------|----------------------|----------------------------|
| **Protocol** | `task` tool (built-in) | Firestore (custom) |
| **Scope** | Within one agent | Between separate agents |
| **Context** | Isolated, ephemeral | Persistent, shared |
| **Communication** | Direct (tool call) | Indirect (Firestore) |
| **Use Case** | Complex subtasks | Sequential pipeline |
| **Observability** | Limited (internal) | Full (Firestore listeners) |
| **Retry** | Retry entire agent | Retry individual agents |
| **Persistence** | No (ephemeral) | Yes (Firestore) |

## Recommendation for TrueCost

**Use Pipeline Agents (Firestore) for main flow:**
- Location → Scope → Cost → Risk → Final
- Each is a separate agent instance
- Communicate via Firestore
- Orchestrator coordinates

**Use Subagents (task tool) within agents:**
- Location Agent can use subagents for complex analysis
- Scope Agent can use subagents for CSI division processing
- Cost Agent can use subagents for cost calculations
- Keeps individual agent contexts clean

This gives you:
- ✅ Pipeline observability (Firestore)
- ✅ Agent-level context isolation (subagents)
- ✅ Best of both patterns




