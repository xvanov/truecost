"""
Example: Using Deep Agents in TrueCost Pipeline

This example shows how to use LangChain Deep Agents for the Location Agent.
Deep Agents provide built-in planning, file system tools, and subagent capabilities.
"""

import os
from typing import Dict, Any
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool


# Example 1: Basic Deep Agent for Location Analysis
def create_location_agent():
    """Create a Location Agent using Deep Agents."""
    
    # Initialize the LLM
    model = ChatOpenAI(
        model=os.getenv("LLM_MODEL", "gpt-4"),
        temperature=0.1,
    )
    
    # Create custom tools for location analysis
    @tool
    def get_zip_code_data(zip_code: str) -> Dict[str, Any]:
        """Get location data for a zip code from cost database."""
        # In real implementation, this would call cost_data_service
        return {
            "zip_code": zip_code,
            "city": "Denver",
            "state": "CO",
            "labor_rates": {
                "electrician": 55.0,
                "plumber": 60.0,
                "carpenter": 50.0,
            },
            "is_union": False,
            "permit_cost_percentage": 0.05,
        }
    
    # Create the deep agent
    agent = create_deep_agent(
        model=model,
        tools=[get_zip_code_data],
        system_prompt="""You are a location intelligence agent for construction cost estimation.
        
        Your responsibilities:
        1. Analyze zip codes to determine location-based cost factors
        2. Retrieve labor rates by trade
        3. Determine union vs non-union market status
        4. Calculate permit costs
        5. Identify weather/seasonal factors
        
        Use the built-in planning tool (write_todos) to break down your analysis into steps.
        Use file system tools to store intermediate results if needed.
        
        Always provide structured output with:
        - Labor rates by trade
        - Union status
        - Permit cost estimates
        - Regional factors
        """
    )
    
    return agent


# Example 2: Using Deep Agent with Planning
async def run_location_analysis(zip_code: str):
    """Run location analysis using Deep Agent with planning."""
    
    agent = create_location_agent()
    
    # The agent will use its planning tool to break down the task
    result = await agent.ainvoke({
        "messages": [
            ("user", f"Analyze location factors for zip code {zip_code} and provide a comprehensive report")
        ]
    })
    
    return result


# Example 3: Deep Agent with Subagents
def create_scope_agent():
    """Create a Scope Agent that can spawn subagents for complex analysis."""
    
    model = ChatOpenAI(
        model=os.getenv("LLM_MODEL", "gpt-4"),
        temperature=0.1,
    )
    
    @tool
    def validate_csi_division(division_code: str, line_items: list) -> Dict[str, Any]:
        """Validate a CSI division's line items."""
        return {
            "division": division_code,
            "valid": True,
            "item_count": len(line_items),
            "warnings": []
        }
    
    agent = create_deep_agent(
        model=model,
        tools=[validate_csi_division],
        system_prompt="""You are a construction scope agent.
        
        Your job is to:
        1. Enrich Bill of Quantities with cost codes
        2. Validate quantities against CAD data
        3. Verify completeness for project type
        4. Suggest missing items
        
        Use the built-in subagent tool (task) to delegate complex validation tasks.
        Use planning tool to organize your work.
        """
    )
    
    return agent


# Example 4: Integration with Firestore
class LocationAgentWithFirestore:
    """Location Agent that integrates Deep Agents with Firestore."""
    
    def __init__(self, firestore_service):
        self.firestore = firestore_service
        self.model = ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4"),
            temperature=0.1,
        )
        self.agent = create_deep_agent(
            model=self.model,
            system_prompt="Location intelligence agent for construction estimation"
        )
    
    async def run(self, clarification_output: Dict, estimate_id: str) -> Dict:
        """Run location agent and save results to Firestore."""
        
        zip_code = clarification_output["projectBrief"]["location"]["zipCode"]
        
        # Use Deep Agent to analyze location
        result = await self.agent.ainvoke({
            "messages": [
                ("user", f"Analyze location factors for zip code {zip_code}")
            ]
        })
        
        # Extract structured output (you'll need to parse the agent's response)
        location_factors = self._extract_location_factors(result)
        
        # Save to Firestore
        await self.firestore.update_estimate(
            estimate_id,
            {"locationFactors": location_factors}
        )
        
        return location_factors
    
    def _extract_location_factors(self, agent_result) -> Dict:
        """Extract location factors from agent output."""
        # In real implementation, parse the agent's response
        # This is a simplified example
        return {
            "zipCode": "80202",
            "laborRates": {
                "electrician": 55.0,
                "plumber": 60.0,
            },
            "isUnion": False,
        }


# Example 5: Using MCP Tools (Optional)
async def create_agent_with_mcp():
    """Example of using MCP tools with Deep Agents (optional)."""
    
    try:
        from langchain_mcp_adapters import MultiServerMCPClient
        
        # Connect to MCP server (if configured)
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
        model = ChatOpenAI(model="gpt-4")
        agent = create_deep_agent(
            model=model,
            tools=mcp_tools,  # Add MCP tools
            system_prompt="Agent with access to LangChain docs via MCP"
        )
        
        return agent
    except ImportError:
        # MCP adapters not installed - that's fine, it's optional
        print("MCP adapters not installed. Deep Agents works without MCP.")
        return None


if __name__ == "__main__":
    # Example usage
    import asyncio
    
    async def main():
        # Create and run location agent
        agent = create_location_agent()
        result = await agent.ainvoke({
            "messages": [("user", "Analyze location for zip code 80202")]
        })
        print(result)
    
    asyncio.run(main())




