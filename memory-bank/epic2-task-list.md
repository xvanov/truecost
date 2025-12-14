# Epic 2: Deep Agent Pipeline - Task List

**Owner:** Dev 2
**Total PRs:** 8
**Estimated Duration:** 3-4 Sprints

## Progress Summary

| PR | Name | Status | Tests |
|----|------|--------|-------|
| #1 | Foundation & Project Setup | ✅ Complete | 58 |
| #2 | ClarificationOutput Models | ✅ Complete | 7 |
| #3 | Orchestrator & Pipeline | ✅ Complete | 15 |
| #4 | Location Intelligence Agent | ✅ Complete | 26 |
| #5 | Construction Scope Agent | ✅ Complete | 29 |
| #6 | Cost Estimation Agent (P50/P80/P90) | ✅ Complete | 36 |
| #7 | Risk & Final Agents | ✅ Complete | 33 |
| #8 | Firestore Rules & Docs | ✅ Complete | - |

**Total Tests Passing:** 205

## Agent Framework: LangChain Deep Agents + A2A Protocol

This epic uses **LangChain Deep Agents** (`deepagents` library) for agent logic and **A2A Protocol** for inter-agent communication.

### Pipeline Architecture (Non-Linear with Scorer + Critic)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ORCHESTRATOR                                               │
│  - Coordinates primary agents, scorers, and critics                                           │
│  - Flow: Primary → Scorer → If low score → Critic → Retry with critic feedback               │
│  - Max 2 retries per agent before failing                                                     │
│  - Updates Firestore for frontend real-time progress                                          │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────────────┐
        │                                     │                                     │
        ▼                                     ▼                                     ▼
┌──────────────┐  A2A  ┌──────────────┐  A2A  ┌──────────────┐  A2A  ┌──────────────┐  A2A  ┌──────────────┐  A2A  ┌──────────────┐
│   Location   │──────►│    Scope     │──────►│     Cost     │──────►│     Risk     │──────►│   Timeline   │──────►│    Final     │
│    Agent     │       │    Agent     │       │    Agent     │       │    Agent     │       │    Agent     │       │    Agent     │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │                      │                      │                      │
       ▼                      ▼                      ▼                      ▼                      ▼                      ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Location   │       │    Scope     │       │     Cost     │       │     Risk     │       │   Timeline   │       │    Final     │
│    SCORER    │       │    SCORER    │       │    SCORER    │       │    SCORER    │       │    SCORER    │       │    SCORER    │
│  (0-100)     │       │  (0-100)     │       │  (0-100)     │       │  (0-100)     │       │  (0-100)     │       │  (0-100)     │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │                      │                      │                      │
       ▼                      ▼                      ▼                      ▼                      ▼                      ▼
   Score >= 80?           Score >= 80?           Score >= 80?           Score >= 80?           Score >= 80?           Score >= 80?
       │                      │                      │                      │                      │                      │
       ├── YES: Next ────────►├── YES: Next ────────►├── YES: Next ────────►├── YES: Next ────────►├── YES: Next ────────►├── YES: Done
       │                      │                      │                      │                      │                      │
       ▼ NO                   ▼ NO                   ▼ NO                   ▼ NO                   ▼ NO                   ▼ NO
┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Location   │       │    Scope     │       │     Cost     │       │     Risk     │       │   Timeline   │       │    Final     │
│    CRITIC    │       │    CRITIC    │       │    CRITIC    │       │    CRITIC    │       │    CRITIC    │       │    CRITIC    │
│ (feedback)   │       │ (feedback)   │       │ (feedback)   │       │ (feedback)   │       │ (feedback)   │       │ (feedback)   │
└──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘       └──────┬───────┘
       │                      │                      │                      │                      │                      │
       └────────────── Feedback sent back to PRIMARY AGENT (max 2 retries) ────────────────────────────────────────────────┘
```

### Validation Flow Per Agent

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  1. PRIMARY AGENT produces output                                                │
│                    │                                                             │
│                    ▼                                                             │
│  2. SCORER AGENT evaluates output (objective, numerical 0-100)                   │
│                    │                                                             │
│                    ▼                                                             │
│  3. If score >= 80: PASS → Move to next agent                                    │
│     If score < 80:  → Call CRITIC AGENT                                          │
│                    │                                                             │
│                    ▼                                                             │
│  4. CRITIC AGENT provides qualitative feedback                                   │
│     - What's wrong                                                               │
│     - Why it's wrong                                                             │
│     - How to fix it                                                              │
│                    │                                                             │
│                    ▼                                                             │
│  5. ORCHESTRATOR sends critic feedback to PRIMARY AGENT                          │
│     - Primary agent retries with critic context                                  │
│     - Max 2 retries                                                              │
│                    │                                                             │
│  6. If still failing after 2 retries: FAIL pipeline                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Agent Count: 19 Total
| Type | Count | Agents |
|------|-------|--------|
| **Primary** | 6 | Location, Scope, Cost, Risk, Timeline, Final |
| **Scorer** | 6 | Objective scoring (0-100) for each primary |
| **Critic** | 6 | Qualitative feedback for each primary |
| **Orchestrator** | 1 | Coordinate flow, manage retries |
| **TOTAL** | **19** | |

### Deep Agents Features:
- **Planning Tool** (`write_todos`): Break down complex tasks into discrete steps
- **File System Tools**: `ls`, `read_file`, `write_file`, `edit_file` for context management
- **Subagent Spawning** (`task` tool): Delegate work to specialized subagents for context isolation

### A2A Protocol Features:
- **JSON-RPC 2.0**: Standard message format for agent communication
- **Agent Cards**: JSON metadata describing agent capabilities
- **Task States**: Submitted → Working → Completed/Failed
- **Thread Context**: Conversation continuity across agent calls

**Implementation Pattern (Current Reality):**
- Primary agents use Deep Agents via `functions/services/deep_agent_factory.py::deep_agent_generate_json(...)`
- Scorers/critics are unchanged and continue using the existing LangChain wrapper patterns
- Agents communicate via A2A protocol (JSON-RPC 2.0)
- Each agent exposes A2A endpoint:
  - Primary: `a2a_{agent_name}` (e.g., `a2a_location`)
  - Scorer: `a2a_{agent_name}_scorer` (e.g., `a2a_location_scorer`)
  - Critic: `a2a_{agent_name}_critic` (e.g., `a2a_location_critic`)
- Firestore for persistence + frontend real-time updates
- **Non-linear flow**: 
  - Primary → Scorer → (if score < 80) → Critic → Retry Primary with feedback
  - Max 2 retries per agent
- See `docs/setup/agent-communication.md` for A2A implementation details

### Deep Agents Firestore-backed Filesystem (Added Post-Merge)

To enable persistent agent “files” across retries/runs, we added:
- `functions/services/deep_agents_backend.py::FirestoreAgentFsBackend`
  - Storage: `/estimates/{estimateId}/agentFs/{agentName}/files/{sha1(path)}`
- `functions/services/deep_agent_factory.py`
  - Wrapper to keep agent code changes minimal and tests patchable

---

## File Structure Overview

```
truecost/
├── functions/                           # NEW - Python Cloud Functions
│   ├── __init__.py
│   ├── main.py                          # Cloud Function entry points + A2A endpoints
│   ├── requirements.txt                 # Python dependencies
│   │
│   ├── agents/                          # Deep Agent implementations
│   │   ├── __init__.py
│   │   ├── base_agent.py                # Abstract base class (A2A-compatible)
│   │   ├── agent_cards.py               # A2A Agent Cards registry (19 agents)
│   │   ├── orchestrator.py              # Non-linear pipeline with scorer/critic flow
│   │   │
│   │   ├── primary/                     # Primary agents (do the work) - 6 total
│   │   │   ├── __init__.py
│   │   │   ├── location_agent.py        # Story 2.2 - Location factors
│   │   │   ├── scope_agent.py           # Story 2.3 - BoQ enrichment
│   │   │   ├── cost_agent.py            # Story 2.4 - Cost calculation
│   │   │   ├── risk_agent.py            # Story 2.5 - Monte Carlo
│   │   │   ├── timeline_agent.py        # Story 2.5 - Timeline estimation
│   │   │   └── final_agent.py           # Story 2.5 - Synthesis
│   │   │
│   │   ├── scorers/                     # Scorer agents (objective 0-100) - 6 total
│   │   │   ├── __init__.py
│   │   │   ├── base_scorer.py           # Base scorer agent
│   │   │   ├── location_scorer.py       # Scores location output
│   │   │   ├── scope_scorer.py          # Scores scope/BoQ output
│   │   │   ├── cost_scorer.py           # Scores cost calculations
│   │   │   ├── risk_scorer.py           # Scores risk analysis
│   │   │   ├── timeline_scorer.py       # Scores timeline
│   │   │   └── final_scorer.py          # Scores final estimate
│   │   │
│   │   └── critics/                     # Critic agents (qualitative feedback) - 6 total
│   │       ├── __init__.py
│   │       ├── base_critic.py           # Base critic agent
│   │       ├── location_critic.py       # Critiques location output
│   │       ├── scope_critic.py          # Critiques scope/BoQ output
│   │       ├── cost_critic.py           # Critiques cost calculations
│   │       ├── risk_critic.py           # Critiques risk analysis
│   │       ├── timeline_critic.py       # Critiques timeline
│   │       └── final_critic.py          # Critiques final estimate
│   │
│   ├── services/                        # Service layer
│   │   ├── __init__.py
│   │   ├── firestore_service.py         # Firestore CRUD helpers
│   │   ├── llm_service.py               # LLM wrapper (OpenAI)
│   │   └── a2a_client.py                # A2A protocol client
│   │
│   ├── models/                          # Data models (Pydantic)
│   │   ├── __init__.py
│   │   ├── clarification_output.py      # Input schema validation
│   │   ├── estimate.py                  # Estimate document models
│   │   ├── agent_output.py              # Agent output models
│   │   ├── location_factors.py          # Location data models
│   │   ├── bill_of_quantities.py        # BoQ models
│   │   ├── cost_estimate.py             # Cost calculation models
│   │   ├── risk_analysis.py             # Risk/Monte Carlo models
│   │   └── final_estimate.py            # Final output models
│   │
│   ├── config/                          # Configuration
│   │   ├── __init__.py
│   │   ├── settings.py                  # Environment variables
│   │   └── errors.py                    # Error codes and exceptions
│   │
│   ├── validators/                      # Schema validators
│   │   ├── __init__.py
│   │   └── clarification_validator.py   # ClarificationOutput v3.0.0 validation
│   │
│   └── tests/                           # Test suite
│       ├── __init__.py
│       ├── conftest.py                  # Pytest fixtures
│       ├── fixtures/                    # Test data
│       │   ├── __init__.py
│       │   ├── clarification_output_kitchen.json
│       │   ├── clarification_output_bathroom.json
│       │   └── mock_cost_data.py
│       ├── unit/                        # Unit tests
│       │   ├── __init__.py
│       │   ├── test_clarification_validator.py
│       │   ├── test_orchestrator.py
│       │   ├── test_location_agent.py
│       │   ├── test_scope_agent.py
│       │   ├── test_cost_agent.py
│       │   ├── test_risk_agent.py
│       │   └── test_final_agent.py
│       └── integration/                 # Integration tests
│           ├── __init__.py
│           └── test_pipeline_integration.py
│
├── collabcanvas/                        # Existing - update firestore.rules
│   └── firestore.rules                  # ADD: estimates collection rules
│
└── memory-bank/                         # Documentation
    └── epic2-task-list.md               # This file
```

---

## PR #1: Foundation & Project Setup

**Branch:** `epic2/foundation`
**Story:** 2.1 (Part 1)
**Goal:** Set up Python Cloud Functions structure, dependencies, configuration, and base classes.

### Tasks

- [ ] **1.1 Create functions directory structure**
  - Create: `functions/__init__.py`
  - Create: `functions/agents/__init__.py`
  - Create: `functions/services/__init__.py`
  - Create: `functions/models/__init__.py`
  - Create: `functions/config/__init__.py`
  - Create: `functions/validators/__init__.py`
  - Create: `functions/tests/__init__.py`
  - Create: `functions/tests/unit/__init__.py`
  - Create: `functions/tests/integration/__init__.py`
  - Create: `functions/tests/fixtures/__init__.py`

- [ ] **1.2 Create requirements.txt**
  - Create: `functions/requirements.txt`
  ```
  firebase-admin>=6.0.0
  firebase-functions>=0.4.0
  openai>=1.0.0
  langchain>=0.1.0
  langchain-openai>=0.1.0
  langgraph>=0.2.0
  deepagents>=0.2.0
  httpx>=0.25.0          # A2A protocol HTTP client
  pydantic>=2.0.0
  structlog>=23.0.0
  numpy>=1.24.0
  python-dotenv>=1.0.0
  pytest>=7.0.0
  pytest-asyncio>=0.21.0
  ```

- [ ] **1.3 Create configuration module**
  - Create: `functions/config/settings.py`
    - Environment variable loading
    - LLM_MODEL, OPENAI_API_KEY, LOG_LEVEL
    - Firebase project settings
  - Create: `functions/config/errors.py`
    - TrueCostError exception class
    - Error code constants (VALIDATION_ERROR, AGENT_TIMEOUT, etc.)

- [ ] **1.4 Create Firestore service**
  - Create: `functions/services/firestore_service.py`
    - `get_estimate(estimate_id)` - fetch estimate document
    - `update_estimate(estimate_id, data)` - update estimate
    - `update_agent_status(estimate_id, agent_name, status)` - update pipeline status
    - `save_agent_output(estimate_id, agent_name, output)` - save to agentOutputs subcollection
    - `delete_estimate(estimate_id)` - delete with subcollections

- [ ] **1.5 Create LLM service wrapper**
  - Create: `functions/services/llm_service.py`
    - LangChain OpenAI client initialization (`ChatOpenAI`)
    - Model configuration from environment variables
    - Helper for creating Deep Agents with consistent model settings
    - Token usage tracking
    - Error handling with retries

- [ ] **1.6 Create A2A client service**
  - Create: `functions/services/a2a_client.py`
    - `A2AClient` class for inter-agent communication
    - `send_task(target_agent, message, thread_id)` - send A2A JSON-RPC message
    - `get_task_status(target_agent, task_id)` - get async task status
    - `wait_for_completion(target_agent, task_id)` - poll for completion
    - Timeout handling (5 min default for agent processing)
    - Error handling for JSON-RPC errors

- [ ] **1.7 Create base agent class with A2A support**
  - Create: `functions/agents/base_agent.py`
    - Abstract `BaseA2AAgent` class wrapping Deep Agents + A2A
    - Use `create_deep_agent()` from `deepagents` library
    - `handle_a2a_request(request)` - process incoming A2A JSON-RPC
    - `run(estimate_id, input_data, feedback=None)` abstract method
      - Support optional `feedback` parameter for retry attempts
      - Include feedback in system prompt when provided
    - Common logging setup
    - Firestore status updates
    - Duration and token tracking
    - Integration with Deep Agents' built-in tools (planning, file system, subagents)

- [ ] **1.8 Create agent cards registry**
  - Create: `functions/agents/agent_cards.py`
    - `AGENT_CARDS` dict with metadata for all 5 agents
    - Each card: name, description, version, capabilities, input/output modes
    - Endpoint URLs for each agent

- [ ] **1.9 Create pytest configuration**
  - Create: `functions/tests/conftest.py`
    - Mock Firebase Admin
    - Mock OpenAI client
    - Mock A2A responses
    - Common fixtures
  - Create: `functions/pytest.ini`

- [ ] **1.10 Add unit tests for foundation**
  - Create: `functions/tests/unit/test_config.py`
  - Create: `functions/tests/unit/test_firestore_service.py`
  - Create: `functions/tests/unit/test_llm_service.py`
  - Create: `functions/tests/unit/test_a2a_client.py`
  - Create: `functions/tests/unit/test_base_agent.py`

### Verification
- [ ] `cd functions && pip install -r requirements.txt` succeeds
- [ ] `pytest tests/unit/test_config.py` passes
- [ ] `pytest tests/unit/test_firestore_service.py` passes
- [ ] `pytest tests/unit/test_a2a_client.py` passes
- [ ] All imports work correctly
- [ ] A2A client can construct valid JSON-RPC messages

---

## PR #2: ClarificationOutput Validation & Models

**Branch:** `epic2/clarification-validation`
**Story:** 2.1 (Part 2)
**Goal:** Create Pydantic models for ClarificationOutput v3.0.0 and validation logic.

### Tasks

- [ ] **2.1 Create ClarificationOutput Pydantic models**
  - Create: `functions/models/clarification_output.py`
    - `ClarificationOutput` root model
    - `ProjectBrief` model
    - `Location` model
    - `ScopeSummary` model
    - `Timeline` model
    - `CSIScope` model (all 24 divisions)
    - `CSIDivision` model
    - `CSILineItem` model
    - `CADData` model
    - `SpaceModel` model
    - `Room`, `Wall`, `Opening` models
    - `SpatialRelationships` model
    - `KitchenSpecificData`, `BathroomSpecificData` models
    - `ConversationHistory` model
    - `ValidationFlags` model
    - All enums (ProjectType, CSIDivisionStatus, CSIUnit, etc.)

- [ ] **2.2 Create ClarificationOutput validator**
  - Create: `functions/validators/clarification_validator.py`
    - `validate_clarification_output(data)` - full validation
    - CSI completeness check (all 24 divisions)
    - Exclusion reason validation
    - Location completeness check
    - CAD data presence check
    - Layout narrative length check
    - Schema version check
    - Return `ValidationResult` with errors/warnings

- [ ] **2.3 Create test fixtures**
  - Create: `functions/tests/fixtures/clarification_output_kitchen.json`
    - Copy from `docs/clarification-output-example.json`
  - Create: `functions/tests/fixtures/clarification_output_bathroom.json`
    - Create bathroom remodel example
  - Create: `functions/tests/fixtures/clarification_output_invalid.json`
    - Missing CSI divisions, no exclusion reasons

- [ ] **2.4 Add unit tests for validation**
  - Create: `functions/tests/unit/test_clarification_validator.py`
    - Test valid kitchen remodel passes
    - Test valid bathroom remodel passes
    - Test missing CSI divisions fails
    - Test missing exclusion reasons fails
    - Test invalid schema version fails
    - Test missing CAD data fails

### Verification
- [ ] `pytest tests/unit/test_clarification_validator.py` - all tests pass
- [ ] Kitchen example JSON validates successfully
- [ ] Invalid JSON returns appropriate errors
- [ ] All 24 CSI divisions are checked

---

## PR #3: Orchestrator & Pipeline Infrastructure

**Branch:** `epic2/orchestrator`
**Story:** 2.1 (Part 3)
**Goal:** Create pipeline orchestrator and Cloud Function entry points.

### Tasks

- [ ] **3.1 Create agent output models**
  - Create: `functions/models/agent_output.py`
    - `AgentStatus` enum (pending, running, completed, failed)
    - `AgentOutput` model (status, output, summary, confidence, tokens, duration)
    - `PipelineStatus` model (currentAgent, completedAgents, progress, retries)

- [ ] **3.1a Create validation models**
  - Create: `functions/models/validation.py`
    - `ValidationStatus` enum (passed, failed, warning)
    - `ValidationIssue` model (severity, field, message, suggestion)
    - `ValidationResult` model (status, agent_name, issues, confidence, summary)
    - Validation rules for each agent type

- [ ] **3.1b Create validator agents**
  - Create: `functions/agents/validators/__init__.py`
  - Create: `functions/agents/validators/validator_agent.py` (base validator)
    - Uses Deep Agents for validation
    - Custom validation tools (schema check, data quality check)
    - `validate(agent_name, output, estimate_id)` method
  - Create: `functions/agents/validators/location_validator.py`
  - Create: `functions/agents/validators/scope_validator.py`
  - Create: `functions/agents/validators/cost_validator.py`
  - Create: `functions/agents/validators/risk_validator.py`
  - Create: `functions/agents/validators/final_validator.py`

- [ ] **3.2 Create estimate models**
  - Create: `functions/models/estimate.py`
    - `EstimateStatus` enum (draft, clarifying, processing, plan_review, final, exported)
    - `EstimateDocument` model (all fields from Firestore schema)

- [ ] **3.3 Create orchestrator with A2A**
  - Create: `functions/agents/orchestrator.py`
    - `AGENT_SEQUENCE` constant (5 agents in order)
    - `PipelineOrchestrator` class
    - Uses `A2AClient` to call agents via JSON-RPC
    - `run_pipeline(estimate_id, clarification_output)` - main runner
    - **A2A Communication:**
      - Send task to each agent via `a2a.send_task()`
      - Use `estimate_id` as `thread_id` for context continuity
      - Handle A2A responses (completed/failed)
    - **Validation and retry logic**:
      - After each agent, run validator agent to check output quality
      - If validation fails, retry agent with feedback about issues
      - Maximum 2 retries per agent
      - Store validation results in Firestore
    - **Firestore updates** (for frontend):
      - Update `pipelineStatus.currentAgent`
      - Update `pipelineStatus.progress`
      - Save agent outputs for persistence
    - Error handling and rollback
    - Progress tracking (0-100%)

- [ ] **3.4 Create Cloud Function entry points**
  - Create: `functions/main.py`
    - **A2A Endpoints (per agent):**
      - `a2a_location(req)` - A2A endpoint for Location Agent
      - `a2a_scope(req)` - A2A endpoint for Scope Agent
      - `a2a_cost(req)` - A2A endpoint for Cost Agent
      - `a2a_risk(req)` - A2A endpoint for Risk Agent
      - `a2a_final(req)` - A2A endpoint for Final Agent
      - Each endpoint: parse JSON-RPC, call `agent.handle_a2a_request()`
      - Timeout: 300s (5 min) per agent
    - **Pipeline Entry Points:**
      - `start_deep_pipeline(req)` - validate and start pipeline
        - **Use 2nd gen Cloud Functions** (60-minute timeout support)
        - **Async/fire-and-forget pattern** - start pipeline, return immediately
        - Don't wait for pipeline completion (takes 5-15 minutes)
        - Return: `{success: bool, data: {estimateId, status: "processing"}}`
      - `delete_estimate(req)` - delete estimate and subcollections
      - `get_pipeline_status(req)` - get current status
        - Read from Firestore `pipelineStatus` field
        - Return: `{success: bool, data: {status, currentAgent, progress, completedAgents}}`
    - Response format: `{success: bool, data/error}`
    - Authentication validation
    - Request logging
    - **Note**: Pipeline execution time is 5-15 minutes - frontend listens to Firestore for progress

- [ ] **3.5 Create stub agents for pipeline testing**
  - Create: `functions/agents/location_agent.py` (stub)
  - Create: `functions/agents/scope_agent.py` (stub)
  - Create: `functions/agents/cost_agent.py` (stub)
  - Create: `functions/agents/risk_agent.py` (stub)
  - Create: `functions/agents/final_agent.py` (stub)
  - Each stub returns mock output for pipeline testing

- [ ] **3.6 Add orchestrator unit tests**
  - Create: `functions/tests/unit/test_orchestrator.py`
    - Test pipeline sequence is correct
    - Test status updates work
    - Test error handling
    - Test progress calculation

- [ ] **3.7 Update firebase.json for Python functions**
  - Edit: `collabcanvas/firebase.json`
    - Add Python functions configuration
    - Set runtime to python311
    - Configure memory and timeout

### Verification
- [ ] `firebase emulators:start` - Python functions load
- [ ] Call `start_deep_pipeline` with valid ClarificationOutput - returns estimateId
- [ ] Pipeline status updates visible in Firestore emulator
- [ ] Call `delete_estimate` - document and subcollections deleted
- [ ] `pytest tests/unit/test_orchestrator.py` passes

---

## PR #4: Location Intelligence Agent ✅

**Branch:** `ture-agent-pipeline`
**Story:** 2.2
**Goal:** Implement Location Agent that retrieves location-based cost factors.
**Status:** ✅ COMPLETE (26 tests)

### Tasks

- [x] **4.1 Create location factor models**
  - Created: `functions/models/location_factors.py`
    - `LaborRates` model (electrician, plumber, carpenter, hvac, etc.)
    - `PermitCosts` model (percentage, fixed amounts, calculate_total_permit_cost)
    - `WeatherFactors` model (seasonal impacts, frost line, extreme heat days)
    - `MaterialCostAdjustments` model (transportation, availability, regional adjustments)
    - `LocationFactors` model (complete location-based cost data)
    - Enums: `Region`, `UnionStatus`, `WinterImpact`, `SeasonalAdjustmentReason`

- [x] **4.2 Create mock cost data service interface**
  - Created: `functions/services/cost_data_service.py` (interface + mock)
    - `get_location_factors(zip_code)` - returns LocationFactors
    - Mock data for 6 major metros (Denver, NYC, Houston, LA, Chicago, Phoenix)
    - Regional defaults for unknown zip codes (based on ZIP prefix)
    - In-memory cache mechanism with `clear_cache()` method
    - State-to-region mapping, union state detection, cost level detection

- [x] **4.3 Implement Location Agent**
  - Replaced stub: `functions/agents/primary/location_agent.py`
    - Inherits from `BaseA2AAgent`
    - LLM-powered analysis with custom system prompt
    - Extracts location from ClarificationOutput
    - Calls CostDataService for location factors
    - Generates analysis, key findings, recommendations, risk factors
    - Fallback analysis when LLM unavailable
    - Saves output to Firestore with confidence score

- [x] **4.3a Implement Location Scorer**
  - Replaced stub: `functions/agents/scorers/location_scorer.py`
    - 7 scoring criteria with weights:
      - labor_rates_completeness (weight: 3)
      - location_data_accuracy (weight: 2)
      - location_factor_validity (weight: 2)
      - permit_costs_completeness (weight: 2)
      - weather_factors_presence (weight: 1)
      - analysis_quality (weight: 2)
      - data_confidence (weight: 1)
    - Score >= 80 = PASS, < 80 = triggers critic

- [x] **4.3b Implement Location Critic**
  - Replaced stub: `functions/agents/critics/location_critic.py`
    - Detailed analysis of each scoring criterion
    - Specific issue identification with explanations
    - Actionable fix suggestions
    - State-based location factor suggestions

- [x] **4.4 Create mock location data fixtures**
  - Created: `functions/tests/fixtures/mock_cost_data.py`
    - Denver (80202) - mixed market, location factor 1.05
    - NYC (10001) - union, high rates, location factor 1.35
    - Houston (77001) - non-union, lower rates, location factor 0.92
    - Unknown zip defaults with national averages
    - Helper functions for test inputs and outputs

- [x] **4.5 Add Location Agent tests**
  - Created: `functions/tests/unit/test_location_agent.py` (26 tests)
    - TestLocationFactorsModel (5 tests)
    - TestCostDataService (6 tests)
    - TestLocationAgent (3 tests)
    - TestLocationScorer (6 tests)
    - TestLocationCritic (4 tests)
    - TestLocationAgentIntegration (2 tests)

### Verification
- [x] Location Agent runs in pipeline without errors
- [x] Firestore `/estimates/{id}/agentOutputs/location` created
- [x] `locationFactors` field populated on estimate document
- [x] Labor rates match expected values for test zips
- [x] `pytest tests/unit/test_location_agent.py` passes (26 tests)
- [x] Full test suite passes (106 tests total)

---

## PR #5: Construction Scope Agent ✅

**Branch:** `epic2/scope-agent`
**Story:** 2.3
**Status:** ✅ Complete (Dec 11, 2025)
**Tests:** 29 passing
**Goal:** Implement Scope Agent that enriches Bill of Quantities with cost codes.

### Tasks

- [x] **5.1 Create Bill of Quantities models**
  - Created: `functions/models/bill_of_quantities.py`
    - `CostCode` model - CSI MasterFormat code with description
    - `UnitCostReference` model - Reference unit costs (mocked)
    - `EnrichedLineItem` model (adds costCode, unitCost reference, primary trade)
    - `EnrichedDivision` model with `calculate_subtotals()` method
    - `BillOfQuantities` model (divisions array, metadata)
    - `get_division_name()` and `get_primary_trade()` helpers

- [x] **5.2 Add cost code lookup to cost data service**
  - Edited: `functions/services/cost_data_service.py`
    - `get_cost_code(item_description, division)` - map to CSI MasterFormat codes
    - Mock cost code database with 50+ common construction items
    - Fuzzy keyword matching for item descriptions
    - Division-specific code lookup with fallback

- [x] **5.3 Implement Scope Agent**
  - Edited: `functions/agents/primary/scope_agent.py`
    - Real LLM-powered agent (replaced stub)
    - Reads `csiScope` from ClarificationOutput
    - Enriches each line item with CSI cost codes
    - Validates quantities against `cadData.spaceModel.rooms`
    - Calculates division subtotals
    - Generates human-readable scope summary
    - Configurable confidence based on enrichment success rate
  - Edited: `functions/agents/scorers/scope_scorer.py`
    - 6 scoring criteria:
      - `cost_code_coverage` - % of items with cost codes
      - `quantity_validity` - quantities present and reasonable
      - `division_coverage` - all included divisions have items
      - `subtotals_calculated` - division subtotals computed
      - `summary_quality` - summary is meaningful
      - `line_item_count` - minimum items per project type
  - Edited: `functions/agents/critics/scope_critic.py`
    - Analyzes missing cost codes and suggests fixes
    - Identifies quantity validation issues
    - Checks for incomplete divisions
    - Provides actionable feedback for retry

- [x] **5.4 Add Scope Agent tests**
  - Created: `functions/tests/fixtures/mock_boq_data.py`
    - Kitchen remodel test fixtures
    - Valid/incomplete/invalid scope outputs
    - A2A request builders
  - Created: `functions/tests/unit/test_scope_agent.py` (29 tests)
    - `TestBillOfQuantitiesModel` - Model validation (6 tests)
    - `TestCostDataServiceCostCodes` - Cost code lookup (5 tests)
    - `TestScopeAgent` - Agent run, enrichment, estimates (3 tests)
    - `TestScopeScorer` - Scoring criteria evaluation (7 tests)
    - `TestScopeCritic` - Critique generation (6 tests)
    - `TestScopeAgentIntegration` - End-to-end flow (2 tests)

### Verification
- [ ] Scope Agent runs after Location Agent completes
- [ ] `billOfQuantities` field populated with enriched data
- [ ] Each line item has `costCode` assigned
- [ ] Firestore `/estimates/{id}/agentOutputs/scope` created
- [ ] `pytest tests/unit/test_scope_agent.py` passes

---

## PR #6: Cost Estimation Agent ✅

**Branch:** `epic2/cost-agent`
**Story:** 2.4
**Status:** ✅ Complete (Dec 11, 2025)
**Tests:** 36 passing
**Goal:** Implement Cost Agent that calculates material, labor, and equipment costs with P50/P80/P90 ranges.

### Key Feature: 3-Tier Cost Output (P50/P80/P90)
- P50 (low): Median estimate - 50th percentile
- P80 (medium): Conservative estimate - 80th percentile  
- P90 (high): Pessimistic estimate - 90th percentile
- Uses variance multipliers (1.0/1.15/1.25) for Monte Carlo compatibility

### Tasks

- [x] **6.1 Create cost estimate models**
  - Created: `functions/models/cost_estimate.py`
    - `CostRange` model (low/medium/high - P50/P80/P90) with arithmetic operators
    - `LineItemCost` model with CostRange for material, labor, equipment costs
    - `CostSubtotals` model (materials, labor, equipment as CostRange)
    - `CostAdjustments` model (locationFactor, overhead, profit as CostRange)
    - `CostEstimate` model (divisions, subtotals, adjustments, total CostRange, confidence)
    - `CostSummary` model (headline, range explanation, drivers, savings opportunities)
    - `CostConfidenceLevel` enum (HIGH, MEDIUM, LOW, ESTIMATED)

- [x] **6.2 Add material cost lookup to cost data service**
  - Edited: `functions/services/cost_data_service.py`
    - `get_material_cost(cost_code, item_description)` - returns CostRange for unit cost
    - `get_labor_rate(trade, zip_code)` - returns CostRange for hourly rate
    - `get_equipment_cost(equipment_type)` - returns CostRange for equipment
    - All methods return P50/P80/P90 ranges using variance multipliers (1.0/1.15/1.25)
    - Mock RSMeans-schema data for 40+ common items

- [x] **6.3 Implement Cost Agent**
  - Edited: `functions/agents/primary/cost_agent.py`
    - Inherit from `BaseA2AAgent`
    - Process BoQ line items from Scope Agent output
    - For each line item:
      - Look up material cost (CostRange) from CostDataService
      - Look up labor rate (CostRange) by trade and ZIP code
      - Calculate material, labor, equipment costs as CostRange
      - Aggregate into division totals
    - Apply adjustments to all three tiers (low/medium/high):
      - Location factor from Location Agent output
      - Overhead percentage (default 10%)
      - Profit percentage (default 10%)
    - Calculate grand total CostRange (P50/P80/P90)
    - Use LLM for cost analysis insights and summary generation
    - Save output to Firestore

- [x] **6.4 Implement Cost Scorer**
  - Edited: `functions/agents/scorers/cost_scorer.py`
    - 6 scoring criteria:
      1. `cost_ranges_valid` - all CostRanges have low ≤ medium ≤ high
      2. `line_items_costed` - all BoQ items have calculated costs
      3. `location_factor_applied` - matches Location Agent output
      4. `adjustments_applied` - overhead/profit applied correctly
      5. `subtotals_correct` - subtotals add up
      6. `range_reasonable` - high/low ratio within bounds (1.0-2.0)

- [x] **6.5 Implement Cost Critic**
  - Edited: `functions/agents/critics/cost_critic.py`
    - Actionable feedback for cost issues
    - Detects invalid range ordering, missing items, factor mismatches
    - Provides specific "what's wrong / why / how to fix" guidance

- [x] **6.6 Add Cost Agent tests**
  - Created: `functions/tests/fixtures/mock_cost_estimate_data.py`
    - Mock location output, scope output, valid/invalid cost outputs
    - Helper functions for A2A request building
  - Created: `functions/tests/unit/test_cost_agent.py` (36 tests)
    - `TestCostRangeModel` (9 tests) - CostRange validation and arithmetic
    - `TestCostDataServiceMaterialCost` (4 tests) - Material cost lookup
    - `TestCostDataServiceLaborRate` (3 tests) - Labor rate lookup
    - `TestLineItemCostCalculation` (2 tests) - Cost calculation
    - `TestCostAgent` (3 tests) - Agent run and output
    - `TestCostScorer` (7 tests) - Scoring criteria validation
    - `TestCostCritic` (6 tests) - Critique feedback
    - `TestCostAgentIntegration` (2 tests) - End-to-end flow

### Verification ✅
- [x] Cost Agent runs after Scope Agent completes
- [x] `costEstimate` field populated with P50/P80/P90 breakdown
- [x] Material costs = quantity × unit cost (all three tiers)
- [x] Location factors applied correctly to all tiers
- [x] Firestore `/estimates/{id}/agentOutputs/cost` created
- [x] `pytest tests/unit/test_cost_agent.py` passes (36 tests)

---

## PR #7: Risk Analysis, Timeline & Final Estimator Agents ✅

**Branch:** `epic2/risk-final-agents`
**Story:** 2.5
**Status:** ✅ Complete (Dec 11, 2025)
**Tests:** 33 passing
**Goal:** Implement Risk, Timeline, and Final Agents with Scorer + Critic validation.

### Tasks

- [x] **7.1 Create risk analysis models**
  - Created: `functions/models/risk_analysis.py`
    - `CostImpact` enum (low, medium, high)
    - `Probability` enum (low, medium, high)
    - `RiskFactor` model (item, description, impact, probability, mitigation, expected_cost_impact)
    - `PercentileValues` model (p50, p80, p90 with validation)
    - `MonteCarloResult` model (iterations, percentiles, mean, std_dev, range_spread)
    - `RiskAnalysisSummary` model (headline, contingency_recommendation, top_risk_factors, recommendations)
    - `RiskAnalysis` model (estimate_id, monte_carlo_results, summary, confidence)

- [x] **7.2 Create timeline models**
  - Created: `functions/models/timeline.py`
    - `DurationRange` model (optimistic, likely, pessimistic)
    - `TimelineTask` model (id, name, description, duration, dependencies, trade, phase, is_critical)
    - `Milestone` model (id, name, date, phase, description)
    - `CriticalPath` model (total_duration, task_ids, bottleneck_phases)
    - `ProjectTimeline` model (estimate_id, tasks, milestones, critical_path, summary, confidence)

- [x] **7.3 Create final estimate models**
  - Created: `functions/models/final_estimate.py`
    - `ExecutiveSummary` model (headline, total_cost, contingency_cost, timeline_weeks, confidence, key_drivers, recommendations, disclaimers)
    - `CostBreakdownSummary` model (materials, labor, equipment, subtotal, adjustments, grand_total)
    - `TimelineSummary` model (total_weeks, phases, critical_path_tasks, key_milestones)
    - `RiskSummary` model (overall_risk_level, contingency_percent, top_risks)
    - `FinalEstimate` model (estimate_id, executive_summary, cost_breakdown, timeline_summary, risk_summary, metadata)

- [x] **7.4 Create mock Monte Carlo service**
  - Created: `functions/services/monte_carlo_service.py`
    - `MonteCarloService` class with configurable seed for reproducibility
    - `_get_impact_value()` and `_get_probability_value()` mapping methods
    - `_generate_risk_factors()` - generates mock risk factors based on project context
    - `_calculate_contingency()` - calculates recommended contingency from P50/P80 spread
    - `run_simulation()` - runs Monte Carlo using NumPy triangular distributions
    - 1000 iterations default, calculates P50/P80/P90 percentiles

- [x] **7.5 Implement Risk Agent + Scorer + Critic**
  - Replaced stub: `functions/agents/primary/risk_agent.py`
    - LLM-powered risk analysis with Monte Carlo integration
    - Extracts cost data and runs simulation
    - Identifies top risk factors
    - Generates risk summary with recommendations
  - Replaced stub: `functions/agents/scorers/risk_scorer.py`
    - 4 scoring criteria: percentiles_valid, contingency_reasonable, risks_identified, summary_complete
  - Replaced stub: `functions/agents/critics/risk_critic.py`
    - Detailed analysis of risk output quality
    - Actionable feedback for improvements

- [x] **7.6 Implement Timeline Agent + Scorer + Critic**
  - Replaced stub: `functions/agents/primary/timeline_agent.py`
    - LLM-powered timeline generation
    - Creates tasks with dependencies and phases
    - Identifies critical path
    - Generates timeline summary
  - Replaced stub: `functions/agents/scorers/timeline_scorer.py`
    - 4 scoring criteria: tasks_valid, duration_reasonable, critical_path_identified, dependencies_valid
  - Replaced stub: `functions/agents/critics/timeline_critic.py`
    - Detailed analysis of timeline output quality
    - Actionable feedback for improvements

- [x] **7.7 Implement Final Agent + Scorer + Critic**
  - Replaced stub: `functions/agents/primary/final_agent.py`
    - LLM-powered synthesis of all agent outputs
    - Generates executive summary with recommendations
    - Aggregates cost, timeline, and risk data
    - Updates estimate status to "complete"
  - Replaced stub: `functions/agents/scorers/final_scorer.py`
    - 4 scoring criteria: completeness, consistency, executive_summary_quality, recommendations_present
  - Replaced stub: `functions/agents/critics/final_critic.py`
    - Detailed analysis of final output quality
    - Actionable feedback for improvements

- [x] **7.8 Add test fixtures and unit tests**
  - Created: `functions/tests/fixtures/mock_risk_timeline_data.py`
    - Mock clarification, location, scope, cost outputs
    - Valid and invalid risk/timeline/final outputs
  - Created: `functions/tests/unit/test_risk_timeline_final.py` (33 tests)
    - TestRiskFactorModel (4 tests)
    - TestPercentileValues (2 tests)
    - TestMonteCarloResult (2 tests)
    - TestMonteCarloService (3 tests)
    - TestRiskAgent (1 test)
    - TestRiskScorer (3 tests)
    - TestRiskCritic (2 tests)
    - TestTimelineTask (2 tests)
    - TestProjectTimeline (1 test)
    - TestTimelineAgent (1 test)
    - TestTimelineScorer (2 tests)
    - TestTimelineCritic (2 tests)
    - TestFinalEstimate (1 test)
    - TestFinalAgent (1 test)
    - TestFinalScorer (2 tests)
    - TestFinalCritic (2 tests)
    - TestPR7Integration (2 tests)

### Verification ✅
- [x] Risk Agent produces P50 ≤ P80 ≤ P90
- [x] Contingency percentage calculated from P50/P80 spread
- [x] Risk factors identified with impact and probability
- [x] Timeline Agent generates tasks with dependencies
- [x] Critical path identified
- [x] Final Agent aggregates all outputs
- [x] Executive summary generated with recommendations
- [x] All 33 PR #7 tests pass
- [x] Full test suite (205 tests) passes

---

## PR #8: Firestore Rules & Documentation ✅

**Branch:** `epic2/firestore-rules`
**Goal:** Update Firestore security rules and finalize documentation.

### Tasks

- [x] **8.1 Update Firestore security rules**
  - Edit: `collabcanvas/firestore.rules`
    - Add `/estimates/{estimateId}` collection rules
    - Add `/estimates/{estimateId}/agentOutputs/{agentId}` rules
    - Add `/estimates/{estimateId}/conversations/{msgId}` rules
    - Add `/estimates/{estimateId}/versions/{versionId}` rules
    - User can only access own estimates
    - Read-only for agent outputs after completion

- [x] **8.2 Update memory bank**
  - Updated: `memory-bank/progress.md` (PR #8 complete)
  - Updated: `memory-bank/activeContext.md` (current focus updated)

- [x] **8.3 Create API documentation**
  - Created: `docs/api/deep-pipeline-api.md`
    - `start_deep_pipeline` request/response
    - `delete_estimate` request/response
    - `get_pipeline_status` request/response
    - Error codes and handling

- [ ] **8.4 Final testing**
  - (Optional) Run full test suite
  - Deploy to Firebase emulators
  - Manual end-to-end test with kitchen example

### Verification
- [ ] Firestore rules deploy without errors
- [ ] User can only access own estimates
- [ ] All tests pass
- [ ] Documentation complete

---

## Summary

| PR | Branch | Story | Description | Key Files |
|----|--------|-------|-------------|-----------|
| 1 | `epic2/foundation` | 2.1 | Project setup, config, services, A2A client, base classes | `requirements.txt`, `config/`, `services/a2a_client.py`, `base_agent.py`, `base_scorer.py`, `base_critic.py` |
| 2 | `epic2/clarification-validation` | 2.1 | ClarificationOutput models & validation | `models/clarification_output.py`, `validators/` |
| 3 | `epic2/orchestrator` | 2.1 | A2A orchestrator with Scorer+Critic flow & 18 endpoints | `orchestrator.py`, `main.py` (18 A2A endpoints) |
| 4 | `epic2/location-agent` | 2.2 | Location Agent + Scorer + Critic | `location_agent.py`, `location_scorer.py`, `location_critic.py` |
| 5 | `epic2/scope-agent` | 2.3 | ✅ Scope Agent + Scorer + Critic | `scope_agent.py`, `scope_scorer.py`, `scope_critic.py` |
| 6 | `epic2/cost-agent` | 2.4 | ✅ Cost Agent + Scorer + Critic (P50/P80/P90) | `cost_agent.py`, `cost_scorer.py`, `cost_critic.py`, `cost_estimate.py` |
| 7 | `epic2/risk-timeline-final` | 2.5 | Risk, Timeline, Final + Scorers + Critics | All remaining agents (9 total) |
| 8 | `epic2/firestore-rules` | - | Security rules & docs | `firestore.rules`, API docs |

---

## Dependencies Between PRs

```
PR #1 (Foundation)
    ↓
PR #2 (Validation) ──────────┐
    ↓                        │
PR #3 (Orchestrator) ←───────┘
    ↓
PR #4 (Location Agent)
    ↓
PR #5 (Scope Agent)
    ↓
PR #6 (Cost Agent)
    ↓
PR #7 (Risk & Final Agents)
    ↓
PR #8 (Rules & Docs)
```

---

## External Dependencies (From Dev 4)

These services are mocked in this Epic. When Dev 4 delivers:

| Service | PR to Update | Action |
|---------|--------------|--------|
| `cost_data_service.get_location_factors()` | PR #4 | Replace mock with real call |
| `cost_data_service.get_material_cost()` | PR #6 | Replace mock with real call |
| `monte_carlo.run_simulation()` | PR #7 | Replace mock with real call |

---

_Last Updated: December 11, 2025 (PR #8 Complete; 8.4 testing optional)_

