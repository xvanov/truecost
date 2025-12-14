# Next Chat Prompt - Post-Merge Integration (Projects Flow + Deep Pipeline Wiring)

Copy and paste this into a new chat:

---

I'm Dev 2 for the TrueCost project, working on post-merge integration (Epic 6) and ensuring the Epic 2 deep pipeline is correctly wired into the CollabCanvas “Projects” UI flow.

## Context
- **Project**: TrueCost - AI-powered construction estimation system
- **My Role**: Dev 2 - Deep Agent Pipeline
- **Branch**: `bugfix/post-merge-integration`
- **Status**:
  - Epics 1, 2, 4, 5 merged
  - Epic 6 (post-merge integration) is active (see `docs/sprint-artifacts/tech-spec-post-merge-integration.md`)

## Current State (What Works)
- Deep pipeline runs via Python Cloud Functions + Firestore persistence in `/estimates/{estimateId}`
- `CostAgent` writes granular cost component rows to `/estimates/{estimateId}/costItems`
- `FinalAgent` exposes `costItemsCount` + `costItemsCollectionPath` on the estimate root for discovery
- `get_pipeline_status` is safe for dashboards:
  - Firestore timestamps serialize to ISO strings
  - `finalOutput` includes `granularCostItems.items` (full list in API response)
- Pipeline respects user-selected costing defaults (from input JSON):
  - `projectBrief.costPreferences.overheadPct`, `profitPct`, `contingencyPct`, `wasteFactor`
- Post-merge integration adds a UI-facing progress doc:
  - UI watches `/projects/{projectId}/pipeline/status`
  - TS callable orchestrator initializes pipeline + context and calls Python `start_deep_pipeline`
  - Python orchestrator syncs progress back via `FirestoreService.sync_to_project_pipeline()`

**Tests (last known)**:
- Python unit tests (functions): 488 passed, 7 skipped (latest run on Windows; WeasyPrint skipped if native deps missing)

Note:
- RiskAgent Monte Carlo iterations are controlled by `MONTE_CARLO_ITERATIONS` (default: 10000). Unit tests override to 1000 for speed.
- Policy: never invent numbers. If required upstream cost inputs are missing, RiskAgent returns N/A (`monteCarlo: null`, `contingency: null`) with `INSUFFICIENT_DATA`.
- Policy: no hardcoded timeline task templates. TimelineAgent generates tasks via LLM from user scope + pipeline JSON; if it cannot, it returns N/A instead of using canned tasks.
- Policy: Timeline start date must come from Clarification JSON (`projectBrief.timeline.desiredStart`). Do not default to “2 weeks from now”; if missing/invalid, return N/A with explicit error.
- Policy: TimelineCritic must not enforce fixed “small/large remodel” duration ranges. Critique should be context-driven and focus on completeness + internal consistency.
- New: `code_compliance` agent (ICC: IBC/IRC/IECC family) generates code-related warnings and FinalAgent exposes them under `codeCompliance.warnings` with an AHJ disclaimer.
- New: CostAgent can pull **live retailer material prices** via Epic 5 `comparePrices`:
  - TS callable: `collabcanvas/functions/src/priceComparison.ts`
  - Python wrapper: `functions/services/price_comparison_service.py`
  - Integration: `functions/services/cost_data_service.py` + `functions/agents/primary/cost_agent.py` (batching + fallback)

- New: Primary agents now run via **LangChain Deep Agents** (hybrid integration):
  - Helper: `functions/services/deep_agent_factory.py::deep_agent_generate_json(...)`
  - Firestore-backed agent filesystem: `functions/services/deep_agents_backend.py::FirestoreAgentFsBackend`
  - Scorers/critics unchanged (still existing LangChain wrapper patterns)

## What I Need Help With Next

### Tasks
- [ ] Verify “Projects” pipeline progress wiring:
  - TS callable `collabcanvas/functions/src/estimatePipelineOrchestrator.ts` creates `/projects/{projectId}/pipeline/status`
  - Python `functions/services/firestore_service.py::sync_to_project_pipeline()` updates it consistently
- [ ] Confirm ClarificationOutput bridging is compatible:
  - TS `buildClarificationOutput()` shape vs Python `validate_clarification_output()`
- [ ] Ensure estimate results render in the new “Projects” pages and PDF export works end-to-end

### Key References
- Memory Bank: `memory-bank/activeContext.md`, `memory-bank/systemPatterns.md`, `memory-bank/progress.md`
- Tech spec: `docs/sprint-artifacts/tech-spec-post-merge-integration.md`
- TS callable orchestrator: `collabcanvas/functions/src/estimatePipelineOrchestrator.ts`
- Frontend pipeline service: `collabcanvas/src/services/pipelineService.ts`
- Python Cloud Functions entry: `functions/main.py`
- Python Firestore sync: `functions/services/firestore_service.py`

### Acceptance Check
- Start pipeline from UI (“Generate Estimate”) → `/projects/{projectId}/pipeline/status` updates in realtime
- Python pipeline completes and writes results to `/estimates/{estimateId}`
- PDF export works via callable `generate_pdf`

Please read `memory-bank/activeContext.md` and `memory-bank/systemPatterns.md` first, then proceed.

---
