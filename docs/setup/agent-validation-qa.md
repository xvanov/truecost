# Agent Validation & Quality Assurance System

## Overview

This system adds **validator agents** that check the quality of each agent's output. If validation fails, the original agent is retried with feedback about what went wrong. This ensures high-quality outputs throughout the pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Execution                           │
│  (Location, Scope, Cost, Risk, Final)                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Validator Agent                             │
│  - Checks output quality                                     │
│  - Validates against schema                                  │
│  - Checks for completeness                                  │
│  - Identifies issues                                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
    ┌──────────────┐       ┌──────────────┐
    │   PASS       │       │    FAIL      │
    │              │       │              │
    │ Continue     │       │ Retry Agent  │
    │ Pipeline     │       │ with Feedback│
    └──────────────┘       └──────┬───────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │  Retry Agent    │
                          │  (with context) │
                          └─────────────────┘
```

## Validation Flow

### Step 1: Agent Executes

```python
# Location Agent runs
location_result = await location_agent.run(estimate_id, clarification_output)
```

### Step 2: Validator Checks Output

```python
# Validator Agent checks the output
validation_result = await validator_agent.validate(
    agent_name="location",
    output=location_result,
    estimate_id=estimate_id
)
```

### Step 3: Handle Validation Result

```python
if validation_result.passed:
    # Continue to next agent
    continue
else:
    # Retry with feedback
    location_result = await location_agent.run(
        estimate_id,
        clarification_output,
        feedback=validation_result.issues  # Context about what went wrong
    )
```

## Implementation

### 1. Validation Models

```python
# functions/models/validation.py
from pydantic import BaseModel
from typing import List, Optional
from enum import Enum

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
    confidence: float  # 0.0 to 1.0
    summary: str
    passed: bool  # Convenience field
    
    @property
    def passed(self) -> bool:
        return self.status == ValidationStatus.PASSED
```

### 2. Validator Agent Base Class

```python
# functions/agents/validator_agent.py
from deepagents import create_deep_agent
from langchain_openai import ChatOpenAI
from langchain.tools import tool
from functions.models.validation import ValidationResult, ValidationIssue, ValidationStatus
from functions.services.firestore_service import FirestoreService

class ValidatorAgent:
    """Base validator agent that checks agent outputs."""
    
    def __init__(self):
        self.firestore = FirestoreService()
        self.model = ChatOpenAI(
            model=os.getenv("LLM_MODEL", "gpt-4"),
            temperature=0.1
        )
        
        # Create validator agent with validation tools
        self.agent = create_deep_agent(
            model=self.model,
            tools=self._get_validation_tools(),
            system_prompt="""You are a quality assurance validator agent.
            
            Your job is to validate agent outputs for:
            1. Schema compliance - Does output match expected structure?
            2. Completeness - Are all required fields present?
            3. Data quality - Are values reasonable and consistent?
            4. Business logic - Do calculations make sense?
            
            Use the planning tool to organize your validation.
            Use file system tools to store validation details.
            Provide specific, actionable feedback when issues are found.
            """
        )
    
    def _get_validation_tools(self):
        """Get tools for validation."""
        from langchain.tools import tool
        
        @tool
        def check_schema_compliance(output: dict, expected_schema: dict) -> dict:
            """Check if output matches expected schema."""
            # Schema validation logic
            issues = []
            for field, expected_type in expected_schema.items():
                if field not in output:
                    issues.append({
                        "severity": "error",
                        "field": field,
                        "message": f"Missing required field: {field}",
                        "suggestion": f"Add {field} field with type {expected_type}"
                    })
            return {"issues": issues, "passed": len(issues) == 0}
        
        @tool
        def check_data_quality(output: dict, context: dict) -> dict:
            """Check data quality and reasonableness."""
            # Data quality checks
            issues = []
            # Example: Check if labor rates are reasonable
            if "laborRates" in output:
                for trade, rate in output["laborRates"].items():
                    if rate < 20 or rate > 200:
                        issues.append({
                            "severity": "warning",
                            "field": f"laborRates.{trade}",
                            "message": f"Labor rate {rate} seems unreasonable for {trade}",
                            "suggestion": "Verify rate against market data"
                        })
            return {"issues": issues, "passed": len(issues) == 0}
        
        return [check_schema_compliance, check_data_quality]
    
    async def validate(
        self,
        agent_name: str,
        output: dict,
        estimate_id: str,
        expected_schema: Optional[dict] = None
    ) -> ValidationResult:
        """Validate an agent's output."""
        
        # Get context for validation
        estimate = await self.firestore.get_estimate(estimate_id)
        clarification_output = estimate.get("clarificationOutput", {})
        
        # Run validator agent
        result = await self.agent.ainvoke({
            "messages": [("user", f"""
                Validate the output from {agent_name} agent.
                
                Output to validate:
                {json.dumps(output, indent=2)}
                
                Context:
                - Estimate ID: {estimate_id}
                - Clarification Output: {json.dumps(clarification_output, indent=2)}
                - Expected Schema: {json.dumps(expected_schema or {}, indent=2)}
                
                Steps:
                1. Check schema compliance
                2. Check data quality
                3. Check completeness
                4. Check business logic
                5. Provide specific feedback for any issues
            """)]
        })
        
        # Extract validation result
        validation_result = self._extract_validation_result(result, agent_name)
        
        # Save validation result
        await self.firestore.save_validation_result(
            estimate_id,
            agent_name,
            validation_result
        )
        
        return validation_result
    
    def _extract_validation_result(self, agent_result: dict, agent_name: str) -> ValidationResult:
        """Extract validation result from agent output."""
        # Parse agent response to extract validation result
        # This would parse the LLM's structured response
        # For now, simplified example:
        
        # In real implementation, you'd parse the agent's response
        # which should be structured JSON with validation details
        
        return ValidationResult(
            status=ValidationStatus.PASSED,  # or FAILED
            agent_name=agent_name,
            output_type="locationFactors",
            issues=[],
            confidence=0.95,
            summary="Validation passed"
        )
```

### 3. Specialized Validators

```python
# functions/agents/validators/location_validator.py
from functions.agents.validator_agent import ValidatorAgent

class LocationValidator(ValidatorAgent):
    """Specialized validator for Location Agent output."""
    
    EXPECTED_SCHEMA = {
        "zipCode": str,
        "laborRates": dict,
        "isUnion": bool,
        "permitCosts": dict,
        "weatherFactors": dict
    }
    
    async def validate_location_output(
        self,
        location_factors: dict,
        estimate_id: str
    ) -> ValidationResult:
        """Validate location factors output."""
        
        result = await self.agent.ainvoke({
            "messages": [("user", f"""
                Validate location factors output.
                
                Specific checks:
                1. zipCode must be valid 5-digit US zip code
                2. laborRates must have rates for common trades (electrician, plumber, etc.)
                3. All rates must be between $20-$200/hour
                4. isUnion must be boolean
                5. permitCosts must have percentage or fixed amount
                6. Weather factors must be relevant to location
                
                Output:
                {json.dumps(location_factors, indent=2)}
            """)]
        })
        
        return self._extract_validation_result(result, "location")
```

### 4. Updated Orchestrator with Validation

```python
# functions/agents/orchestrator.py
from functions.agents.validators.location_validator import LocationValidator
from functions.agents.validators.scope_validator import ScopeValidator
from functions.agents.validators.cost_validator import CostValidator
from functions.models.validation import ValidationStatus

class PipelineOrchestrator:
    """Orchestrator with validation and retry logic."""
    
    DEEP_AGENT_SEQUENCE = [
        ("location", LocationAgent, LocationValidator),
        ("scope", ScopeAgent, ScopeValidator),
        ("cost", CostAgent, CostValidator),
        ("risk", RiskAgent, RiskValidator),
        ("final", FinalAgent, FinalValidator),
    ]
    
    MAX_RETRIES = 2  # Maximum retries per agent
    
    async def run_pipeline(
        self,
        estimate_id: str,
        clarification_output: dict
    ):
        """Run pipeline with validation and retry."""
        
        # Store initial input
        await self.firestore.update_estimate(estimate_id, {
            "clarificationOutput": clarification_output,
            "pipelineStatus": {
                "currentAgent": "location",
                "completedAgents": [],
                "progress": 0,
                "retries": {}
            }
        })
        
        # Execute each agent with validation
        for agent_name, agent_class, validator_class in self.DEEP_AGENT_SEQUENCE:
            agent = agent_class()
            validator = validator_class()
            
            # Try with retries
            attempt = 0
            validation_passed = False
            
            while attempt <= self.MAX_RETRIES and not validation_passed:
                try:
                    # Update status
                    await self._update_agent_status(
                        estimate_id,
                        agent_name,
                        "running",
                        attempt
                    )
                    
                    # Run agent (with feedback if retry)
                    if attempt == 0:
                        # First attempt - no feedback
                        agent_output = await agent.run(estimate_id, clarification_output)
                    else:
                        # Retry - include feedback from previous validation
                        previous_validation = await self.firestore.get_validation_result(
                            estimate_id,
                            agent_name
                        )
                        feedback = {
                            "issues": previous_validation.issues,
                            "suggestions": [
                                issue.suggestion for issue in previous_validation.issues
                            ]
                        }
                        agent_output = await agent.run(
                            estimate_id,
                            clarification_output,
                            feedback=feedback
                        )
                    
                    # Validate output
                    validation_result = await validator.validate(
                        agent_name=agent_name,
                        output=agent_output,
                        estimate_id=estimate_id
                    )
                    
                    if validation_result.passed:
                        validation_passed = True
                        
                        # Save output
                        await self._save_agent_output(
                            estimate_id,
                            agent_name,
                            agent_output
                        )
                        
                        # Mark complete
                        await self._update_agent_status(
                            estimate_id,
                            agent_name,
                            "completed",
                            attempt
                        )
                        
                    else:
                        # Validation failed
                        attempt += 1
                        
                        if attempt > self.MAX_RETRIES:
                            # Max retries reached
                            await self._update_agent_status(
                                estimate_id,
                                agent_name,
                                "failed",
                                attempt,
                                error=f"Validation failed after {self.MAX_RETRIES} retries: {validation_result.summary}"
                            )
                            raise ValidationError(
                                f"{agent_name} agent failed validation: {validation_result.summary}",
                                validation_result
                            )
                        
                        # Log retry
                        await self.firestore.update_estimate(estimate_id, {
                            f"pipelineStatus.retries.{agent_name}": attempt
                        })
                        
                except Exception as e:
                    # Agent execution error
                    attempt += 1
                    
                    if attempt > self.MAX_RETRIES:
                        await self._update_agent_status(
                            estimate_id,
                            agent_name,
                            "failed",
                            attempt,
                            error=str(e)
                        )
                        raise
                    
                    # Retry on error
                    await self.firestore.update_estimate(estimate_id, {
                        f"pipelineStatus.retries.{agent_name}": attempt
                    })
```

### 5. Updated Base Agent with Feedback Support

```python
# functions/agents/base_agent.py
class BaseAgent:
    """Base agent with feedback support for retries."""
    
    async def run(
        self,
        estimate_id: str,
        clarification_output: dict,
        feedback: Optional[dict] = None
    ):
        """Run agent with optional feedback from validation."""
        
        # Build system prompt with feedback if provided
        system_prompt = self._build_system_prompt()
        
        if feedback:
            system_prompt += f"""
            
            IMPORTANT: This is a retry attempt. Previous validation found issues:
            
            Issues Found:
            {json.dumps(feedback.get('issues', []), indent=2)}
            
            Suggestions:
            {json.dumps(feedback.get('suggestions', []), indent=2)}
            
            Please address these issues in your output.
            """
        
        # Create agent with updated prompt
        agent = create_deep_agent(
            model=self.model,
            system_prompt=system_prompt,
            tools=self._get_custom_tools()
        )
        
        # Run agent
        result = await agent.ainvoke({
            "messages": [("user", self._build_user_message(estimate_id, clarification_output))]
        })
        
        return self._extract_output(result)
```

## Validation Rules by Agent

### Location Agent Validation

```python
LOCATION_VALIDATION_RULES = {
    "required_fields": ["zipCode", "laborRates", "isUnion", "permitCosts"],
    "zipCode_format": r"^\d{5}$",
    "laborRates_range": (20, 200),  # $/hour
    "permitCosts_required": ["percentage", "fixedAmount"],
    "checks": [
        "zipCode must be valid US zip code",
        "laborRates must include common trades",
        "All rates must be reasonable for location",
        "isUnion must be boolean",
        "permitCosts must be positive"
    ]
}
```

### Scope Agent Validation

```python
SCOPE_VALIDATION_RULES = {
    "required_fields": ["divisions", "totalItems", "totalQuantity"],
    "checks": [
        "All CSI divisions must have status (included/excluded)",
        "Included divisions must have line items",
        "Each line item must have costCode",
        "Quantities must match CAD data",
        "Material selections must match finishLevel"
    ]
}
```

### Cost Agent Validation

```python
COST_VALIDATION_RULES = {
    "required_fields": ["materials", "labor", "equipment", "subtotals", "total"],
    "checks": [
        "Material costs = quantity × unit cost",
        "Labor costs = hours × rate",
        "Location factors applied correctly",
        "Overhead and profit calculated correctly",
        "Total matches sum of components"
    ]
}
```

## Firestore Schema Updates

```typescript
// Add validation results to estimate document
{
  estimateId: string,
  // ... existing fields ...
  
  // Validation results
  validations: {
    location: ValidationResult,
    scope: ValidationResult,
    cost: ValidationResult,
    risk: ValidationResult,
    final: ValidationResult
  },
  
  // Retry tracking
  pipelineStatus: {
    currentAgent: string,
    completedAgents: string[],
    progress: number,
    retries: {
      location: number,
      scope: number,
      cost: number,
      risk: number,
      final: number
    }
  }
}

// Validation result subcollection
// /estimates/{id}/validations/{agentName}
{
  status: "passed" | "failed" | "warning",
  agent_name: string,
  issues: ValidationIssue[],
  confidence: number,
  summary: string,
  createdAt: timestamp
}
```

## Usage Example

```python
# Orchestrator automatically handles validation
orchestrator = PipelineOrchestrator()

# Run pipeline - validation happens automatically
result = await orchestrator.run_pipeline(
    estimate_id="est_123",
    clarification_output={...}
)

# If validation fails, agent is automatically retried with feedback
# If retries exhausted, pipeline fails with detailed error
```

## Benefits

1. **Quality Assurance**: Every agent output is validated
2. **Automatic Retry**: Failed validations trigger retries with feedback
3. **Context-Aware**: Retries include specific feedback about issues
4. **Observable**: Validation results stored in Firestore
5. **Flexible**: Can add custom validation rules per agent

## Next Steps

1. Create validation models (`functions/models/validation.py`)
2. Create base validator agent (`functions/agents/validator_agent.py`)
3. Create specialized validators for each agent
4. Update orchestrator with validation and retry logic
5. Update base agent to support feedback
6. Add validation results to Firestore schema
7. Test validation and retry flow




