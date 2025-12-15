"""
Example: Agent Validation and Retry System

This shows how to implement validation and retry logic for the TrueCost pipeline.
"""

import os
import json
from typing import Optional, Dict, List
from enum import Enum
from pydantic import BaseModel
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool


# ============================================================================
# Models
# ============================================================================

class ValidationStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    WARNING = "warning"

class ValidationIssue(BaseModel):
    severity: str  # "error", "warning", "info"
    field: Optional[str] = None
    message: str
    suggestion: Optional[str] = None

class ValidationResult(BaseModel):
    status: ValidationStatus
    agent_name: str
    output_type: str
    issues: List[ValidationIssue]
    confidence: float
    summary: str
    
    @property
    def passed(self) -> bool:
        return self.status == ValidationStatus.PASSED


# ============================================================================
# Validator Agent
# ============================================================================

class ValidatorAgent:
    """Validator agent that checks agent outputs."""
    
    def __init__(self):
        self.model = ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4"),
            temperature=0.1
        )
        
        self.agent = create_deep_agent(
            model=self.model,
            tools=self._get_validation_tools(),
            system_prompt="""You are a quality assurance validator.
            
            Validate agent outputs for:
            1. Schema compliance
            2. Completeness
            3. Data quality
            4. Business logic
            
            Provide specific, actionable feedback.
            """
        )
    
    def _get_validation_tools(self):
        """Get validation tools."""
        
        @tool
        def check_schema(output: dict, schema: dict) -> dict:
            """Check if output matches schema."""
            issues = []
            for field, expected_type in schema.items():
                if field not in output:
                    issues.append({
                        "severity": "error",
                        "field": field,
                        "message": f"Missing required field: {field}",
                        "suggestion": f"Add {field} field"
                    })
            return {"issues": issues, "passed": len(issues) == 0}
        
        @tool
        def check_data_quality(output: dict) -> dict:
            """Check data quality."""
            issues = []
            # Example: Check labor rates
            if "laborRates" in output:
                for trade, rate in output["laborRates"].items():
                    if not isinstance(rate, (int, float)) or rate < 20 or rate > 200:
                        issues.append({
                            "severity": "warning",
                            "field": f"laborRates.{trade}",
                            "message": f"Labor rate {rate} seems unreasonable",
                            "suggestion": "Verify rate against market data"
                        })
            return {"issues": issues, "passed": len(issues) == 0}
        
        return [check_schema, check_data_quality]
    
    async def validate(
        self,
        agent_name: str,
        output: dict,
        expected_schema: Optional[dict] = None
    ) -> ValidationResult:
        """Validate agent output."""
        
        result = await self.agent.ainvoke({
            "messages": [("user", f"""
                Validate {agent_name} agent output.
                
                Output:
                {json.dumps(output, indent=2)}
                
                Expected Schema:
                {json.dumps(expected_schema or {}, indent=2)}
                
                Check:
                1. Schema compliance
                2. Data quality
                3. Completeness
                4. Business logic
            """)]
        })
        
        # Extract validation result (simplified)
        return ValidationResult(
            status=ValidationStatus.PASSED,
            agent_name=agent_name,
            output_type="locationFactors",
            issues=[],
            confidence=0.95,
            summary="Validation passed"
        )


# ============================================================================
# Agent with Feedback Support
# ============================================================================

class LocationAgent:
    """Location Agent with feedback support for retries."""
    
    def __init__(self):
        self.model = ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4"),
            temperature=0.1
        )
    
    async def run(
        self,
        estimate_id: str,
        clarification_output: dict,
        feedback: Optional[dict] = None
    ) -> dict:
        """Run agent with optional feedback."""
        
        # Build system prompt with feedback if retry
        system_prompt = """You are a location intelligence agent.
        Analyze zip codes and retrieve location-based cost factors."""
        
        if feedback:
            system_prompt += f"""
            
            RETRY ATTEMPT - Previous validation found issues:
            
            Issues:
            {json.dumps(feedback.get('issues', []), indent=2)}
            
            Suggestions:
            {json.dumps(feedback.get('suggestions', []), indent=2)}
            
            Please address these issues in your output.
            """
        
        agent = create_deep_agent(
            model=self.model,
            system_prompt=system_prompt
        )
        
        result = await agent.ainvoke({
            "messages": [("user", f"Analyze location for estimate {estimate_id}")]
        })
        
        return self._extract_output(result)
    
    def _extract_output(self, result: dict) -> dict:
        """Extract structured output from agent result."""
        # Implementation to extract locationFactors
        return {
            "zipCode": "80202",
            "laborRates": {"electrician": 55.0},
            "isUnion": False
        }


# ============================================================================
# Orchestrator with Validation
# ============================================================================

class PipelineOrchestrator:
    """Orchestrator with validation and retry."""
    
    MAX_RETRIES = 2
    
    async def run_agent_with_validation(
        self,
        agent_name: str,
        agent: LocationAgent,
        validator: ValidatorAgent,
        estimate_id: str,
        clarification_output: dict
    ) -> dict:
        """Run agent with validation and retry."""
        
        attempt = 0
        validation_passed = False
        last_validation_result = None
        
        while attempt <= self.MAX_RETRIES and not validation_passed:
            # Run agent
            if attempt == 0:
                # First attempt
                agent_output = await agent.run(estimate_id, clarification_output)
            else:
                # Retry with feedback
                feedback = {
                    "issues": last_validation_result.issues,
                    "suggestions": [
                        issue.suggestion for issue in last_validation_result.issues
                        if issue.suggestion
                    ]
                }
                agent_output = await agent.run(
                    estimate_id,
                    clarification_output,
                    feedback=feedback
                )
            
            # Validate
            validation_result = await validator.validate(
                agent_name=agent_name,
                output=agent_output,
                expected_schema={
                    "zipCode": str,
                    "laborRates": dict,
                    "isUnion": bool
                }
            )
            
            if validation_result.passed:
                validation_passed = True
                return agent_output
            else:
                attempt += 1
                last_validation_result = validation_result
                
                if attempt > self.MAX_RETRIES:
                    raise ValueError(
                        f"{agent_name} failed validation after {self.MAX_RETRIES} retries: "
                        f"{validation_result.summary}"
                    )
        
        raise ValueError(f"{agent_name} validation failed")


# ============================================================================
# Usage Example
# ============================================================================

async def example_usage():
    """Example of using validation and retry."""
    
    orchestrator = PipelineOrchestrator()
    location_agent = LocationAgent()
    validator = ValidatorAgent()
    
    # Run with automatic validation and retry
    try:
        result = await orchestrator.run_agent_with_validation(
            agent_name="location",
            agent=location_agent,
            validator=validator,
            estimate_id="est_123",
            clarification_output={"projectBrief": {"location": {"zipCode": "80202"}}}
        )
        print("✅ Agent output validated successfully")
        print(json.dumps(result, indent=2))
    except ValueError as e:
        print(f"❌ Validation failed: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(example_usage())




