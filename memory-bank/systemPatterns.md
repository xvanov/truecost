# TrueCost - System Patterns

## Architecture Decisions

### ADR-001: LangChain Deep Agents for Agent Orchestration

**Decision**: Use LangChain Deep Agents (`deepagents` library) for agent orchestration

**Rationale**:
- Built-in planning tool (`write_todos`) for task decomposition
- Native subagent spawning via `task` tool
- File system tools (`ls`, `read_file`, `write_file`, `edit_file`) for context management
- Built on LangGraph with LangChain integration
- Perfect for complex multi-step tasks like cost estimation
- Context management for large CAD data through file system tools

**Implementation**:
- Install: `pip install deepagents>=0.2.0`
- Import: `from deepagents import create_deep_agent`
- Each agent (Location, Scope, Cost, Risk, Final) uses Deep Agents pattern
- See `docs/setup/deep-agents-integration.md` for details

**Consequence**: Mixed language codebase (TypeScript frontend, Python backend)

### ADR-002: GPT-4.1 with Env Var Configuration

**Decision**: Default to GPT-4.1, configurable via `LLM_MODEL`

**Rationale**:
- Strong instruction following
- 1M token context
- Easily swappable for testing/cost optimization

### ADR-003: A2A Protocol for Agent Communication

**Decision**: Use A2A (Agent2Agent) Protocol for inter-agent communication

**Rationale**:
- Industry standard (Google-backed)
- JSON-RPC 2.0 message format
- Agent Cards for capability discovery
- Task state tracking (Submitted → Working → Completed/Failed)
- LangChain/LangSmith integration
- Future-proof for external agent integrations

**Implementation**:
- Each agent exposes A2A endpoint (`a2a_{agent_name}`)
- Orchestrator uses A2A client to call agents
- Firestore for persistence + frontend updates (hybrid)

### ADR-004: Firestore for Agent State

**Decision**: Store agent state in Firestore with real-time listeners

**Rationale**:
- Firebase-native
- Real-time updates to frontend
- Built-in persistence
- Works alongside A2A for state backup

## Deep Agent Pipeline Architecture

### Agent Sequence

```python
DEEP_AGENT_SEQUENCE = [
    ("location", LocationAgent),      # Zip-code based data
    ("scope", ScopeAgent),            # BoQ in CSI MasterFormat
    ("cost", CostAgent),              # Material/labor/equipment costs
    ("risk", RiskAgent),              # Monte Carlo simulation
    ("final", FinalAgent),            # Synthesis + report
]
```

**Note**: Clarification + CAD Analysis are handled by Dev 3 before handoff.

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Dev 3 Produces                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ CAD Upload  │  │   Voice/    │  │    Clarification        │ │
│  │  & Parse    │→ │   Text      │→ │       Agent             │ │
│  └─────────────┘  └─────────────┘  └───────────┬─────────────┘ │
└────────────────────────────────────────────────┼───────────────┘
                                                 │
                                                 ▼
                                    ┌────────────────────────┐
                                    │  ClarificationOutput   │
                                    │    (Schema v3.0.0)     │
                                    └────────────┬───────────┘
                                                 │
┌────────────────────────────────────────────────┼───────────────┐
│                        Dev 2 Consumes                          │
│                                                ▼               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │  Location   │→ │   Scope     │→ │  Cost → Risk → Final    ││
│  │   Agent     │  │   Agent     │  │       Agents            ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

## Firestore Data Architecture

### Collections

```
firestore/
├── users/{userId}
│   └── profile, settings

├── projects/{projectId}                # UI-first workflow (CollabCanvas)
│   ├── ownerId, name, description, status, createdAt, updatedAt, ...
│   ├── /board/{state}                  # background image / board state
│   ├── /shapes/{shapeId}               # plan annotations
│   ├── /scope/{scopeId}                # scope definition items
│   ├── /bom/{bomId}                    # bill of materials (Epic 4/1)
│   ├── /cpm/{cpmId}                    # schedule tasks (Epic 1/4)
│   ├── /priceComparison/{comparisonId} # Epic 5 results
│   └── /pipeline/
│       ├── status                      # real-time pipeline progress (Epic 6)
│       └── context                     # snapshot of project context sent to pipeline
│
├── estimates/{estimateId}
│   ├── userId, projectName, status, createdAt, updatedAt
│   ├── cadFileRef: "gs://bucket/cad/{estimateId}/file.pdf"
│   ├── clarificationOutput: { ... }     # From Dev 3
│   ├── locationFactors: { ... }         # From Location Agent
│   ├── billOfQuantities: { ... }        # From Scope Agent
│   ├── costEstimate: { ... }            # From Cost Agent
│   ├── riskAnalysis: { ... }            # From Risk Agent
│   ├── finalEstimate: { ... }           # From Final Agent
│   ├── pipelineStatus: { currentAgent, completedAgents[], progress }
│   │
│   ├── /agentOutputs/{agentName}
│   │   └── { status, output, summary, confidence, tokensUsed, duration }
│   │
│   ├── /costItems/{costItemId}
│   │   └── { estimateId, agentName, divisionCode, lineItemId, lineItemDescription, componentType, quantity, unit, unitCost, totalCost, metadata, createdAt }
│   │
│   ├── /conversations/{messageId}
│   │   └── { role, content, timestamp }
│   │
│   └── /versions/{versionId}
│       └── { snapshot, createdAt, reason }
│
├── feedback/{feedbackId}
│   └── { estimateId, userId, actualCosts, variance }
│
└── costData/                     # RSMeans-schema mock (Dev 4)
    ├── materials/{materialId}
    ├── laborRates/{rateId}
    └── locationFactors/{zipCode}
```

### Pattern: Large/Granular Outputs Use Subcollections

Firestore documents have practical size limits; for high-granularity “ledger-like” data, store each record as a document in a subcollection and reference it from the root estimate document:
- Root estimate holds summary + discoverability metadata (e.g., `costItemsCount`, `costItemsCollectionPath`)
- UI/API fetches subcollection items when needed (dashboard renders “Cost Ledger”)

### Pattern: UI “Projects” Track Pipeline via `/projects/{projectId}/pipeline/status`

Post-merge integration introduces a UI-facing pipeline status document:

- Created/initialized by TS callable: `collabcanvas/functions/src/estimatePipelineOrchestrator.ts`
- Updated by Python pipeline via `functions/services/firestore_service.py::sync_to_project_pipeline()`
- Read by frontend via `collabcanvas/src/services/pipelineService.ts` (Firestore `onSnapshot`)

This allows the UI to show progress without polling `get_pipeline_status`.

### Pattern: User-Selected Cost Defaults Live in `ClarificationOutput.projectBrief.costPreferences`

Certain cost defaults are selected by the user in the UI (scope definition) and passed through the pipeline
as part of the ClarificationOutput input. These values override agent-side hardcoded defaults.

- `overheadPct` (decimal; e.g. 0.10 == 10%)
- `profitPct` (decimal; e.g. 0.10 == 10%)
- `contingencyPct` (decimal; e.g. 0.05 == 5%)
- `wasteFactor` (multiplier; e.g. 1.10 == +10% waste)

Implementation notes:
- `CostAgent` consumes these values to compute `adjustments.overheadPercentage`, `adjustments.profitPercentage`,
  `adjustments.contingencyPercentage`, and to feed waste into heuristic takeoff conversions (e.g., SF → plank count).
- `FinalAgent` prefers the user-supplied `contingencyPct` over the RiskAgent recommendation when computing final totals.

### Pattern: Monte Carlo Iterations Are Configurable (Default 10,000)

Monte Carlo simulation iterations are configured via environment variable:

- `MONTE_CARLO_ITERATIONS` (default: 10000)

Implementation:
- `RiskAgent` uses `settings.monte_carlo_iterations` when calling `MonteCarloService.run_simulation(...)`.
- Unit tests monkeypatch `settings.monte_carlo_iterations = 1000` to keep tests fast.

### Pattern: Never Invent Numbers (Use Explicit N/A When Inputs Missing)

Policy: if the pipeline lacks required inputs for a computation, it must **not fabricate numeric values**.
Instead it should emit explicit “N/A”/`None` fields (and/or an error object) so the UI can display
missing data clearly.

Current implementation:
- `RiskAgent` does **not** default `base_cost` to an arbitrary number if totals/subtotals are missing.
  It returns an output with:
  - `monteCarlo: null`
  - `contingency: null`
  - `riskLevel: "n/a"`
  - `error.code: "INSUFFICIENT_DATA"`

### Pattern: No Hardcoded Timeline Task Templates (LLM Generates Tasks)

Policy: The schedule must be generated from the **user-defined scope** and the **pipeline input JSON**.
We do **not** maintain static “kitchen/bathroom/default remodel” task templates.

Implementation:
- `TimelineAgent` uses the LLM to generate task specs (names, phases, durations, trades, dependencies).
- If the LLM cannot generate a schedule (or durations are missing), the agent returns **N/A** rather than
  falling back to a canned task list.

### Pattern: Start Date Must Come From Clarification JSON (No Default Offset)

Policy: Do **not** assume “2 weeks from now” (or any other default) for schedule start date.

Implementation:
- `TimelineAgent` requires `clarification_output.projectBrief.timeline.desiredStart` (ISO date/datetime).
- If missing: return **N/A** with `error.code = "INSUFFICIENT_DATA"`.
- If invalid format: return **N/A** with `error.code = "INVALID_INPUT"`.

### Pattern: Critic Feedback Is Structural + Context-Driven (No Fixed Duration Ranges)

Policy: Critics must not enforce arbitrary “small remodel 20–30 days / large 60–90 days” heuristics.
Project schedules vary based on scope, sequencing, lead times, trade availability, inspections, and user constraints.

Implementation:
- `TimelineCritic` validates **structural completeness and internal consistency** (durations present, ranges bracket totalDuration, dependency sequencing),
  but does not assert a specific total duration based solely on sqft.

### Pattern: Code Compliance Warnings Are Informational (ICC, AHJ Applies)

Policy: Provide **warnings/considerations** based on ICC code families (IBC/IRC/IECC) without claiming legal determinations.

Implementation:
- `CodeComplianceAgent` emits structured warnings (severity/title/details/whatToCheckNext).
- `FinalAgent` surfaces these warnings under `codeCompliance` in the final report output.
- Always include an AHJ/local-amendments disclaimer.

### Status Flows

**Estimate Status**:
```
"draft" → "clarifying" → "processing" → "plan_review" → "final" → "exported"
```

**Agent Status**:
```
"pending" → "running" → "completed"
               ↓
           "failed" → "retrying" → "completed" | "failed"
```

## API Patterns

### Response Format

```python
# Success
{"success": True, "data": {...}}

# Error
{"success": False, "error": {"code": "ERROR_CODE", "message": "...", "details": {}}}
```

### Error Handling

```python
class TrueCostError(Exception):
    def __init__(self, code: str, message: str, details: dict = None):
        self.code = code
        self.message = message
        self.details = details or {}

# Error codes
CAD_PARSE_FAILED = "CAD_PARSE_FAILED"
AGENT_TIMEOUT = "AGENT_TIMEOUT"
VALIDATION_ERROR = "VALIDATION_ERROR"
```

### Logging

```python
import structlog
logger = structlog.get_logger()

logger.info("agent_started", estimate_id=id, agent="location")
logger.info("agent_completed", estimate_id=id, agent="location", duration_ms=1234)
logger.error("agent_failed", estimate_id=id, agent="location", error=str(e))
```

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Python functions | snake_case | `start_estimate`, `run_pipeline` |
| Python classes | PascalCase | `LocationAgent`, `TrueCostError` |
| Python files | snake_case | `location_agent.py`, `monte_carlo.py` |
| Firestore collections | camelCase | `estimates`, `agentOutputs` |
| Firestore fields | camelCase | `estimateId`, `createdAt` |
| Environment variables | SCREAMING_SNAKE | `LLM_MODEL`, `OPENAI_API_KEY` |

## Service Interfaces (Dependencies from Dev 4)

```python
# Location Service (Dev 4 implements, Dev 2 consumes)
def get_location_factors(zip_code: str) -> LocationFactors:
    """Returns {laborRates: {}, isUnion: bool, permitCosts: {}, weatherFactors: {}}"""

# Cost Data (Dev 4 implements, Dev 2 consumes)
def get_material_cost(item_code: str) -> MaterialCost:
    """Returns {unitCost: float, laborHours: float, crew: str, productivity: float}"""

# Monte Carlo (Dev 4 implements, Dev 2 consumes)
def run_simulation(line_items: list, iterations: int = 1000) -> MonteCarloResult:
    """Returns {p50: float, p80: float, p90: float, contingency: float, topRisks: []}"""
```

## Handoff Contract: Dev 3 → Dev 2

**Input**: `ClarificationOutput` v3.0.0

Key fields consumed by Deep Pipeline:
- `projectBrief.location.zipCode` - For Location Agent
- `csiScope` - All 24 CSI divisions with status
- `cadData.spaceModel` - Measurements for quantity validation
- `cadData.spatialRelationships` - Layout understanding
- `projectBrief.scopeSummary.finishLevel` - Material selection

