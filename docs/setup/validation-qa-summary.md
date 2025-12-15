# Validation & QA System - Quick Summary

## Overview

Every agent output is validated by a **validator agent**. If validation fails, the original agent is **retried with feedback** about what went wrong.

## Flow

```
Agent Runs → Validator Checks → Pass? → Continue
                              ↓
                            Fail? → Retry Agent (with feedback) → Validator Checks → ...
```

## Key Components

### 1. Validator Agents
- Check schema compliance
- Validate data quality
- Check completeness
- Verify business logic
- Provide specific feedback

### 2. Retry Logic
- Maximum 2 retries per agent
- Feedback includes:
  - Issues found
  - Specific fields with problems
  - Suggestions for fixes
- Agent receives feedback in system prompt

### 3. Orchestrator Integration
- Automatically validates after each agent
- Handles retries automatically
- Tracks retry counts
- Stores validation results

## Implementation Files

1. **Models**: `functions/models/validation.py`
2. **Base Validator**: `functions/agents/validators/validator_agent.py`
3. **Specialized Validators**: One per agent type
4. **Updated Orchestrator**: Includes validation and retry
5. **Updated Base Agent**: Supports feedback parameter

## Example

```python
# Orchestrator automatically:
# 1. Runs Location Agent
# 2. Validates output
# 3. If fails, retries with feedback
# 4. Repeats up to 2 times
# 5. Continues or fails pipeline

orchestrator = PipelineOrchestrator()
result = await orchestrator.run_pipeline(estimate_id, clarification_output)
```

## Benefits

- ✅ Quality assurance at every step
- ✅ Automatic retry with context
- ✅ Specific, actionable feedback
- ✅ Observable validation results
- ✅ Prevents bad outputs from propagating

## Documentation

- Full guide: `docs/setup/agent-validation-qa.md`
- Code example: `docs/setup/agent-validation-example.py`




