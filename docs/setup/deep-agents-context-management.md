# Context Management in Deep Agents for TrueCost

## Overview

Deep Agents provides built-in context management through **file system tools** and **pluggable backends**. This guide explains how to handle context in your TrueCost pipeline, including integration with Firestore.

## Context Management Layers

Deep Agents handles context at multiple levels:

```
┌─────────────────────────────────────────────────┐
│  Agent Context (LLM Conversation)             │
│  - Messages history                            │
│  - Tool call results                           │
│  - Planning state (todos)                      │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  File System Tools (Built-in)                  │
│  - ls, read_file, write_file, edit_file        │
│  - Offloads large context to storage           │
│  - Prevents context window overflow             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Backend Storage (Pluggable)                   │
│  - StateBackend (ephemeral, in-memory)         │
│  - FilesystemBackend (disk)                    │
│  - StoreBackend (persistent, cross-thread)     │
│  - CompositeBackend (route by path)          │
│  - Custom FirestoreBackend (your case)        │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│  Firestore (TrueCost Integration)              │
│  - Agent outputs                                │
│  - Intermediate results                         │
│  - Pipeline state                               │
└─────────────────────────────────────────────────┘
```

## Built-in File System Tools

Deep Agents automatically provides these tools for context management:

### 1. **File Operations**
- `ls` - List files/directories
- `read_file` - Read file contents
- `write_file` - Write/create files
- `edit_file` - Edit existing files
- `glob` - Pattern matching
- `grep` - Search file contents

### 2. **How Agents Use Them**

Agents automatically use file system tools to:
- **Offload large context**: Store CAD data, large JSON structures
- **Store intermediate results**: Save calculations, analysis steps
- **Manage working files**: Create temporary files for processing
- **Prevent context overflow**: Move data out of conversation history

## Backend Options

### Option 1: StateBackend (Default - Ephemeral)

**Use Case**: Temporary working files within a single agent execution

```python
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain_openai import ChatOpenAI

# Default - files stored in agent state (ephemeral)
agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    backend=StateBackend(),  # Optional - this is default
    system_prompt="Agent with ephemeral file storage"
)
```

**Characteristics**:
- Files live in agent's state
- Persists within a thread but not across threads
- Good for temporary working files
- Lost when agent execution completes

### Option 2: FilesystemBackend (Disk Storage)

**Use Case**: Persistent files on disk (not recommended for Cloud Functions)

```python
from deepagents.backends import FilesystemBackend

# Store files on actual filesystem
agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    backend=FilesystemBackend(root="/tmp/agent-files"),
    system_prompt="Agent with disk storage"
)
```

**Note**: Not ideal for Cloud Functions (ephemeral filesystem)

### Option 3: StoreBackend (Persistent Cross-Conversation)

**Use Case**: Long-term memory that persists across conversations

```python
from deepagents.backends import StoreBackend
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    backend=StoreBackend(store=store),
    system_prompt="Agent with persistent memory"
)
```

**Characteristics**:
- Uses LangGraph's BaseStore
- Persists across conversations
- Namespaced per assistant_id
- Good for long-term knowledge

### Option 4: CompositeBackend (Route by Path)

**Use Case**: Different storage strategies for different paths

```python
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from langgraph.store.memory import InMemoryStore

store = InMemoryStore()

# Route /memories/ to persistent storage, everything else to state
backend = CompositeBackend(
    default=StateBackend(),
    routes={
        "/memories/": StoreBackend(store=store)
    }
)

agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    backend=backend,
    system_prompt="Agent with hybrid storage"
)
```

## TrueCost Context Management Strategy

For TrueCost, you need a **hybrid approach**:

1. **Agent-level context**: Use Deep Agents' built-in file system tools
2. **Pipeline-level context**: Use Firestore for agent outputs
3. **Custom tools**: Bridge between Deep Agents and Firestore

### Recommended Architecture

```python
# functions/agents/base_agent.py
from deepagents import create_deep_agent
from deepagents.backends import StateBackend
from langchain_openai import ChatOpenAI
from functions.services.firestore_service import FirestoreService

class BaseAgent:
    """Base agent class with context management."""
    
    def __init__(self, agent_name: str, system_prompt: str):
        self.agent_name = agent_name
        self.firestore = FirestoreService()
        
        # Use StateBackend for agent's internal file operations
        # Files are ephemeral within agent execution
        backend = StateBackend()
        
        # Create Deep Agent with custom tools
        self.agent = create_deep_agent(
            model=ChatOpenAI(
                model=os.getenv("LLM_MODEL", "gpt-4"),
                temperature=0.1
            ),
            backend=backend,
            tools=self._get_custom_tools(),
            system_prompt=system_prompt
        )
    
    def _get_custom_tools(self):
        """Get custom tools that bridge to Firestore."""
        from langchain.tools import tool
        
        @tool
        def read_previous_agent_output(agent_name: str, estimate_id: str) -> dict:
            """Read output from a previous agent in the pipeline."""
            return self.firestore.get_agent_output(estimate_id, agent_name)
        
        @tool
        def save_intermediate_result(key: str, data: dict, estimate_id: str) -> str:
            """Save intermediate result to Firestore for pipeline context."""
            self.firestore.save_intermediate_result(estimate_id, key, data)
            return f"Saved {key} to Firestore"
        
        @tool
        def read_clarification_output(estimate_id: str) -> dict:
            """Read the original ClarificationOutput from Firestore."""
            estimate = self.firestore.get_estimate(estimate_id)
            return estimate.get("clarificationOutput", {})
        
        return [
            read_previous_agent_output,
            save_intermediate_result,
            read_clarification_output
        ]
```

## Context Flow Between Agents

### Pipeline Context Flow

```
┌─────────────────────────────────────────────────────────┐
│  ClarificationOutput (Firestore)                        │
│  - Initial input from Dev 3                            │
│  - Stored in /estimates/{id}/clarificationOutput        │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Location Agent                                         │
│  - Reads ClarificationOutput via custom tool            │
│  - Uses Deep Agents file tools for internal processing  │
│  - Saves locationFactors to Firestore                   │
│  - Writes to /estimates/{id}/locationFactors           │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Scope Agent                                            │
│  - Reads ClarificationOutput + locationFactors         │
│  - Uses file tools for BoQ processing                 │
│  - Saves billOfQuantities to Firestore                 │
│  - Writes to /estimates/{id}/billOfQuantities          │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Cost Agent                                             │
│  - Reads billOfQuantities + locationFactors            │
│  - Uses file tools for cost calculations               │
│  - Saves costEstimate to Firestore                     │
│  - Writes to /estimates/{id}/costEstimate              │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Risk Agent                                             │
│  - Reads costEstimate                                  │
│  - Uses file tools for Monte Carlo data                 │
│  - Saves riskAnalysis to Firestore                     │
│  - Writes to /estimates/{id}/riskAnalysis              │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│  Final Agent                                            │
│  - Reads ALL previous outputs                          │
│  - Uses file tools for synthesis                       │
│  - Saves finalEstimate to Firestore                    │
│  - Writes to /estimates/{id}/finalEstimate             │
└─────────────────────────────────────────────────────────┘
```

## Implementation Example: Location Agent

```python
# functions/agents/location_agent.py
from functions.agents.base_agent import BaseAgent
from functions.models.clarification_output import ClarificationOutput

class LocationAgent(BaseAgent):
    """Location Agent with context management."""
    
    def __init__(self):
        super().__init__(
            agent_name="location",
            system_prompt="""You are a location intelligence agent.
            
            Context Management:
            - Use read_clarification_output tool to get initial input
            - Use file system tools (write_file) to store intermediate analysis
            - Use save_intermediate_result tool to persist key findings
            - Final output goes to Firestore via save_agent_output
            
            Your job:
            1. Read ClarificationOutput to get zip code
            2. Analyze location factors
            3. Store intermediate results using file tools
            4. Save final locationFactors to Firestore
            """
        )
    
    async def run(self, estimate_id: str, clarification_output: ClarificationOutput):
        """Run location agent with context management."""
        
        zip_code = clarification_output.project_brief.location.zip_code
        
        # Agent automatically uses file system tools for context
        # Custom tools provide Firestore access
        result = await self.agent.ainvoke({
            "messages": [
                ("user", f"""
                Analyze location factors for estimate {estimate_id}.
                
                Steps:
                1. Read ClarificationOutput using read_clarification_output tool
                2. Extract zip code: {zip_code}
                3. Use file system tools to organize your analysis
                4. Call get_location_factors tool for cost data
                5. Save intermediate results using save_intermediate_result
                6. Generate final locationFactors output
                """)
            ]
        })
        
        # Extract structured output from agent
        location_factors = self._extract_location_factors(result)
        
        # Save to Firestore (pipeline context)
        await self.firestore.update_estimate(
            estimate_id,
            {"locationFactors": location_factors}
        )
        
        # Save agent output for next agents
        await self.firestore.save_agent_output(
            estimate_id,
            "location",
            {
                "status": "completed",
                "output": location_factors,
                "summary": f"Location analysis for {zip_code}",
                "tokens": result.get("usage", {}).get("total_tokens", 0)
            }
        )
        
        return location_factors
```

## Handling Large Context (CAD Data)

For large CAD data that might overflow context:

```python
@tool
def store_cad_data_summary(cad_data: dict, estimate_id: str) -> str:
    """Store CAD data summary in Firestore, return reference."""
    # Store full CAD data in Firestore
    self.firestore.save_intermediate_result(
        estimate_id,
        "cad_data_full",
        cad_data
    )
    
    # Return summary for agent context
    return f"""
    CAD data stored. Summary:
    - Rooms: {len(cad_data.get('spaceModel', {}).get('rooms', []))}
    - Total SqFt: {cad_data.get('scopeSummary', {}).get('totalSqft', 0)}
    - Full data available via read_intermediate_result('cad_data_full')
    """

# Agent can use this to avoid loading full CAD data into context
```

## Best Practices for TrueCost

### 1. **Use StateBackend for Agent Internal Files**
- Agent's file system tools use StateBackend (ephemeral)
- Good for temporary working files during agent execution
- Automatically cleaned up after agent completes

### 2. **Use Firestore for Pipeline Context**
- Store agent outputs in Firestore
- Each agent reads previous agent outputs from Firestore
- Use custom tools to bridge Deep Agents ↔ Firestore

### 3. **Custom Tools for Context Access**
- Create tools that read from Firestore
- Tools that save to Firestore
- Tools that provide summaries of large data

### 4. **File System Tools for Processing**
- Use `write_file` to store intermediate calculations
- Use `read_file` to retrieve stored analysis
- Use `edit_file` to update working documents
- Prevents context window overflow

### 5. **Subagents for Context Isolation**
- Use Deep Agents' `task` tool to spawn subagents
- Subagents have isolated context
- Main agent stays clean

## Example: Scope Agent with Context Management

```python
class ScopeAgent(BaseAgent):
    """Scope Agent with context management."""
    
    def __init__(self):
        super().__init__(
            agent_name="scope",
            system_prompt="""You are a scope agent.
            
            Context Strategy:
            1. Read ClarificationOutput (initial input)
            2. Read locationFactors (from Location Agent)
            3. Use file system tools to process CSI divisions
            4. Store intermediate BoQ calculations in files
            5. Save final billOfQuantities to Firestore
            """
        )
    
    async def run(self, estimate_id: str):
        """Run scope agent with full context."""
        
        result = await self.agent.ainvoke({
            "messages": [
                ("user", f"""
                Enrich Bill of Quantities for estimate {estimate_id}.
                
                Context:
                1. Read ClarificationOutput using read_clarification_output
                2. Read locationFactors using read_previous_agent_output('location')
                3. Process each CSI division:
                   - Use write_file to store division analysis
                   - Use read_file to retrieve when needed
                   - Map items to cost codes
                4. Validate quantities against CAD data
                5. Save final billOfQuantities to Firestore
                """)
            ]
        })
        
        # Extract and save
        bill_of_quantities = self._extract_boq(result)
        await self.firestore.update_estimate(
            estimate_id,
            {"billOfQuantities": bill_of_quantities}
        )
        
        return bill_of_quantities
```

## Summary

**Context Management Strategy for TrueCost:**

1. **Agent Internal**: Deep Agents' file system tools + StateBackend (ephemeral)
2. **Pipeline Context**: Firestore (persistent, shared between agents)
3. **Custom Tools**: Bridge between Deep Agents and Firestore
4. **Large Data**: Store summaries in context, full data in Firestore
5. **Context Flow**: Each agent reads previous outputs from Firestore

This approach gives you:
- ✅ Context window management (file system tools)
- ✅ Pipeline persistence (Firestore)
- ✅ Real-time updates (Firestore listeners)
- ✅ Context isolation (subagents when needed)
- ✅ Scalability (handle large CAD data)




