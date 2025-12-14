# Post-Merge Integration Tech Spec

**Date:** 2025-12-11
**Author:** xvanov
**Epic:** Post-Merge Integration (Epics 1, 4, 5 Consolidation)
**Status:** Draft

---

## Overview

After merging Epics 1 (UI), 4 (Data Services & PDF), and 5 (Price Comparison), several integration gaps remain that prevent the end-to-end user flow from working correctly. This tech spec addresses:

1. **Projects not persisting** - The estimate flow creates mock IDs instead of saving to Firestore
2. **Missing views** - MoneyView and TimeView components exist but aren't integrated
3. **UI restructuring** - Align pages with desired user flow
4. **Terminology change** - "Estimates" → "Projects"
5. **Dual PDF export** - Contractor and Client versions

## Objectives and Scope

### In-Scope

- **Fix project persistence** - Save projects to Firestore when created
- **Add visual stepper** - Navigation breadcrumb for Scope → Annotate → Estimate flow
- **Restructure Scope page** - Remove chatbot (until Generate Estimate), rename sections
- **Integrate clarification agent** - Chatbot activates on "Generate Estimate" click
- **Integrate MoneyView** - Replace FinalView stub with real MoneyView tabs
- **Implement TimeView** - CPM graph + Gantt chart
- **Dual PDF export** - Two buttons: Contractor Estimate, Client Estimate
- **Back navigation** - Allow returning to any completed stage

### Out-of-Scope

- Price comparison UI enhancements (Epic 5 standalone)
- New agent development (uses existing clarification agent)
- Mobile-specific layouts

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Flow                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Dashboard ──► Scope Page ──► Annotate Plan ──► Estimate Page           │
│                    │              │                   │                  │
│              [Create Project]  [Canvas +     [Phase 1: Generate btn]    │
│              [Upload Plan]     Chatbot]      [Progress bar + stages]    │
│              [Scope Definition]              [Phase 2: Results]         │
│              (NO chatbot here)  Clarification  - Materials tab          │
│                                 Agent runs     - Labor tab              │
│                                 back & forth   - Time tab (CPM+Gantt)   │
│                                 "Has all info" - Price Comparison tab   │
│                                 → Generate btn  [2 PDF buttons]         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual Stepper Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ● Scope  ────────  ○ Annotate  ────────  ○ Estimate                   │
│  ▲ current                                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

- Each step is clickable when completed
- Current step is highlighted
- Future steps are disabled

## Detailed Design

### Route Changes (App.tsx)

| Current Route | New Route | Component | Notes |
|--------------|-----------|-----------|-------|
| `/estimate/new` | `/project/new` | ScopePage | Merged NewEstimate + PlanView |
| `/estimate/:id/plan` | REMOVED | - | Merged into ScopePage |
| `/estimate/:id/canvas` | `/project/:id/annotate` | Board | Renamed |
| `/estimate/:id/final` | `/project/:id/estimate` | EstimatePage | New component with tabs |
| `/estimate/:id` | `/project/:id` | ProjectHub | Optional: redirect to current stage |

### New Components

#### 1. EstimateStepper.tsx
```typescript
interface EstimateStepperProps {
  currentStep: 'scope' | 'annotate' | 'estimate';
  projectId: string;
  completedSteps: ('scope' | 'annotate' | 'estimate')[];
}
```

#### 2. ScopePage.tsx (Merged NewEstimate + PlanView)
- Form fields: Project Name, Location, Project Type, Size
- File upload zone (required)
- Scope Definition textarea (renamed from "Additional Details")
- ZIP code override + Labor type toggle
- **NO chatbot on this page** - chatbot is on Annotate page only
- Remove "Extracted Quantities" section entirely
- "Continue to Annotate" button (navigates to Annotate page)

#### 3. AnnotatePage.tsx (Board + Chatbot)
- Canvas for plan annotation (existing Board component)
- **Chatbot with clarification agent** - runs back-and-forth Q&A
- Agent outputs "Have all information needed" when complete
- Shows "Generate Estimate" button when agent signals completion
- Button navigates to EstimatePage

#### 4. EstimatePage.tsx (New - Two Phases)
**Phase 1: Generation**
- "Generate Estimate" button triggers pipeline
- Progress bar showing current stage (e.g., "Analyzing materials...", "Calculating labor...")
- Real-time status updates from agent pipeline

**Phase 2: Results (after generation complete)**
- EstimateStepper at top
- **Five tabs:** Materials | Labor | Time | Price Comparison | Estimate vs Actual
- Integrates MoneyView for Materials/Labor tabs
- Integrates TimeView for Time tab (**full CPM graph + Gantt chart required**)
- Price Comparison tab: Home Depot vs Lowe's pricing (Epic 5)
- Estimate vs Actual tab: Variance tracking (existing ComparisonView)
- Two PDF buttons: "Contractor Estimate" and "Client Estimate"

### Data Flow

```
ScopePage
    │
    ├── On form submit: projectStore.createNewProject(name, description, userId)
    │   └── Returns projectId, saves to Firestore
    │
    ├── On file upload: Store file in project state
    │
    └── "Continue to Annotate" → Navigate to /project/{projectId}/annotate

AnnotatePage
    │
    ├── Load project data and CAD file
    │
    ├── Chatbot with Clarification Agent:
    │   ├── Agent asks questions about the project
    │   ├── User responds in chat
    │   └── Agent signals "have all information" when complete
    │
    └── "Generate Estimate" button appears → Navigate to /project/{projectId}/estimate

EstimatePage
    │
    ├── Phase 1 (if estimate not yet generated):
    │   ├── "Generate Estimate" button
    │   ├── On click: Trigger agent pipeline
    │   ├── Show progress bar with stage names
    │   └── On completion: Switch to Phase 2
    │
    └── Phase 2 (results):
        ├── Tabs: Materials | Labor | Time | Price Comparison | Estimate vs Actual
        └── PDF buttons: Contractor | Client
```

### Firestore Structure

```
users/{userId}/projects/{projectId}
├── name: string
├── description: string
├── status: 'scope' | 'annotating' | 'estimating' | 'complete'
├── location: { city, state, zipCode }
├── projectType: string
├── size: string
├── scopeDefinition: string
├── laborType: 'union' | 'non-union'
├── cadFileUrl: string
├── clarificationComplete: boolean
├── createdAt: timestamp
├── updatedAt: timestamp
└── ownerId: string
```

---

## Story 1: Project Persistence & Scope Page Restructure

### Description

As a **contractor**, I want to **create a new project that saves to my dashboard** so that **I can return to it later and track my estimates**.

### Acceptance Criteria

| AC# | Criterion | Verification |
|-----|-----------|--------------|
| 1.1 | Creating a new project saves it to Firestore immediately | Check Firestore after form submit |
| 1.2 | Project appears on dashboard after creation | Navigate to dashboard, verify project visible |
| 1.3 | "Additional Details" renamed to "Scope Definition" | Visual inspection |
| 1.4 | "Extracted Quantities" section removed | Visual inspection |
| 1.5 | Chatbot NOT on Scope page (only on Annotate page) | Visual inspection |
| 1.6 | "Continue to Annotate" button navigates to Annotate page | Functional test |
| 1.7 | Annotate page has chatbot with clarification agent | Visual inspection |
| 1.8 | Agent asks clarifying questions back-and-forth | Functional test |
| 1.9 | Agent signals "have all information" when done | Functional test |
| 1.10 | "Generate Estimate" button appears after agent completion | Visual inspection |
| 1.11 | Visual stepper shows: Scope (current) → Annotate → Estimate | Visual inspection |
| 1.12 | All terminology changed from "Estimate" to "Project" | Grep codebase |
| 1.13 | Back navigation from Annotate returns to Scope with data preserved | Functional test |

### Technical Tasks

1. **Merge NewEstimate + PlanView into ScopePage.tsx**
   - Combine form fields with file upload
   - Remove chatbot entirely (chatbot is on Annotate page)
   - Remove "Extracted Quantities" section
   - Rename "Additional Details" to "Scope Definition"
   - Add "Continue to Annotate" button

2. **Fix project persistence in ScopePage**
   ```typescript
   // Before: generates mock ID
   const mockProjectId = `est-${Date.now()}`;

   // After: saves to Firestore
   const project = await projectStore.createNewProject(
     formData.name,
     formData.scopeDefinition,
     user.uid
   );
   navigate(`/project/${project.id}/annotate`);
   ```

3. **Create EstimateStepper.tsx component**
   - Three steps: Scope, Annotate, Estimate
   - Clickable when step is completed
   - Visual highlighting for current step

4. **Update routes in App.tsx**
   - `/project/new` → ScopePage (initial create)
   - `/project/:id/scope` → ScopePage (edit mode)
   - `/project/:id/annotate` → AnnotatePage (Board + Chatbot)
   - `/project/:id/estimate` → EstimatePage

5. **Rename terminology throughout UI**
   - Dashboard: "New Estimate" → "New Project"
   - Headers: "Final Estimate" → "Project Estimate"
   - Status labels as needed

6. **Create AnnotatePage.tsx with chatbot**
   - Include Board component for plan annotation
   - Include ChatPanel with clarification agent
   - Agent runs back-and-forth Q&A with user
   - Listen for agent "have all information" signal
   - Show "Generate Estimate" button when agent is done
   - Button navigates to EstimatePage

### Files Modified

| File | Action | Changes |
|------|--------|---------|
| `src/pages/estimate/NewEstimate.tsx` | DELETE | Merged into ScopePage |
| `src/pages/estimate/PlanView.tsx` | DELETE | Merged into ScopePage |
| `src/pages/project/ScopePage.tsx` | CREATE | Combined page with persistence (no chatbot) |
| `src/pages/project/AnnotatePage.tsx` | CREATE | Board + Chatbot with clarification agent |
| `src/components/estimate/EstimateStepper.tsx` | CREATE | Visual stepper component |
| `src/App.tsx` | MODIFY | Update routes |
| `src/pages/Dashboard.tsx` | MODIFY | Rename "New Estimate" button |

---

## Story 2: Estimate Page with Two-Phase UI, Tabs & Dual PDF Export

### Description

As a **contractor**, I want to **generate an estimate with a progress bar showing each pipeline stage**, then **view results in Materials, Labor, Time, Price Comparison, and Estimate vs Actual tabs**, and **download separate PDF versions for contractors and clients** so that **I can track estimate generation, find the best material prices, and share appropriate information with each audience**.

### Acceptance Criteria

| AC# | Criterion | Verification |
|-----|-----------|--------------|
| **Phase 1: Generation** |
| 2.1 | Estimate page shows "Generate Estimate" button initially | Visual inspection |
| 2.2 | Clicking button triggers agent pipeline | Functional test |
| 2.3 | Progress bar shows current pipeline stage name | Visual inspection |
| 2.4 | Progress updates in real-time as pipeline progresses | Functional test |
| **Phase 2: Results** |
| 2.5 | After generation, page shows five tabs: Materials, Labor, Time, Price Comparison, Estimate vs Actual | Visual inspection |
| 2.6 | Materials tab shows MoneyView with BOM and pricing | Functional test |
| 2.7 | Labor tab shows labor breakdown from MoneyView | Functional test |
| 2.8 | Time tab shows **full CPM graph with nodes/edges** | Visual inspection |
| 2.9 | Time tab shows **full Gantt chart with dependencies** | Visual inspection |
| 2.10 | Price Comparison tab shows Home Depot vs Lowe's prices | Visual inspection |
| 2.11 | Price comparison uses real BOM materials (not mock data) | Verify Firestore data |
| 2.12 | Best price is highlighted with green badge | Visual inspection |
| 2.13 | Estimate vs Actual tab shows variance tracking | Visual inspection |
| 2.14 | Materials tab has "Actual Cost" column with editable values | Functional test |
| 2.15 | Variance is color-coded: green (under), red (over estimate) | Visual inspection |
| **PDF Export** |
| 2.16 | "Contractor Estimate" button generates full PDF | Download and verify sections |
| 2.17 | "Client Estimate" button generates simplified PDF | Download and verify sections |
| 2.18 | PDF generation shows loading state | Visual inspection |
| **Navigation** |
| 2.19 | Visual stepper shows Estimate as current step | Visual inspection |
| 2.20 | Clicking "Scope" in stepper returns to Scope page with data | Functional test |
| 2.21 | Clicking "Annotate" in stepper returns to Annotate page | Functional test |

### Technical Tasks

1. **Create EstimatePage.tsx with Two-Phase UI**
   ```typescript
   function EstimatePage() {
     const { id } = useParams();
     const [phase, setPhase] = useState<'generate' | 'results'>('generate');
     const [pipelineStage, setPipelineStage] = useState<string>('');
     const [progress, setProgress] = useState(0);
     const [activeTab, setActiveTab] = useState<'materials' | 'labor' | 'time' | 'priceComparison' | 'estimateVsActual'>('materials');
     const bom = useCanvasStore(state => state.billOfMaterials);

     // Check if estimate already exists
     useEffect(() => {
       if (bom && bom.materials.length > 0) {
         setPhase('results');
       }
     }, [bom]);

     const handleGenerateEstimate = async () => {
       // Subscribe to pipeline progress
       const unsubscribe = subscribeToPipelineProgress(id, (stage, pct) => {
         setPipelineStage(stage);
         setProgress(pct);
       });

       await triggerEstimatePipeline(id);
       unsubscribe();
       setPhase('results');
     };

     if (phase === 'generate') {
       return (
         <AuthenticatedLayout>
           <EstimateStepper currentStep="estimate" projectId={id} />
           <div className="generate-phase">
             {progress === 0 ? (
               <Button onClick={handleGenerateEstimate}>Generate Estimate</Button>
             ) : (
               <div className="progress-container">
                 <ProgressBar value={progress} />
                 <p className="stage-label">{pipelineStage}</p>
               </div>
             )}
           </div>
         </AuthenticatedLayout>
       );
     }

     return (
       <AuthenticatedLayout>
         <EstimateStepper currentStep="estimate" projectId={id} />

         <div className="tabs">
           <button onClick={() => setActiveTab('materials')}>Materials</button>
           <button onClick={() => setActiveTab('labor')}>Labor</button>
           <button onClick={() => setActiveTab('time')}>Time</button>
           <button onClick={() => setActiveTab('priceComparison')}>Price Comparison</button>
           <button onClick={() => setActiveTab('estimateVsActual')}>Estimate vs Actual</button>
         </div>

         {activeTab === 'materials' && <MoneyView mode="materials" />}
         {activeTab === 'labor' && <MoneyView mode="labor" />}
         {activeTab === 'time' && <TimeView />}
         {activeTab === 'priceComparison' && <PriceComparisonPanel projectId={id} />}
         {activeTab === 'estimateVsActual' && bom && <ComparisonView bom={bom} />}

         <div className="pdf-buttons">
           <Button onClick={handleContractorPDF}>Contractor Estimate</Button>
           <Button onClick={handleClientPDF}>Client Estimate</Button>
         </div>
       </AuthenticatedLayout>
     );
   }
   ```

   **Note:** The `ComparisonView` component already exists at `src/components/money/ComparisonView.tsx` and handles:
   - Empty state when no actual costs entered
   - Side-by-side estimate vs actual table
   - Variance calculation ($, %)
   - Color-coded variance severity (green=under, red=over)
   - Total variance summary in footer

2. **Modify MoneyView to support mode prop**
   - `mode="materials"` → Show BOM Table + Customer/Contractor/Comparison views
   - `mode="labor"` → Show Labor Analysis view

3. **Implement TimeView with FULL CPM + Gantt (REQUIRED)**
   - Use existing `cpmService.ts` for calculations
   - **Full CPM Graph:**
     - Tasks as nodes with dependencies as directed edges
     - Critical path highlighted in red
     - Non-critical tasks show float/slack values
     - Interactive: click task to see details
   - **Full Gantt Chart:**
     - Horizontal bar chart with task durations
     - Color-coded by trade/phase
     - Dependency arrows between related tasks
     - Milestones shown as diamonds
     - Today line indicator
   - Use recharts, vis.js, or d3 for visualization

4. **Integrate PDF generation from Epic 4**
   ```typescript
   const handleContractorPDF = async () => {
     setGenerating(true);
     const result = await generate_pdf(projectId, null, false); // client_ready=false
     window.open(result.pdf_url, '_blank');
     setGenerating(false);
   };

   const handleClientPDF = async () => {
     setGenerating(true);
     const result = await generate_pdf(projectId, null, true); // client_ready=true
     window.open(result.pdf_url, '_blank');
     setGenerating(false);
   };
   ```

5. **Update routes in App.tsx**
   - `/project/:id/estimate` → EstimatePage

6. **Connect stepper navigation**
   - On step click, navigate to appropriate route
   - Preserve project data in Firestore (already saved)

7. **Create PriceComparisonPanel component (separate tab)**
   - Refactor `PriceComparisonPage` into `PriceComparisonPanel` component
   - Accept `projectId` as prop (remove hardcoded mock)
   - Extract product names from real BOM (`billOfMaterials.materials.map(m => m.description)`)
   - Show as dedicated tab (not embedded in Materials tab)
   - Wire up real Firestore subscription for progress
   ```typescript
   // PriceComparisonPanel.tsx
   interface PriceComparisonPanelProps {
     projectId: string;
   }

   function PriceComparisonPanel({ projectId }: PriceComparisonPanelProps) {
     const bom = useCanvasStore(state => state.billOfMaterials);
     const productNames = bom?.materials.map(m => m.description) || [];

     const handleCompare = async () => {
       await startComparison(projectId, productNames, false);
     };

     return (
       <div>
         <Button onClick={handleCompare}>Compare Prices</Button>
         <PriceComparisonTable projectId={projectId} />
       </div>
     );
   }
   ```

### Files Modified

| File | Action | Changes |
|------|--------|---------|
| `src/pages/project/EstimatePage.tsx` | CREATE | Two-phase UI with 5 tabs |
| `src/components/estimate/PriceComparisonPanel.tsx` | CREATE | Refactored from PriceComparisonPage |
| `src/components/money/MoneyView.tsx` | MODIFY | Add mode prop |
| `src/components/time/TimeView.tsx` | MODIFY | Full CPM graph + Gantt chart |
| `src/services/pdfService.ts` | CREATE | Frontend wrapper for PDF Cloud Function |
| `src/services/pipelineService.ts` | CREATE | Pipeline trigger + progress subscription |
| `src/App.tsx` | MODIFY | Add estimate route |
| `src/pages/estimate/FinalView.tsx` | DELETE | Replaced by EstimatePage |
| `src/components/PriceComparisonPage.tsx` | DELETE | Replaced by PriceComparisonPanel |
| `src/components/PriceComparisonTable.tsx` | KEEP | Already working, no changes needed |
| `src/services/priceComparisonService.ts` | KEEP | Already working, no changes needed |

---

## TimeView Implementation Details (FULL IMPLEMENTATION REQUIRED)

### CPM Graph (Network Diagram)
- **Nodes:** Each task rendered as a box/circle containing:
  - Task name
  - Duration
  - Early Start (ES) / Early Finish (EF)
  - Late Start (LS) / Late Finish (LF)
  - Float/slack value
- **Edges:** Directed arrows showing dependencies (finish-to-start)
- **Critical Path:** Highlighted in red (tasks with zero float)
- **Non-Critical Tasks:** Highlighted differently (gray/blue), show float value
- **Interactive:** Click task node to see full task details in modal/tooltip
- **Layout:** Use force-directed or hierarchical layout algorithm

### Gantt Chart (Timeline View)
- **Horizontal bars:** Each task as a horizontal bar showing duration
- **X-axis:** Timeline (days/weeks)
- **Y-axis:** Task names grouped by trade/phase
- **Color-coding:** Different colors per trade (Electrical=yellow, Plumbing=blue, etc.)
- **Dependency arrows:** Curved or straight arrows connecting dependent tasks
- **Milestones:** Diamond shapes for milestone events
- **Today line:** Vertical red line showing current date
- **Critical path:** Critical tasks highlighted with red border/fill
- **Scrollable:** Both horizontal (time) and vertical (tasks) scrolling
- **Zoom:** Ability to zoom in/out on timeline

### Data Structure
```typescript
interface ScheduleTask {
  id: string;
  name: string;
  duration: number; // days
  dependencies: string[]; // task IDs
  trade: string;
  startDate?: Date;
  endDate?: Date;
  isCritical?: boolean;
  float?: number; // days of slack
}
```

---

## Test Strategy

### Unit Tests

| Test | File | Coverage |
|------|------|----------|
| EstimateStepper renders correctly | EstimateStepper.test.tsx | Component states |
| ScopePage saves project to Firestore | ScopePage.test.tsx | Persistence |
| TimeView calculates critical path | TimeView.test.tsx | CPM algorithm |
| PDF buttons call correct functions | EstimatePage.test.tsx | PDF generation |

### Integration Tests

| Test | Description |
|------|-------------|
| Full flow: Dashboard → Scope → Annotate → Estimate | E2E test |
| Project appears on dashboard after creation | Firestore integration |
| PDF downloads successfully | Cloud Function integration |
| Back navigation preserves data | State management |

### Manual Testing Checklist

- [ ] Create new project → verify in Firestore
- [ ] Navigate full flow → all pages load
- [ ] Click stepper → navigation works
- [ ] Generate Contractor PDF → downloads with all sections
- [ ] Generate Client PDF → downloads with limited sections
- [ ] Return to dashboard → project visible
- [ ] Open existing project → loads at current stage

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TimeView CPM/Gantt complexity | Medium | Medium | Start with simple task list, add visualization iteratively |
| PDF generation latency | Low | Low | Show loading spinner, use async |
| Stepper state sync | Medium | Low | Single source of truth in Firestore project.status |

---

## Dependencies

### External
- Epic 4: PDF Generator (`functions/services/pdf_generator.py`) ✅ Exists
- Epic 4: Monte Carlo (`functions/services/monte_carlo.py`) ✅ Exists
- Clarification Agent (Epic 2) ✅ Exists - runs in chatbot on Annotate page

### Internal
- `projectStore.ts` - createNewProject function ✅ Exists
- `MoneyView.tsx` - Component ✅ Exists
- `TimeView.tsx` - Placeholder exists, needs implementation
- `ComparisonView.tsx` - Estimate vs Actual comparison ✅ Exists (fully implemented)
- `varianceService.ts` - Variance calculations ✅ Exists (fully implemented)
- `BOMTable.tsx` - Has "Actual Cost" column with inline editing ✅ Exists

### Epic 5: Price Comparison - FULLY IMPLEMENTED
All backend/frontend code exists, just needs integration:

| Component | File | Status |
|-----------|------|--------|
| Cloud Function | `functions/src/priceComparison.ts` | ✅ Complete |
| Frontend Service | `src/services/priceComparisonService.ts` | ✅ Complete |
| UI Page | `src/components/PriceComparisonPage.tsx` | ✅ Complete (needs projectId prop) |
| UI Table | `src/components/PriceComparisonTable.tsx` | ✅ Complete |
| Types | `src/types/priceComparison.ts` | ✅ Complete |
| Product Cache | Firestore `productCache/{retailer}/products` | ✅ Complete |

**APIs Integrated:**
- Home Depot → Unwrangle API
- Lowe's → SerpApi Google Shopping
- LLM Matching → GPT-4o-mini

**What needs to happen:**
1. Remove hardcoded `MOCK_PROJECT_ID` from PriceComparisonPage
2. Refactor into `PriceComparisonPanel` component
3. Pass real `projectId` from EstimatePage
4. Extract product names from actual BOM instead of mock data
5. Show as separate "Price Comparison" tab in EstimatePage

---

## Acceptance Test Plan

### Story 1 Verification
1. Start app, click "New Project" on dashboard
2. Fill form: Name="Test Project", Location="Denver, CO"
3. Upload a test image/PDF
4. Fill Scope Definition
5. **Verify chatbot is NOT on Scope page**
6. Click "Continue to Annotate"
7. **Verify Annotate page loads with canvas and chatbot**
8. Interact with clarification agent (back-and-forth Q&A)
9. Wait for agent to signal "have all information"
10. **Verify "Generate Estimate" button appears**
11. Verify stepper shows Annotate as current
12. Click "Scope" in stepper
13. Verify returns to Scope with data preserved
14. Go to Dashboard
15. Verify "Test Project" appears in list

### Story 2 Verification
1. Continue from Story 1, navigate to Estimate page
2. **Phase 1: Verify "Generate Estimate" button is shown**
3. Click button → **verify progress bar appears with stage names**
4. Wait for generation to complete
5. **Phase 2: Verify five tabs: Materials, Labor, Time, Price Comparison, Estimate vs Actual**
6. Click Materials → verify MoneyView content
7. Click Labor → verify labor breakdown
8. Click Time → **verify full CPM graph with nodes/edges/critical path**
9. Click Time → **verify full Gantt chart with bars/dependencies/milestones**
10. Click Price Comparison → verify Home Depot vs Lowe's pricing
11. Click Estimate vs Actual → verify variance tracking
12. Click "Contractor Estimate" → verify PDF downloads with all sections
13. Click "Client Estimate" → verify PDF downloads with limited sections
14. Click "Annotate" in stepper → returns to canvas
15. Click "Scope" in stepper → returns to scope page

---

**Document Version:** 1.1
**Created:** 2025-12-11
**Updated:** 2025-12-11 - Corrected user flow per xvanov clarifications:
- Chatbot moved from Scope page to Annotate page
- Added two-phase EstimatePage (Generation → Results)
- Changed from 4 tabs to 5 tabs (Materials, Labor, Time, Price Comparison, Estimate vs Actual)
- Full CPM + Gantt required (not iterative)
- Price Comparison as separate tab (not embedded in Materials)
