# TrueCost - Active Context

## Current Focus: Post-Merge Integration (Epic 6) + Pipeline ↔ UI Wiring

**Role**: Dev 2 (Deep Agent Pipeline owner)  
**Current Branch**: `bugfix/post-merge-integration`  
**Goal**: Ensure the **end-to-end user flow** works after merging Epics 1 (UI), 2 (Deep Pipeline), 4 (PDF/Data), and 5 (Price Comparison).

### What’s Different Now (Post-Merge)

The system now has **two coordinated tracks**:

1. **User-facing “Projects” workflow** (CollabCanvas app)
   - Collection: `/projects/{projectId}/...`
   - UI watches pipeline progress at: `/projects/{projectId}/pipeline/status`

2. **Deep Agent Pipeline “Estimates” workflow** (Python functions)
   - Collection: `/estimates/{estimateId}/...`
   - Granular cost ledger: `/estimates/{estimateId}/costItems`

### Key Integration Bridge (TS → Python)

- **TS callable orchestrator** (`collabcanvas/functions/src/estimatePipelineOrchestrator.ts`)
  - Gathers project context (scope + board background + shapes)
  - Writes:
    - `/projects/{projectId}/pipeline/status`
    - `/projects/{projectId}/pipeline/context`
  - Calls Python `start_deep_pipeline` and passes `projectId` for UI sync

- **Python pipeline** (`functions/main.py`, `functions/agents/orchestrator.py`, `functions/services/firestore_service.py`)
  - Accepts `projectId` and periodically syncs progress back to
    `/projects/{projectId}/pipeline/status` via `FirestoreService.sync_to_project_pipeline()`

### Current Docs of Record

- `docs/sprint-artifacts/tech-spec-post-merge-integration.md` (Epic 6)
- `docs/sprint-artifacts/sprint-status.yaml` (story status)
- `docs/sprint-artifacts/sprint-1-completion-report.md` (overall merged epics summary)

### Immediate Next Steps (High Signal)

1. Verify the **Projects pipeline progress** is consistent:
   - TS “status” document shape vs Python `sync_to_project_pipeline()` shape
2. Verify ClarificationOutput bridging contract is compatible:
   - TS `buildClarificationOutput()` output vs Python `validate_clarification_output()`
3. Confirm UI can render:
   - Progress stages (`cad_analysis`, `location`, `scope`, `cost`, `risk`, `final`)
   - PDF generation via `collabcanvas/src/services/pdfService.ts`

### New: CostAgent Uses Live Retail Material Pricing (Epic 5 `comparePrices`)

We now have **live material pricing** available via the existing TS callable:

- **TS Cloud Function**: `collabcanvas/functions/src/priceComparison.ts` (`comparePrices`)
  - Scrapes retailer pricing via **SerpApi Google Shopping** + optional LLM matching
  - Writes progress/results to: `/projects/{projectId}/priceComparison/latest`

Integration into the Python pipeline:
- **Python wrapper service**: `functions/services/price_comparison_service.py`
  - Triggers `comparePrices` via HTTP
  - Polls Firestore until `status == "complete"`
  - Extracts best price per product name
- **Cost data integration**: `functions/services/cost_data_service.py`
  - `CostDataService.get_material_cost(..., project_id, zip_code)` attempts live price first
  - Falls back to existing mock unit costs if price comparison fails/no match
  - Uses `batch_prefetch_prices()` to request all line-item descriptions in one call per run
- **CostAgent wiring**: `functions/agents/primary/cost_agent.py`
  - Extracts `project_id` (from `clarification_output` or falls back to `estimate_id`)
  - Passes `project_id` and `zip_code` through to cost lookups

### New: Agent Tool for Material Prices

- Added LangChain tool: `functions/tools/price_tools.py` (`get_material_prices_tool`)
- Exported via: `functions/tools/__init__.py` (`DATA_TOOLS`)

### Test + Reliability Updates

- Added unit tests: `functions/tests/unit/test_price_comparison_integration.py`
- Fixed `tools/data_tools.py` missing typing imports (`Dict`, `Any`) that caused pytest collection failures
- Removed SciPy dependency from `functions/services/monte_carlo.py` (uses `numpy.linalg` + an `erf`-based normal CDF)
- Fixed flaky schedule Monte Carlo test by allowing ties: `p50_days <= p80_days <= p90_days` (integer day percentiles can tie)

### New: Primary Agents Now Use LangChain Deep Agents (Hybrid Migration)

We have converted **primary agents** to run their LLM reasoning through **LangChain Deep Agents** (`deepagents`) while keeping the existing **A2A + Orchestrator + Scorer/Critic** framework intact.

- **Deep Agents dependency**: added `deepagents>=0.2.0` to `functions/requirements.txt`
- **Deep Agents helper**: `functions/services/deep_agent_factory.py`
  - `deep_agent_generate_json(...)` is the drop-in replacement for `LLMService.generate_json(...)`
  - Handles strict JSON parsing and token counting (best effort)
- **Firestore-backed Deep Agents filesystem**: `functions/services/deep_agents_backend.py`
  - Persists agent “files” per `(estimateId, agentName)` so retries/debug can reuse artifacts
  - Stored under: `/estimates/{estimateId}/agentFs/{agentName}/files/{sha1(path)}`

Converted to Deep Agents (LLM step only):
- `functions/agents/primary/location_agent.py`
- `functions/agents/primary/scope_agent.py`
- `functions/agents/primary/cost_agent.py`
- `functions/agents/primary/risk_agent.py`
- `functions/agents/primary/timeline_agent.py`
- `functions/agents/primary/final_agent.py`
- `functions/agents/primary/code_compliance_agent.py`

Note: scorers/critics are intentionally unchanged (still use the existing LangChain wrapper patterns).

### Windows Test Reliability: WeasyPrint Native Dependencies

On Windows, `weasyprint` can be installed but fail to import due to missing GTK/Pango native libs (`gobject-2.0-0`).
We updated `functions/tests/unit/test_pdf_generator.py` to **skip cleanly** if WeasyPrint (or its native deps) cannot be imported.

### New: User-Selected Cost Defaults (Input JSON)

The pipeline now supports user-selected costing defaults supplied in the incoming JSON:

- `projectBrief.costPreferences.overheadPct` (decimal; 0.10 == 10%)
- `projectBrief.costPreferences.profitPct` (decimal; 0.10 == 10%)
- `projectBrief.costPreferences.contingencyPct` (decimal; 0.05 == 5%)
- `projectBrief.costPreferences.wasteFactor` (multiplier; 1.10 == +10% waste)

Consumption:
- `CostAgent` uses these values for overhead/profit/contingency adjustments and for waste-based takeoff heuristics.
- `FinalAgent` prefers user `contingencyPct` (if present) over the RiskAgent recommendation when computing final totals.

### New: “Never Invent Numbers” Policy (N/A Instead of Fake Defaults)

- **RiskAgent**: if `cost_output.total` and `cost_output.subtotals.subtotal` are missing/zero, it does **not**
  invent a `base_cost`. It returns `monteCarlo: null`, `contingency: null`, `riskLevel: "n/a"`, plus an
  `error` object (`INSUFFICIENT_DATA`) so UI can render **N/A** cleanly.
- **FinalAgent**: if risk contingency is missing and the user did not supply `contingencyPct`, it uses **0**
  rather than defaulting to a made-up 10%.

### New: Timeline Tasks Are LLM-Generated (No Hardcoded Templates)

- Timeline task templates (kitchen/bathroom/default lists) are **removed**.
- `TimelineAgent` generates tasks via LLM from the pipeline inputs (scope + context JSON).
- If the schedule cannot be generated (or durations are missing), Timeline returns **N/A / insufficient data**
  instead of falling back to a pre-baked task list.

### Change: No Default Start Date Offset (Start Date Comes From JSON)

- Removed the TimelineAgent default of “**2 weeks from now**”.
- Timeline now requires `projectBrief.timeline.desiredStart` in the Clarification JSON.
- If missing/invalid, Timeline returns **N/A** with an explicit error (`INSUFFICIENT_DATA` / `INVALID_INPUT`).

### Change: TimelineCritic No Longer Uses Fixed Remodel Duration Heuristics

- Removed the heuristic “small remodel 20–30 days / large 60–90 days” from TimelineCritic feedback.
- TimelineCritic feedback is now **structural + internal consistency** (e.g., missing durations/ranges, inconsistent durationRange),
  not arbitrary sqft-based duration expectations.

### New: ICC Code Compliance Agent (Warnings in Final Report)

- Added a new primary agent: `code_compliance` (ICC-focused: IBC/IRC/IECC family).
- Runs after `scope` to leverage structured scope context.
- Produces **non-legal** code considerations/warnings (AHJ/local amendments apply).
- `FinalAgent` now includes a `codeCompliance` section with the agent’s warnings for the UI/report.

## Epic 2 Overview (Still the Core Engine)

The Deep Agent Pipeline consumes the output from Dev 3's Clarification Agent and runs through an **orchestrated, non-linear pipeline** with **Scorer + Critic validation**:

### Pipeline Architecture (19 Agents)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    ORCHESTRATOR                                               │
│  - Coordinates 6 primary + 6 scorer + 6 critic agents                                         │
│  - Flow: Primary → Scorer → (if low score) → Critic → Retry with feedback                    │
│  - Max 2 retries per agent                                                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
    ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
    ▼                                         ▼                                         ▼
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│  Location  │──►│   Scope    │──►│    Cost    │──►│    Risk    │──►│  Timeline  │──►│   Final    │
│   Agent    │   │   Agent    │   │   Agent    │   │   Agent    │   │   Agent    │   │   Agent    │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │                │                │                │                │                │
      ▼                ▼                ▼                ▼                ▼                ▼
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│  SCORER    │   │  SCORER    │   │  SCORER    │   │  SCORER    │   │  SCORER    │   │  SCORER    │
│  (0-100)   │   │  (0-100)   │   │  (0-100)   │   │  (0-100)   │   │  (0-100)   │   │  (0-100)   │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │                │                │                │                │                │
   ≥80? ──YES──►    ≥80? ──YES──►    ≥80? ──YES──►    ≥80? ──YES──►    ≥80? ──YES──►    ≥80? ──YES──► Done
      │                │                │                │                │                │
      ▼ NO             ▼ NO             ▼ NO             ▼ NO             ▼ NO             ▼ NO
┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
│   CRITIC   │   │   CRITIC   │   │   CRITIC   │   │   CRITIC   │   │   CRITIC   │   │   CRITIC   │
│ (feedback) │   │ (feedback) │   │ (feedback) │   │ (feedback) │   │ (feedback) │   │ (feedback) │
└─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
      │                │                │                │                │                │
      └────────────── Critic feedback → Retry PRIMARY (max 2 retries) ─────────────────────┘
```

### Agent Count: 19 Total
| Type | Count | Purpose |
|------|-------|---------|
| **Primary** | 6 | Location, Scope, Cost, Risk, Timeline, Final |
| **Scorer** | 6 | Objective numerical scoring (0-100) |
| **Critic** | 6 | Qualitative feedback when score < 80 |
| **Orchestrator** | 1 | Coordinate flow, manage retries |

## PR-Based Implementation Plan

| PR | Branch | Story | Status | Tests | Description |
|----|--------|-------|--------|-------|-------------|
| **PR #1** | `epic2/foundation` | 2.1 | ✅ Complete | 58 | Project setup, config, services, base classes |
| **PR #2** | `epic2/clarification-validation` | 2.1 | ✅ Complete | 7 | ClarificationOutput Pydantic models & parsing |
| **PR #3** | `epic2/orchestrator` | 2.1 | ✅ Complete | 15 | Pipeline orchestrator & Cloud Function entry points |
| **PR #4** | `ture-agent-pipeline` | 2.2 | ✅ Complete | 26 | Location Intelligence Agent |
| **PR #5** | `epic2/scope-agent` | 2.3 | ✅ Complete | 29 | Construction Scope Agent (BoQ enrichment) |
| **PR #6** | `epic2/cost-agent` | 2.4 | ✅ Complete | 36 | Cost Estimation Agent (P50/P80/P90) |
| **PR #7** | `epic2/risk-final-agents` | 2.5 | ✅ Complete | 33 | Risk, Timeline & Final Agents |
| **PR #8** | `epic2/firestore-rules` | - | ✅ Complete | - | Security rules, docs, integration mapping |

**Total Tests: 205 passing**

## Completed PRs

### PR #1: Foundation & Project Setup ✅
**Completed**: Dec 10, 2025
**Tests**: 58 passing

### PR #2: ClarificationOutput Models ✅
**Completed**: Dec 10, 2025
**Tests**: 7 passing (65 total)

### PR #3: Orchestrator & Pipeline Infrastructure ✅
**Completed**: Dec 10, 2025
**Tests**: 15 passing (80 total)

**Files Created**:
- `functions/models/agent_output.py` - AgentStatus, AgentOutput, PipelineStatus, PipelineResult
- `functions/models/estimate.py` - EstimateStatus, EstimateDocument
- `functions/agents/orchestrator.py` - PipelineOrchestrator with Scorer+Critic flow
- `functions/main.py` - Cloud Function entry points + 18 A2A endpoints
- `functions/agents/primary/*.py` - 6 stub primary agents
- `functions/agents/scorers/*.py` - 6 stub scorer agents
- `functions/agents/critics/*.py` - 6 stub critic agents
- `functions/tests/unit/test_orchestrator.py` - 15 unit tests
- `functions/.gitignore` - Python-specific ignores
- Updated `collabcanvas/firebase.json` for Python functions

### PR #4: Location Intelligence Agent ✅
**Completed**: Dec 11, 2025
**Tests**: 26 passing (106 total)

**Files Created/Modified**:
- `functions/models/location_factors.py` - LaborRates, PermitCosts, WeatherFactors, LocationFactors
- `functions/services/cost_data_service.py` - Mock cost data for 6 metros (Denver, NYC, Houston, LA, Chicago, Phoenix)
- `functions/agents/primary/location_agent.py` - Real LLM-powered agent (replaced stub)
- `functions/agents/scorers/location_scorer.py` - 7-criteria scoring (replaced stub)
- `functions/agents/critics/location_critic.py` - Actionable feedback (replaced stub)
- `functions/tests/fixtures/mock_cost_data.py` - Test fixtures
- `functions/tests/unit/test_location_agent.py` - 26 unit tests

**Features Implemented**:
- Location factors Pydantic models with validation
- CostDataService with mock data for major metros
- Regional estimation for unknown ZIP codes
- LLM-powered location analysis with fallback
- 7 scoring criteria (labor rates, location data, permits, weather, analysis quality, etc.)
- Detailed critic feedback with specific fix suggestions

### PR #5: Construction Scope Agent ✅
**Completed**: Dec 11, 2025
**Tests**: 29 passing (135 total)

**Files Created/Modified**:
- `functions/models/bill_of_quantities.py` - CostCode, UnitCostReference, EnrichedLineItem, EnrichedDivision, BillOfQuantities
- `functions/services/cost_data_service.py` - Added `get_cost_code()` for CSI MasterFormat lookup
- `functions/agents/primary/scope_agent.py` - Real LLM-powered agent (replaced stub)
- `functions/agents/scorers/scope_scorer.py` - 6-criteria scoring (replaced stub)
- `functions/agents/critics/scope_critic.py` - Actionable feedback (replaced stub)
- `functions/tests/fixtures/mock_boq_data.py` - Test fixtures
- `functions/tests/unit/test_scope_agent.py` - 29 unit tests

**Features Implemented**:
- Bill of Quantities Pydantic models with CSI division support
- CSI MasterFormat cost code lookup with fuzzy matching
- Scope enrichment with cost codes from ClarificationOutput csiScope
- Quantity validation against CAD data (spaceModel.rooms)
- 6 scoring criteria (cost code coverage, quantities, division coverage, etc.)
- Detailed critic feedback for scope completeness issues

## Completed PR: PR #7 ✅

**Branch**: `epic2/risk-final-agents`
**Story**: 2.5 - Risk, Timeline & Final Agents
**Tests**: 33 passing (205 total)
**Completed**: Dec 11, 2025

### PR #7 Files Created/Modified:
- `functions/models/risk_analysis.py` - RiskFactor, CostImpact, Probability, PercentileValues, MonteCarloResult, RiskAnalysisSummary, RiskAnalysis
- `functions/models/timeline.py` - DurationRange, TimelineTask, Milestone, CriticalPath, ProjectTimeline
- `functions/models/final_estimate.py` - ExecutiveSummary, CostBreakdownSummary, TimelineSummary, RiskSummary, FinalEstimate
- `functions/services/monte_carlo_service.py` - Mock Monte Carlo with NumPy triangular distributions
- `functions/agents/primary/risk_agent.py` - Real LLM-powered agent with Monte Carlo (replaced stub)
- `functions/agents/scorers/risk_scorer.py` - 4-criteria scoring (replaced stub)
- `functions/agents/critics/risk_critic.py` - Actionable feedback (replaced stub)
- `functions/agents/primary/timeline_agent.py` - Real LLM-powered agent (replaced stub)
- `functions/agents/scorers/timeline_scorer.py` - 4-criteria scoring (replaced stub)
- `functions/agents/critics/timeline_critic.py` - Actionable feedback (replaced stub)
- `functions/agents/primary/final_agent.py` - Real LLM-powered synthesis agent (replaced stub)
- `functions/agents/scorers/final_scorer.py` - 4-criteria scoring (replaced stub)
- `functions/agents/critics/final_critic.py` - Actionable feedback (replaced stub)
- `functions/tests/fixtures/mock_risk_timeline_data.py` - Test fixtures
- `functions/tests/unit/test_risk_timeline_final.py` - 33 unit tests

### Key Features Implemented:
- **Risk Agent**: Monte Carlo simulation with P50/P80/P90 percentiles, contingency calculation, risk factor identification
- **Timeline Agent**: Project timeline with tasks, durations, dependencies, critical path analysis
- **Final Agent**: Synthesis of all agent outputs into executive summary with recommendations

## Next PR: PR #8 (Ready to Start)

**Branch**: `epic2/firestore-rules`
**Story**: Firestore Rules & Documentation

## File Structure (Current State)

```
functions/
├── __init__.py
├── requirements.txt                 # ✅ PR #1
├── pytest.ini                       # ✅ PR #1
├── .gitignore                       # ✅ PR #3
├── main.py                          # ✅ PR #3 - Cloud Function entry points
│
├── agents/
│   ├── __init__.py
│   ├── agent_cards.py               # ✅ PR #1 - 19 agents registered
│   ├── base_agent.py                # ✅ PR #1 - BaseA2AAgent
│   ├── orchestrator.py              # ✅ PR #3 - PipelineOrchestrator
│   ├── primary/
│   │   ├── __init__.py
│   │   ├── location_agent.py        # ✅ PR #4 - Real LLM implementation
│   │   ├── scope_agent.py           # ✅ PR #5 - Real LLM implementation
│   │   ├── cost_agent.py            # ✅ PR #6 - Real LLM implementation with P50/P80/P90
│   │   ├── risk_agent.py            # ✅ PR #7 - Real LLM implementation with Monte Carlo
│   │   ├── timeline_agent.py        # ✅ PR #7 - Real LLM implementation
│   │   └── final_agent.py           # ✅ PR #7 - Real LLM synthesis agent
│   ├── scorers/
│   │   ├── __init__.py
│   │   ├── base_scorer.py           # ✅ PR #1 - BaseScorer
│   │   ├── location_scorer.py       # ✅ PR #4 - 7-criteria scoring
│   │   ├── scope_scorer.py          # ✅ PR #5 - 6-criteria scoring
│   │   ├── cost_scorer.py           # ✅ PR #6 - 6-criteria scoring
│   │   ├── risk_scorer.py           # ✅ PR #7 - 4-criteria scoring
│   │   ├── timeline_scorer.py       # ✅ PR #7 - 4-criteria scoring
│   │   └── final_scorer.py          # ✅ PR #7 - 4-criteria scoring
│   └── critics/
│       ├── __init__.py
│       ├── base_critic.py           # ✅ PR #1 - BaseCritic
│       ├── location_critic.py       # ✅ PR #4 - Actionable feedback
│       ├── scope_critic.py          # ✅ PR #5 - Actionable feedback
│       ├── cost_critic.py           # ✅ PR #6 - Actionable feedback
│       ├── risk_critic.py           # ✅ PR #7 - Actionable feedback
│       ├── timeline_critic.py       # ✅ PR #7 - Actionable feedback
│       └── final_critic.py          # ✅ PR #7 - Actionable feedback
│
├── config/
│   ├── __init__.py
│   ├── settings.py                  # ✅ PR #1
│   └── errors.py                    # ✅ PR #1
│
├── models/
│   ├── __init__.py
│   ├── clarification_output.py      # ✅ PR #2 - Full v3.0.0 models
│   ├── agent_output.py              # ✅ PR #3 - AgentStatus, PipelineStatus
│   ├── estimate.py                  # ✅ PR #3 - EstimateDocument
│   ├── location_factors.py          # ✅ PR #4 - LaborRates, PermitCosts, LocationFactors
│   ├── bill_of_quantities.py        # ✅ PR #5 - CostCode, EnrichedLineItem, BillOfQuantities
│   ├── cost_estimate.py             # ✅ PR #6 - CostRange, LineItemCost, CostEstimate
│   ├── risk_analysis.py             # ✅ PR #7 - RiskFactor, MonteCarloResult, RiskAnalysis
│   ├── timeline.py                  # ✅ PR #7 - TimelineTask, ProjectTimeline
│   └── final_estimate.py            # ✅ PR #7 - ExecutiveSummary, FinalEstimate
│
├── services/
│   ├── __init__.py
│   ├── firestore_service.py         # ✅ PR #1
│   ├── llm_service.py               # ✅ PR #1
│   ├── a2a_client.py                # ✅ PR #1
│   ├── cost_data_service.py         # ✅ PR #4/5/6 - Mock cost data + get_cost_code() + material/labor costs
│   └── monte_carlo_service.py       # ✅ PR #7 - Mock Monte Carlo simulation
│
├── validators/
│   ├── __init__.py
│   └── clarification_validator.py   # ✅ PR #2 - parse_clarification_output()
│
└── tests/
    ├── __init__.py
    ├── conftest.py                  # ✅ PR #1
    ├── fixtures/
    │   ├── __init__.py
    │   ├── clarification_output_kitchen.json   # ✅ PR #2
    │   ├── clarification_output_bathroom.json  # ✅ PR #2
    │   ├── mock_cost_data.py                   # ✅ PR #4 - Location test fixtures
    │   ├── mock_boq_data.py                    # ✅ PR #5 - BoQ test fixtures
    │   ├── mock_cost_estimate_data.py         # ✅ PR #6 - Cost test fixtures
    │   └── mock_risk_timeline_data.py         # ✅ PR #7 - Risk/Timeline/Final fixtures
    ├── unit/
    │   ├── __init__.py
    │   ├── test_a2a_client.py       # ✅ PR #1 (11 tests)
    │   ├── test_base_agent.py       # ✅ PR #1 (18 tests)
    │   ├── test_config.py           # ✅ PR #1 (11 tests)
    │   ├── test_firestore_service.py # ✅ PR #1 (9 tests)
    │   ├── test_llm_service.py      # ✅ PR #1 (9 tests)
    │   ├── test_clarification_models.py # ✅ PR #2 (7 tests)
    │   ├── test_orchestrator.py     # ✅ PR #3 (15 tests)
    │   ├── test_location_agent.py   # ✅ PR #4 (26 tests)
    │   ├── test_scope_agent.py      # ✅ PR #5 (29 tests)
    │   ├── test_cost_agent.py       # ✅ PR #6 (36 tests)
    │   └── test_risk_timeline_final.py # ✅ PR #7 (33 tests)
    └── integration/
        └── __init__.py
```

## Next Action

Finalize “granular cost” visibility end-to-end:
- Persist granular cost components to Firestore subcollection: `/estimates/{estimateId}/costItems`
  - Written by `CostAgent` as each line item is costed
  - Includes material/labor/equipment components plus simple heuristics (e.g., SF → plank counts)
- Ensure `get_pipeline_status` is dashboard-safe:
  - Serialize Firestore timestamps in JSON responses
  - Attach **full** `costItems` list into the `finalOutput` response for UI display (no truncation in API response)
- Keep Dev4 integration payload on estimate root aligned to `dev2-integration-spec.md` (fields like `laborAnalysis`, `cost_breakdown`, `risk_analysis`, etc.)

---

_Last Updated: December 14, 2025 (Live retailer material pricing integrated into CostAgent; unit tests stable)_
