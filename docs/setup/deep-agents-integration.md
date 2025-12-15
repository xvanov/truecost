# Deep Agents Integration Guide for TrueCost

## Overview

This guide explains how to use LangChain's Deep Agents library in the TrueCost deep agent pipeline. Deep Agents provides built-in capabilities for planning, file system management, and subagent spawning - perfect for our multi-agent pipeline.

## Understanding Deep Agents vs MCP

### Deep Agents (`deepagents`)
- **What it is**: A Python library for building agents with planning, file systems, and subagents
- **Installation**: `pip install deepagents`
- **Usage**: Import and use directly in your Python code
- **Built on**: LangGraph

### MCP (Model Context Protocol)
- **What it is**: A protocol for exposing tools and context to LLMs
- **Your setup**: You have the LangChain Docs MCP server installed (provides documentation access)
- **Relationship**: MCP can provide tools that Deep Agents can use, but it's **not required** to use Deep Agents
- **Optional**: You can use MCP tools with Deep Agents if you want, but Deep Agents works standalone

## Installation

Add to `functions/requirements.txt`:

```txt
deepagents>=0.2.0
langchain>=0.1.0
langchain-openai>=0.1.0
langgraph>=0.2.0
```

## Basic Deep Agents Usage

### 1. Simple Agent Creation

```python
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

# Create a model
model = ChatOpenAI(
    model="gpt-4",
    temperature=0.1,
)

# Create a deep agent with custom system prompt
agent = create_deep_agent(
    model=model,
    system_prompt="""You are a construction cost estimation agent.
    Your job is to analyze project data and generate accurate cost estimates.
    Use the planning tool to break down complex tasks into steps.
    Use file system tools to store intermediate results.
    """
)

# Run the agent
result = agent.invoke({
    "messages": [("user", "Analyze this project and estimate costs")]
})
```

### 2. Deep Agents Features

Deep Agents automatically provides:

1. **Planning Tool** (`write_todos`): Break down tasks into steps
2. **File System Tools**: `ls`, `read_file`, `write_file`, `edit_file`
3. **Subagent Spawning** (`task` tool): Delegate work to specialized subagents

### 3. Using with Firestore Backend

For TrueCost, you'll want to use a custom backend that stores files in Firestore:

```python
from deepagents import create_deep_agent
from deepagents.backends import InMemoryBackend  # Or create custom FirestoreBackend
from langchain_openai import ChatOpenAI

# Create backend (you can create a FirestoreBackend later)
backend = InMemoryBackend()

# Create agent with backend
agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    backend=backend,
    system_prompt="Construction cost estimation agent"
)
```

### 4. Custom Tools for TrueCost Agents

You can add custom tools to your Deep Agents:

```python
from langchain.tools import tool
from deepagents import create_deep_agent

@tool
def get_location_factors(zip_code: str) -> dict:
    """Get location-based cost factors for a zip code."""
    # Your implementation
    return {"labor_rate": 45.0, "permit_cost": 5000}

@tool
def calculate_material_cost(item_code: str, quantity: float) -> float:
    """Calculate material cost for an item."""
    # Your implementation
    return 100.0 * quantity

# Create agent with custom tools
agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    tools=[get_location_factors, calculate_material_cost],
    system_prompt="Location intelligence agent for construction estimation"
)
```

## Integration with TrueCost Pipeline

### Location Agent Example

```python
# functions/agents/location_agent.py
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI
from functions.services.firestore_service import FirestoreService
from functions.models.clarification_output import ClarificationOutput

class LocationAgent:
    def __init__(self):
        self.model = ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4"),
            temperature=0.1
        )
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt="""You are a location intelligence agent.
            Analyze zip codes and retrieve location-based cost factors including:
            - Labor rates by trade
            - Permit costs
            - Weather/seasonal factors
            - Union vs non-union markets
            
            Use the planning tool to break down the analysis into steps.
            Store results using file system tools.
            """
        )
        self.firestore = FirestoreService()
    
    async def run(self, clarification_output: ClarificationOutput, estimate_id: str):
        """Run location agent on ClarificationOutput."""
        zip_code = clarification_output.project_brief.location.zip_code
        
        # Invoke agent
        result = await self.agent.ainvoke({
            "messages": [
                ("user", f"Analyze location factors for zip code {zip_code}")
            ]
        })
        
        # Extract location factors from agent output
        location_factors = self._extract_location_factors(result)
        
        # Save to Firestore
        await self.firestore.update_estimate(
            estimate_id,
            {"locationFactors": location_factors}
        )
        
        return location_factors
```

### Orchestrator with Deep Agents

```python
# functions/agents/orchestrator.py
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

class PipelineOrchestrator:
    def __init__(self):
        # Main orchestrator agent can use Deep Agents for coordination
        self.orchestrator = create_deep_agent(
            model=ChatOpenAI(model="gpt-4"),
            system_prompt="""You are the pipeline orchestrator.
            Coordinate the execution of multiple specialized agents:
            1. Location Agent
            2. Scope Agent
            3. Cost Agent
            4. Risk Agent
            5. Final Agent
            
            Use the planning tool to track pipeline progress.
            Use subagents to delegate work to specialized agents.
            """
        )
    
    async def run_pipeline(self, estimate_id: str, clarification_output: dict):
        """Run the full pipeline using Deep Agents."""
        # Agent can plan the pipeline execution
        result = await self.orchestrator.ainvoke({
            "messages": [
                ("user", f"Orchestrate the cost estimation pipeline for estimate {estimate_id}")
            ]
        })
        
        return result
```

## Optional: Using MCP Tools with Deep Agents

If you want to use MCP tools with Deep Agents, you can integrate them:

```python
from langchain_mcp_adapters import MultiServerMCPClient
from deepagents import create_deep_agent

# Connect to MCP servers (if you have any)
mcp_client = MultiServerMCPClient({
    "docs": {
        "transport": "stdio",
        "command": "npx",
        "args": ["@modelcontextprotocol/server-langchain-docs"]
    }
})

# Get tools from MCP
mcp_tools = await mcp_client.get_tools()

# Create agent with MCP tools
agent = create_deep_agent(
    model=ChatOpenAI(model="gpt-4"),
    tools=mcp_tools,  # Add MCP tools
    system_prompt="Agent with access to LangChain documentation via MCP"
)
```

**Note**: This is optional. Deep Agents works perfectly fine without MCP.

## Key Differences from Standard LangChain Agents

1. **Built-in Planning**: Deep Agents have a `write_todos` tool for task decomposition
2. **File System Tools**: Built-in `ls`, `read_file`, `write_file`, `edit_file` tools
3. **Subagent Spawning**: Built-in `task` tool to spawn specialized subagents
4. **Backend Abstraction**: Can use different storage backends (memory, disk, Firestore)

## Best Practices for TrueCost

1. **Use Deep Agents for Complex Agents**: Location, Scope, Cost agents can benefit from planning
2. **Use Standard LangChain for Simple Agents**: If an agent just needs basic tool calling
3. **Custom Backend**: Consider creating a `FirestoreBackend` for Deep Agents to store files in Firestore
4. **Subagents for Isolation**: Use subagents for context isolation (e.g., risk analysis subagent)

## Next Steps

1. Install `deepagents` in `requirements.txt`
2. Create base agent class that wraps Deep Agents
3. Implement Location Agent using Deep Agents
4. Test with Firebase emulators

## References

- [Deep Agents Documentation](https://docs.langchain.com/oss/python/deepagents/overview)
- [Deep Agents Quickstart](https://docs.langchain.com/oss/python/deepagents/quickstart)
- [Deep Agents Customization](https://docs.langchain.com/oss/python/deepagents/customization)




