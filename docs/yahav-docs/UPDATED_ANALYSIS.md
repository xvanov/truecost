# TrueCost Frontend Analysis - Updated Status Report

> ⚠️ **FRONTEND-ONLY DOCUMENT**
> All tasks and changes in this document apply ONLY to `/collabcanvas/src/`.
> The backend (`/functions/`) is complete and should not be modified.
> Backend references are for understanding data contracts only.

**Date:** December 12, 2025  
**Developer:** Dev 1 (Frontend/UI)  
**Scope:** Frontend MVP completion, backend wiring, and fallback implementation

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Frontend State](#2-current-frontend-state)
3. [Routing & Navigation Analysis](#3-routing--navigation-analysis)
4. [Backend Integration Status](#4-backend-integration-status)
5. [Component Gap Analysis](#5-component-gap-analysis)
6. [State Management Analysis](#6-state-management-analysis)
7. [TypeScript Type Alignment](#7-typescript-type-alignment)
8. [Voice Input Status](#8-voice-input-status)
9. [Requires Attention Fallback Patterns](#9-requires-attention-fallback-patterns)
10. [Prioritized Task List](#10-prioritized-task-list)
11. [Recommendations](#11-recommendations)

---

## 1. Executive Summary

### Current State

The TrueCost frontend has significant progress with:

- ✅ Landing page complete with design system
- ✅ Dark industrial neon theme implemented
- ✅ Public/Authenticated layouts working
- ✅ Dashboard with project list/card views
- ✅ Basic estimate flow pages exist (Scope → Annotate → Estimate)
- ⚠️ Two parallel routing flows exist (needs consolidation)
- ❌ Backend not wired - uses mock data throughout
- ❌ TypeScript types don't match backend output schemas
- ❌ No voice input implementation
- ❌ No real-time pipeline status from backend

### Key Findings

1. **Routing Confusion**: Two flows exist (`/project/:id/*` and `/estimate/:id/*`) - need to consolidate
2. **Mock Data Everywhere**: ChatPanel, EstimateSummary, BreakdownTable all use hardcoded mock data
3. **Missing Types**: No TypeScript interfaces for backend output (P50/P80/P90, laborAnalysis, risk_analysis, etc.)
4. **Service Mismatch**: Frontend `pipelineService.ts` expects different endpoints than backend provides
5. **No Estimate Store**: `useEstimateStore` does not exist - estimate state scattered across components

---

## 2. Current Frontend State

### 2.1 Pages Inventory

| Page                 | Path                                 | Status      | Backend Wired                                     |
| -------------------- | ------------------------------------ | ----------- | ------------------------------------------------- |
| Landing              | `/`                                  | ✅ Complete | N/A                                               |
| Login                | `/login`                             | ✅ Complete | ✅ Firebase Auth                                  |
| Signup               | `/signup`                            | ✅ Complete | ✅ Firebase Auth                                  |
| Dashboard            | `/dashboard`                         | ✅ Complete | ✅ Firestore projects                             |
| Account              | `/account`                           | ✅ Complete | ⚠️ Partial                                        |
| ScopePage            | `/project/new`, `/project/:id/scope` | ✅ Complete | ⚠️ Creates project, no estimate                   |
| AnnotatePage         | `/project/:id/annotate`              | ✅ Complete | ❌ Mock chat only                                 |
| EstimatePage         | `/project/:id/estimate`              | ✅ Complete | ⚠️ Calls `triggerEstimatePipeline` but mismatched |
| **Legacy** PlanView  | `/estimate/:id/plan`                 | ⚠️ Exists   | ❌ Not wired                                      |
| **Legacy** FinalView | `/estimate/:id/final`                | ⚠️ Exists   | ❌ Mock data only                                 |

### 2.2 Design System Status

| Element                         | Status      |
| ------------------------------- | ----------- |
| Color palette (Tailwind config) | ✅ Complete |
| Typography (IBM Plex Sans)      | ✅ Complete |
| Glass panel components          | ✅ Complete |
| Button variants                 | ✅ Complete |
| Form inputs                     | ✅ Complete |
| Navigation bars                 | ✅ Complete |

---

## 3. Routing & Navigation Analysis

### 3.1 Current Routes in `App.tsx`

```
PUBLIC ROUTES:
/               → Landing
/login          → Login
/signup         → Signup
/privacy        → Privacy
/terms          → Terms

AUTHENTICATED ROUTES:
/dashboard      → Dashboard
/account        → Account

NEW PROJECT FLOW (PRIMARY):
/project/new           → ScopePage (create project)
/project/:id/scope     → ScopePage (edit)
/project/:id/annotate  → AnnotatePage (canvas + chat)
/project/:id/estimate  → EstimatePage (generate + results)

LEGACY ESTIMATE FLOW (TO BE DEPRECATED):
/estimate/new          → Redirects to /project/new
/estimate/:id          → EstimateView
/estimate/:id/plan     → PlanView
/estimate/:id/canvas   → Board
/estimate/:id/final    → FinalView

LEGACY PROJECT ROUTE:
/projects/:projectId/* → Project (old CollabCanvas)
/compare-prices        → PriceComparisonPage
```

### 3.2 Flow Analysis

**Recommended Primary Flow:** `/project/*` routes

- This is the active, maintained flow
- Uses modern components (ScopePage, AnnotatePage, EstimatePage)
- Has step progression (Scope → Annotate → Estimate)

**Legacy Flow Issues:**

- `/estimate/:id/*` routes use older components with different mock data
- `FinalView` has its own mock breakdown data, not connected to pipeline
- Creates confusion about which flow to use

### 3.3 Navigation Issues Found

| Issue                                             | Location              | Impact                           |
| ------------------------------------------------- | --------------------- | -------------------------------- |
| Dashboard "New Estimate" goes to `/project/new`   | `DashboardHeader.tsx` | ✅ Correct                       |
| ProjectCard navigates to `/project/:id/scope`     | `ProjectCard.tsx`     | ⚠️ Should go to appropriate step |
| EstimatePage "Back to Annotate" works             | `EstimatePage.tsx`    | ✅ Correct                       |
| No navigation from estimate results to final view | `EstimatePage.tsx`    | ❌ Missing                       |

---

## 4. Backend Integration Status

### 4.1 Available Backend Endpoints (Reference Only)

From `functions/main.py`:

| Endpoint               | Purpose                      | Method |
| ---------------------- | ---------------------------- | ------ |
| `start_deep_pipeline`  | Start estimation pipeline    | POST   |
| `get_pipeline_status`  | Get pipeline progress        | POST   |
| `delete_estimate`      | Delete an estimate           | POST   |
| `a2a_*` (18 endpoints) | Agent-to-Agent communication | POST   |

**Note:** There is NO `generate_pdf` function deployed yet. PDF generation exists in code but needs to be exported.

### 4.2 Frontend Service Analysis

#### `pipelineService.ts`

| What Frontend Expects                          | What Backend Provides                                           | Status              |
| ---------------------------------------------- | --------------------------------------------------------------- | ------------------- |
| `triggerEstimatePipeline(projectId, userId)`   | `start_deep_pipeline({userId, projectId, clarificationOutput})` | ❌ **Mismatch**     |
| Subscribes to `/projects/{id}/pipeline/status` | Backend writes to `/estimates/{id}`                             | ❌ **Wrong path**   |
| `PIPELINE_STAGES` includes `cad_analysis`      | Backend stages: `location, scope, cost, risk, timeline, final`  | ⚠️ Different stages |

**Problem:** Frontend is looking for pipeline status at wrong Firestore path and calling wrong function signature.

#### `pdfService.ts`

| What Frontend Expects                  | What Backend Provides                                    | Status              |
| -------------------------------------- | -------------------------------------------------------- | ------------------- |
| `generate_pdf` Cloud Function          | Function exists in `functions/services/pdf_generator.py` | ❌ **Not exported** |
| `{project_id, client_ready, sections}` | N/A                                                      | ❌ No HTTP endpoint |

**Problem:** PDF generator exists but is not exposed as a Cloud Function endpoint in `main.py`.

#### `bomService.ts`

| What Frontend Expects            | What Backend Provides                         | Status                |
| -------------------------------- | --------------------------------------------- | --------------------- |
| `generateBOM` Cloud Function     | N/A                                           | ❌ **Does not exist** |
| BOM at `/projects/{id}/bom/data` | Backend writes to `/estimates/{id}/costItems` | ❌ **Different path** |

**Problem:** BOM structure is completely different from what backend produces.

### 4.3 Data Path Mismatches

| Data            | Frontend Path                    | Backend Path                     | Fix Required    |
| --------------- | -------------------------------- | -------------------------------- | --------------- |
| Pipeline status | `/projects/{id}/pipeline/status` | `/estimates/{id}.pipelineStatus` | Frontend update |
| Agent outputs   | `/projects/{id}/agentOutputs`    | `/estimates/{id}/agentOutputs`   | Frontend update |
| Final estimate  | N/A                              | `/estimates/{id}` (root doc)     | Create frontend |
| Cost items      | `/projects/{id}/bom/data`        | `/estimates/{id}/costItems`      | Frontend update |

---

## 5. Component Gap Analysis

### 5.1 Components Using Mock Data

| Component       | File                                      | Mock Data Location                       | Backend Data Source                 |
| --------------- | ----------------------------------------- | ---------------------------------------- | ----------------------------------- |
| ChatPanel       | `components/estimate/ChatPanel.tsx`       | Hardcoded `clarificationQuestions` array | Should call clarification agent API |
| EstimateSummary | `components/estimate/EstimateSummary.tsx` | Props passed from parent                 | Needs `finalEstimate` from backend  |
| BreakdownTable  | `components/estimate/BreakdownTable.tsx`  | Props from `FinalView`                   | Needs `cost_breakdown` from backend |
| RiskChart       | `components/estimate/RiskChart.tsx`       | Likely mock                              | Needs `risk_analysis.histogram`     |
| FinalView       | `pages/estimate/FinalView.tsx`            | All hardcoded: `$125,000`, trades list   | Full backend integration needed     |

### 5.2 Missing Components (Per Epic 1)

| Component             | Story | Required For                         | Status                                   |
| --------------------- | ----- | ------------------------------------ | ---------------------------------------- |
| `PipelineProgress`    | 1.4   | Real-time agent status visualization | ❌ Missing standalone component          |
| `AgentCard`           | 1.4   | Show individual agent output         | ❌ Missing                               |
| `FeedbackForm`        | 1.4   | Input actual costs                   | ❌ Missing                               |
| `VarianceAnalysis`    | 1.4   | Compare estimate vs actual           | ⚠️ `ComparisonView` exists but not wired |
| `VoiceInputButton`    | 1.1   | Voice recording with feedback        | ❌ Missing                               |
| `ProjectBriefPreview` | 1.1   | Review extracted data before plan    | ❌ Missing                               |
| `TimelineGantt`       | 1.3   | Gantt chart for schedule             | ⚠️ `TimeView` exists but uses mock       |

### 5.3 Components That Exist But Need Backend Wiring

| Component              | Current State                   | Needs                                     |
| ---------------------- | ------------------------------- | ----------------------------------------- |
| `EstimatePage`         | Calls `triggerEstimatePipeline` | Correct function call + response handling |
| `ChatPanel`            | Mock Q&A                        | Real clarification agent integration      |
| `PriceComparisonPanel` | Exists                          | Verify data source                        |
| `MoneyView`            | Reads from BOM store            | Wire to backend cost_breakdown            |
| `TimeView`             | Exists                          | Wire to backend schedule                  |

---

## 6. State Management Analysis

### 6.1 Existing Zustand Stores

| Store                | File                          | Purpose                               | Estimate-Related          |
| -------------------- | ----------------------------- | ------------------------------------- | ------------------------- |
| `canvasStore`        | `store/canvasStore.ts`        | Canvas shapes, selection, layers, BOM | ⚠️ Has `billOfMaterials`  |
| `projectStore`       | `store/projectStore.ts`       | Project CRUD, list                    | ⚠️ Has basic project info |
| `scopeStore`         | `store/scopeStore.ts`         | Scope items                           | ❌ Not used for estimates |
| `projectCanvasStore` | `store/projectCanvasStore.ts` | Per-project canvas state              | ❌ Not estimate-related   |

### 6.2 Missing State Management

**`useEstimateStore` does not exist** - This was planned but never created.

Required estimate state:

```typescript
interface EstimateState {
  currentEstimate: Estimate | null;
  pipelineStatus: PipelineStatus | null;
  agentOutputs: Record<string, AgentOutput>;
  finalEstimate: FinalEstimate | null;

  // Actions
  startPipeline: (
    projectId: string,
    clarificationOutput: ClarificationOutput
  ) => Promise<void>;
  subscribeToPipeline: (estimateId: string) => () => void;
  loadEstimate: (estimateId: string) => Promise<void>;
}
```

### 6.3 Hooks Analysis

| Hook                | File                         | Status                |
| ------------------- | ---------------------------- | --------------------- |
| `useAuth`           | `hooks/useAuth.ts`           | ✅ Working            |
| `useShapes`         | `hooks/useShapes.ts`         | ✅ Working (canvas)   |
| `useLayers`         | `hooks/useLayers.ts`         | ✅ Working (canvas)   |
| `useStepCompletion` | `hooks/useStepCompletion.ts` | ✅ Working            |
| `useVoiceInput`     | -                            | ❌ **Does not exist** |
| `useCadUpload`      | -                            | ❌ **Does not exist** |
| `usePipelineStatus` | -                            | ❌ **Does not exist** |
| `useEstimate`       | -                            | ❌ **Does not exist** |

---

## 7. TypeScript Type Alignment

### 7.1 Backend Output Schema (from `dev2-integration-spec.md`)

The backend produces this structure at `/estimates/{estimateId}`:

```typescript
interface BackendEstimate {
  // Required fields
  estimate_id: string;
  projectName: string;
  address: string;
  projectType: string;
  scope: string;
  squareFootage: number;

  // Cost summary (P50/P80/P90)
  totalCost: number; // Base estimate (P50)
  p50: number;
  p80: number;
  p90: number;
  contingencyPct: number;
  timelineWeeks: number;
  monteCarloIterations: number;

  // Nested objects
  laborAnalysis: LaborAnalysis;
  schedule: Schedule;
  cost_breakdown: CostBreakdown;
  risk_analysis: RiskAnalysis;
  bill_of_quantities: BillOfQuantities;
  assumptions: Assumptions;
  cad_data: CADData | null;

  // Pipeline status
  pipelineStatus: PipelineStatus;
  status: "processing" | "completed" | "failed";
}
```

### 7.2 Missing TypeScript Interfaces

These need to be created in `src/types/estimate.ts`:

| Interface                 | Description                 | Priority |
| ------------------------- | --------------------------- | -------- |
| `Estimate`                | Root estimate document      | P0       |
| `PipelineStatus`          | Pipeline progress tracking  | P0       |
| `LaborAnalysis`           | Trades breakdown            | P0       |
| `CostBreakdown`           | CSI division costs          | P0       |
| `RiskAnalysis`            | Monte Carlo results         | P0       |
| `Schedule`                | Task list with dependencies | P1       |
| `BillOfQuantitiesBackend` | Backend BoQ format          | P1       |
| `Assumptions`             | Inclusions/exclusions       | P1       |
| `AgentOutput`             | Individual agent result     | P0       |
| `ClarificationOutput`     | Schema v3.0.0               | P0       |

### 7.3 Type Mismatches

| Frontend Type                           | Backend Type              | Issue                             |
| --------------------------------------- | ------------------------- | --------------------------------- |
| `BillOfMaterials` (material.ts)         | `bill_of_quantities`      | Completely different structure    |
| `PipelineProgress` (pipelineService.ts) | `pipelineStatus`          | Similar but different field names |
| None                                    | `laborAnalysis`           | Missing entirely                  |
| None                                    | `risk_analysis.histogram` | Missing entirely                  |
| None                                    | `ClarificationOutput`     | Missing entirely                  |

---

## 8. Voice Input Status

### 8.1 Current State

| Item                       | Status             |
| -------------------------- | ------------------ |
| `useVoiceInput` hook       | ❌ Does not exist  |
| Web Speech API integration | ❌ Not implemented |
| Voice button in ChatPanel  | ❌ Not present     |
| Visual recording indicator | ❌ Not implemented |
| Transcription display      | ❌ Not implemented |

### 8.2 PRD Requirements (FR19-22)

- **FR19:** Users can describe their project using voice input (speech-to-text)
- **FR20:** System provides visual feedback during voice recording
- **FR21:** System transcribes voice input and displays for user confirmation
- **FR22:** Users can edit transcribed voice input before submission

### 8.3 Implementation Notes

Web Speech API is browser-native and works without backend:

```typescript
// Conceptual hook structure
const useVoiceInput = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);

  // Check for Web Speech API support
  // Start/stop recording
  // Handle transcript updates

  return {
    isRecording,
    transcript,
    startRecording,
    stopRecording,
    isSupported,
  };
};
```

---

## 9. Requires Attention Fallback Patterns

### 9.1 Recommended Console.log Pattern

Add this pattern wherever backend data is consumed:

```typescript
// Pattern for backend data validation
function validateBackendData<T>(
  data: T | null | undefined,
  component: string,
  service: string,
  expectedShape: string
): data is T {
  if (!data) {
    console.warn("[REQUIRES ATTENTION]", {
      component,
      service,
      issue: "Data is null or undefined",
      expected: expectedShape,
      received: data,
    });
    return false;
  }
  return true;
}

// Usage example in a component:
function EstimateSummary({ estimateId }: Props) {
  const estimate = useEstimate(estimateId);

  if (
    !validateBackendData(
      estimate,
      "EstimateSummary",
      "getEstimate",
      "{ totalCost: number, p50: number, p80: number, p90: number }"
    )
  ) {
    return <FallbackMessage>Estimate data unavailable</FallbackMessage>;
  }

  // Validate nested fields
  if (!estimate.p50 || !estimate.p80 || !estimate.p90) {
    console.warn("[REQUIRES ATTENTION]", {
      component: "EstimateSummary",
      service: "getEstimate",
      issue: "Missing confidence range data",
      expected: "p50, p80, p90 should be numbers",
      received: { p50: estimate.p50, p80: estimate.p80, p90: estimate.p90 },
    });
  }

  // Render with data...
}
```

### 9.2 Locations Requiring Fallback Implementation

| Component         | Data Source             | Fields to Validate                                |
| ----------------- | ----------------------- | ------------------------------------------------- |
| `EstimateSummary` | `/estimates/{id}`       | `totalCost`, `p50`, `p80`, `p90`, `timelineWeeks` |
| `BreakdownTable`  | `cost_breakdown`        | `divisions[]`, `items[]`                          |
| `RiskChart`       | `risk_analysis`         | `histogram[]`, `topRisks[]`                       |
| `MoneyView`       | `laborAnalysis`         | `trades[]`, `total_hours`                         |
| `TimeView`        | `schedule`              | `tasks[]`, `total_weeks`                          |
| `ChatPanel`       | Clarification Agent API | Response messages                                 |
| `EstimatePage`    | Pipeline status         | `status`, `currentAgent`, `progress`              |

---

## 10. Prioritized Task List

### P0 - Critical (Blocks Core Flow)

| #   | Task                                                                      | Files                                         | Complexity | Dependencies |
| --- | ------------------------------------------------------------------------- | --------------------------------------------- | ---------- | ------------ |
| 1   | **Create `types/estimate.ts`** with backend-aligned interfaces            | `src/types/estimate.ts`                       | Medium     | None         |
| 2   | **Fix `pipelineService.ts`** - correct Firestore paths and function calls | `src/services/pipelineService.ts`             | Medium     | Task 1       |
| 3   | **Create `useEstimateStore`** - centralized estimate state management     | `src/store/estimateStore.ts`                  | High       | Task 1       |
| 4   | **Wire `EstimatePage`** to real backend pipeline                          | `src/pages/project/EstimatePage.tsx`          | High       | Tasks 2, 3   |
| 5   | **Update `EstimateSummary`** to consume backend data                      | `src/components/estimate/EstimateSummary.tsx` | Medium     | Task 3       |
| 6   | **Update `BreakdownTable`** to use `cost_breakdown` schema                | `src/components/estimate/BreakdownTable.tsx`  | Medium     | Task 1       |

### P1 - Important (MVP but not blocking)

| #   | Task                                                         | Files                                          | Complexity | Dependencies       |
| --- | ------------------------------------------------------------ | ---------------------------------------------- | ---------- | ------------------ |
| 7   | **Wire `ChatPanel`** to clarification agent API              | `src/components/estimate/ChatPanel.tsx`        | High       | Backend API exists |
| 8   | **Create `RiskChart`** with real `risk_analysis.histogram`   | `src/components/estimate/RiskChart.tsx`        | Medium     | Task 1             |
| 9   | **Update `MoneyView`** for backend `laborAnalysis`           | `src/components/money/MoneyView.tsx`           | Medium     | Task 1             |
| 10  | **Update `TimeView`** for backend `schedule`                 | `src/components/time/TimeView.tsx`             | Medium     | Task 1             |
| 11  | **Consolidate routing** - deprecate `/estimate/:id/*` routes | `src/App.tsx`                                  | Low        | None               |
| 12  | **Add fallback console.logs** throughout estimate components | Multiple files                                 | Low        | None               |
| 13  | **Create `PipelineProgress`** standalone component           | `src/components/estimate/PipelineProgress.tsx` | Medium     | Task 2             |

### P2 - Nice-to-have (Polish)

| #   | Task                                           | Files                                          | Complexity | Dependencies         |
| --- | ---------------------------------------------- | ---------------------------------------------- | ---------- | -------------------- |
| 14  | **Implement `useVoiceInput`** hook             | `src/hooks/useVoiceInput.ts`                   | Medium     | None                 |
| 15  | **Add voice button** to ChatPanel              | `src/components/estimate/ChatPanel.tsx`        | Low        | Task 14              |
| 16  | **Create `FeedbackForm`** for actual costs     | `src/components/estimate/FeedbackForm.tsx`     | Medium     | Task 1               |
| 17  | **Create `VarianceAnalysis`** display          | `src/components/estimate/VarianceAnalysis.tsx` | Medium     | Task 16              |
| 18  | **Add PDF export** button with loading state   | `src/pages/project/EstimatePage.tsx`           | Low        | Backend PDF endpoint |
| 19  | **Create `AgentCard`** for pipeline visibility | `src/components/estimate/AgentCard.tsx`        | Low        | Task 13              |
| 20  | **Remove legacy estimate pages**               | `src/pages/estimate/*`                         | Low        | Task 11              |

---

## 11. Recommendations

### 11.1 Recommended Primary User Flow

```
Dashboard → New Estimate → ScopePage → AnnotatePage → EstimatePage
             /project/new   /project/:id/scope  /project/:id/annotate  /project/:id/estimate
```

- **Deprecate** all `/estimate/:id/*` routes
- **Keep** `/estimate/new` redirect to `/project/new`
- **Remove** `FinalView.tsx`, `PlanView.tsx`, `EstimateView.tsx` after consolidation

### 11.2 Implementation Order

1. **Week 1: Foundation**

   - Create `types/estimate.ts` with all backend interfaces
   - Create `useEstimateStore`
   - Fix `pipelineService.ts` paths

2. **Week 2: Core Wiring**

   - Wire `EstimatePage` to backend
   - Update `EstimateSummary` and `BreakdownTable`
   - Add fallback console.logs

3. **Week 3: Complete Flow**

   - Wire `ChatPanel` to clarification agent
   - Update `MoneyView`, `TimeView`, `RiskChart`
   - Consolidate routing

4. **Week 4: Polish**
   - Implement voice input
   - Add feedback form
   - Remove legacy code

### 11.3 Architecture Concerns

1. **Data ID Mismatch**: Frontend uses `projectId`, backend uses `estimateId`. Need to establish clear relationship.

2. **Firestore Path Confusion**: Backend writes to `/estimates/`, frontend expects `/projects/`. Need consistent approach.

3. **ClarificationOutput**: Frontend needs to construct this from user input (chat, CAD) before calling `start_deep_pipeline`.

4. **Real-time Updates**: Backend writes to Firestore, frontend should use `onSnapshot` listeners for live updates.

### 11.4 Quick Wins

1. Add console.log fallbacks everywhere (low effort, high visibility)
2. Consolidate routing (clean up confusion)
3. Create types file (enables TypeScript checking)

---

## Appendix A: File Reference

### Files to Create

```
src/types/estimate.ts           # Backend-aligned types
src/store/estimateStore.ts      # Estimate state management
src/hooks/useEstimate.ts        # Estimate data hook
src/hooks/usePipelineStatus.ts  # Pipeline subscription hook
src/hooks/useVoiceInput.ts      # Voice recording hook
src/components/estimate/PipelineProgress.tsx  # Pipeline visualization
src/components/estimate/AgentCard.tsx         # Agent output card
src/components/estimate/FeedbackForm.tsx      # Actual costs input
src/components/estimate/VarianceAnalysis.tsx  # Estimate vs actual
```

### Files to Modify

```
src/services/pipelineService.ts  # Fix paths and function calls
src/pages/project/EstimatePage.tsx  # Wire to backend
src/components/estimate/EstimateSummary.tsx  # Use real data
src/components/estimate/BreakdownTable.tsx   # Use cost_breakdown
src/components/estimate/ChatPanel.tsx        # Wire to agent API
src/components/estimate/RiskChart.tsx        # Use risk_analysis
src/components/money/MoneyView.tsx           # Use laborAnalysis
src/components/time/TimeView.tsx             # Use schedule
src/App.tsx                                  # Consolidate routes
```

### Files to Delete (After Migration)

```
src/pages/estimate/EstimateView.tsx
src/pages/estimate/PlanView.tsx
src/pages/estimate/FinalView.tsx
src/pages/estimate/NewEstimate.tsx  # Already redirects
```

---

## Appendix B: Backend Endpoint Quick Reference

**Base URL:** Firebase Functions (emulator: `localhost:5001`)

| Endpoint              | Method | Request Body                                | Response                                                 |
| --------------------- | ------ | ------------------------------------------- | -------------------------------------------------------- |
| `start_deep_pipeline` | POST   | `{userId, projectId?, clarificationOutput}` | `{success, data: {estimateId, status}}`                  |
| `get_pipeline_status` | POST   | `{estimateId}`                              | `{success, data: {status, currentAgent, progress, ...}}` |
| `delete_estimate`     | POST   | `{estimateId, userId}`                      | `{success, data: {deleted: true}}`                       |

**Firestore Paths:**

- Estimate document: `/estimates/{estimateId}`
- Agent outputs: `/estimates/{estimateId}/agentOutputs/{agentName}`
- Cost items: `/estimates/{estimateId}/costItems/{itemId}`

---

_Document generated: December 12, 2025_
_Next review: After P0 tasks complete_
