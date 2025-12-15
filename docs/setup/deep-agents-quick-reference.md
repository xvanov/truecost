# Deep Agents Quick Reference for TrueCost

## TL;DR: How to Use Deep Agents

1. **Install**: Add `deepagents>=0.2.0` to `functions/requirements.txt`
2. **Import**: `from deepagents import create_deep_agent`
3. **Create**: `agent = create_deep_agent(model=your_model, system_prompt="...")`
4. **Run**: `result = await agent.ainvoke({"messages": [("user", "task")]})`

## Key Points

### ✅ Deep Agents is a Python Library
- Install via pip: `pip install deepagents`
- Use directly in your Python code
- No MCP required (but MCP can optionally provide tools)

### ✅ MCP is Separate (Optional)
- MCP = Model Context Protocol (for exposing tools)
- You have LangChain Docs MCP (for documentation access)
- **Not required** to use Deep Agents
- Can optionally add MCP tools to Deep Agents if you want

### ✅ Deep Agents Provides
1. **Planning Tool** (`write_todos`): Break tasks into steps
2. **File System Tools**: `ls`, `read_file`, `write_file`, `edit_file`
3. **Subagent Tool** (`task`): Spawn specialized subagents

## Basic Pattern

```python
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

# 1. Create model
model = ChatOpenAI(model="gpt-4", temperature=0.1)

# 2. Create agent
agent = create_deep_agent(
    model=model,
    system_prompt="Your agent instructions"
)

# 3. Run agent
result = await agent.ainvoke({
    "messages": [("user", "Your task")]
})
```

## For TrueCost Pipeline

### Location Agent Example

```python
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI

class LocationAgent:
    def __init__(self):
        self.agent = create_deep_agent(
            model=ChatOpenAI(model="gpt-4"),
            system_prompt="Location intelligence agent for construction estimation"
        )
    
    async def run(self, zip_code: str):
        result = await self.agent.ainvoke({
            "messages": [("user", f"Analyze location {zip_code}")]
        })
        return result
```

## When to Use Deep Agents vs Standard LangChain

| Use Deep Agents When | Use Standard LangChain When |
|---------------------|----------------------------|
| Need planning/task breakdown | Simple tool calling |
| Need file system operations | Direct function calls |
| Need subagent spawning | Single agent workflow |
| Complex multi-step tasks | Straightforward tasks |

## Next Steps

1. ✅ Read: `docs/setup/deep-agents-integration.md` (full guide)
2. ✅ Review: `docs/setup/deep-agents-example.py` (code examples)
3. ⏭️ Update: `functions/requirements.txt` (add deepagents)
4. ⏭️ Implement: Location Agent using Deep Agents

## Resources

- [Deep Agents Docs](https://docs.langchain.com/oss/python/deepagents/overview)
- [Deep Agents Quickstart](https://docs.langchain.com/oss/python/deepagents/quickstart)
- [MCP with LangChain](https://docs.langchain.com/oss/python/langchain/mcp) (optional)




