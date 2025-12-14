# TrueCost - Epic Breakdown

**Author:** xvanov
**Date:** 2025-12-09
**Project Level:** Brownfield Pivot
**Target Scale:** 5 Parallel Developers

---

## Overview

This document provides the complete epic and story breakdown for TrueCost MVP, organized for **5 parallel developers** with zero overlap. Each developer owns one epic with maximum 4 stories.

**Team Structure:**
| Developer | Epic | Exclusive Ownership |
|-----------|------|---------------------|
| Dev 1 | UI/Frontend | `src/components/estimate/**`, `src/hooks/**`, `src/stores/useEstimateStore.ts`, `src/pages/Estimate.tsx` |
| Dev 2 | Deep Agent Pipeline | `functions/agents/location_agent.py`, `functions/agents/scope_agent.py`, `functions/agents/cost_agent.py`, `functions/agents/risk_agent.py`, `functions/agents/final_agent.py`, `functions/agents/orchestrator.py` |
| Dev 3 | User Input & Clarification | `functions/agents/clarification_agent.py`, `functions/services/cad_parser.py`, `functions/services/vision_service.py`, `functions/services/whisper_service.py`, `functions/services/storage_service.py` |
| Dev 4 | Data/PDF Services | `functions/services/cost_data_service.py`, `functions/services/monte_carlo.py`, `functions/services/pdf_generator.py`, `functions/templates/**` |
| Dev 5 | Stretch Goals | Enhancement features after MVP core |

**Handoff Architecture:**
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

**Interface Contract:** See [ClarificationOutput Schema](/docs/clarification-output-schema.md)

**Parallel Work Pattern:**
- Dev 1 builds UI with **mock data** - doesn't need agents working
- Dev 3 builds user input handling (CAD, voice, clarification) → produces `ClarificationOutput`
- Dev 2 builds deep agent pipeline → consumes `ClarificationOutput`
- Dev 4 builds data services to **defined interfaces** - independent of agents
- Dev 5 enhances after core is integrated

---

## Epics Summary

| Epic | Title | Stories | FRs Covered | Owner |
|------|-------|---------|-------------|-------|
| 1 | Frontend Experience | 4 | FR6-8, FR15-16, FR18, FR20-22, FR27-29, FR33-36, FR41, FR47, FR52-58, FR62, FR65-67, FR69-70, FR72 | Dev 1 |
| 2 | Deep Agent Pipeline | 5 | FR5, FR9, FR11, FR30-32, FR42-46, FR68, FR71, FR73-74, FR77 | Dev 2 |
| 3 | User Input & Clarification | 4 | FR12-14, FR17, FR19, FR23-26 | Dev 3 |
| 4 | Data Services & PDF Output | 4 | FR37-40, FR48-51, FR59-61, FR75 | Dev 4 |
| 5 | Stretch Goals | 5 | FR10, FR63-64, FR76, FR78 | Dev 5 |

---

## FR Coverage Map

| FR | Description | Epic | Story | Owner |
|----|-------------|------|-------|-------|
| FR5 | Create new estimate | 2 | 2.1 | Dev 2 |
| FR6 | View estimate list | 1 | 1.1 | Dev 1 |
| FR7 | Filter/sort estimates | 5 | 5.3 | Dev 5 |
| FR8 | Open existing estimate | 1 | 1.1 | Dev 1 |
| FR9 | Delete estimates | 2 | 2.1 | Dev 2 |
| FR10 | Duplicate estimate | 5 | 5.1 | Dev 5 |
| FR11 | Auto-save progress | 2 | 2.1 | Dev 2 |
| FR12-14 | CAD upload & parsing | 3 | 3.1, 3.2 | Dev 3 |
| FR15-16 | Display/correct measurements | 1 | 1.2 | Dev 1 |
| FR17 | Store CAD in Firebase Storage | 3 | 3.1 | Dev 3 |
| FR18 | Text input chatbox | 1 | 1.1 | Dev 1 |
| FR19 | Voice input | 3 | 3.3 | Dev 3 |
| FR20-22 | Voice feedback & transcription | 1 | 1.1 | Dev 1 |
| FR23-26 | Clarification Agent | 3 | 3.4 | **Dev 3** |
| FR27-28 | Review/modify project brief | 1 | 1.1 | Dev 1 |
| FR29 | Display CAD measurements | 1 | 1.2 | Dev 1 |
| FR30-32 | Scope Agent (BoQ) | 2 | 2.2 | Dev 2 |
| FR33-36 | Plan section UI | 1 | 1.2 | Dev 1 |
| FR37-40 | Location intelligence | 4 | 4.1 | Dev 4 |
| FR41 | Override location params | 1 | 1.2 | Dev 1 |
| FR42-46 | Cost Agent | 2 | 2.3 | Dev 2 |
| FR47 | Adjust margins | 1 | 1.3 | Dev 1 |
| FR48-51 | Risk/Monte Carlo | 4 | 4.2 | Dev 4 |
| FR52-58 | Final estimate UI | 1 | 1.3 | Dev 1 |
| FR59-61 | PDF generation | 4 | 4.3 | Dev 4 |
| FR62 | Download PDF | 1 | 1.3 | Dev 1 |
| FR63-64 | PDF customization | 5 | 5.2 | Dev 5 |
| FR65-67 | Pipeline visibility | 1 | 1.4 | Dev 1 |
| FR68 | Agent failure handling | 2 | 2.5 | Dev 2 |
| FR69-70 | Feedback input/variance | 1 | 1.4 | Dev 1 |
| FR71, FR73 | Feedback processing | 2 | 2.5 | Dev 2 |
| FR72 | Accuracy metrics | 1 | 1.4 | Dev 1 |
| FR74 | Firestore persistence | 2 | 2.1 | Dev 2 |
| FR75 | Firebase Storage | 4 | 4.3 | Dev 4 |
| FR76 | JSON export | 5 | 5.4 | Dev 5 |
| FR77-78 | Version history | 5 | 5.4 | Dev 5 |

---

## Epic 1: Frontend Experience

**Owner:** Dev 1
**Goal:** Build the complete TrueCost UI with three sections (Input → Plan → Final Estimate), real-time pipeline visibility, and feedback capture. Works with mock data initially.

**Exclusive Files:**
- `src/components/estimate/**`
- `src/hooks/useEstimate.ts`, `usePipelineStatus.ts`, `useVoiceInput.ts`, `useCadUpload.ts`
- `src/stores/useEstimateStore.ts`
- `src/services/estimateService.ts`, `pipelineService.ts`
- `src/types/estimate.ts`, `agent.ts`, `costData.ts`
- `src/pages/Estimate.tsx`

---

### Story 1.1: Input Section & Dashboard

As a **contractor**,
I want to **create estimates via text/voice input and upload CAD plans**,
So that **I can quickly start the estimation process**.

**Acceptance Criteria:**

**Given** I am on the dashboard
**When** I click "New Estimate"
**Then** I see the Input section with chatbox and CAD upload area

**Given** I am in the Input section
**When** I type a project description in the chatbox
**Then** the text is captured and displayed in the conversation

**Given** I am in the Input section
**When** I click the voice input button and speak
**Then** I see visual feedback (recording indicator), transcription appears, and I can edit it before sending

**Given** I have uploaded a CAD file and described my project
**When** the Clarification Agent asks follow-up questions
**Then** I see the questions in the chat and can respond

**Given** clarification is complete
**When** I review the extracted project brief
**Then** I can see all extracted data and proceed to Plan or go back to modify

**And** dashboard shows my estimate list with status indicators (draft, processing, complete)
**And** I can open any existing estimate to view/continue

**Prerequisites:** None (first story)

**Technical Notes:**
- Use Zustand for `useEstimateStore` - estimate state, conversation history
- `useCadUpload` hook for file upload to Firebase Storage (mock for now)
- `useVoiceInput` hook wrapping Web Speech API
- `ChatInterface.tsx` for conversation with agent
- `CadUploader.tsx` with drag-drop, file type validation
- `ProjectBriefPreview.tsx` for extracted data review
- Mock agent responses initially - will connect to real API later

**FRs Covered:** FR6, FR8, FR18, FR20-22, FR27-28

**Verification Checklist:**
- [ ] Navigate to `/` dashboard - estimate list loads within 2 seconds
- [ ] Verify dashboard shows status indicators (draft, processing, complete) for any existing estimates
- [ ] Click "New Estimate" button - Input section appears with chatbox and CAD upload area
- [ ] Type "Kitchen remodel in Denver, 200 sqft" in chatbox - text appears in conversation thread
- [ ] Click voice input button - red recording indicator appears
- [ ] Speak for 3-5 seconds - recording indicator pulses during speech
- [ ] Stop speaking - transcription appears within 3 seconds
- [ ] Verify transcribed text is editable before sending
- [ ] Upload a test PDF file (kitchen_plan.pdf) - file name displayed, upload progress shown
- [ ] Verify file type validation rejects `.exe` files with error message
- [ ] After upload + description, verify Clarification Agent responds with questions in chat
- [ ] Answer agent questions - verify responses are captured and agent acknowledges
- [ ] When clarification complete, verify Project Brief Preview shows: location, project type, sqft, finishes
- [ ] Click "Proceed to Plan" - navigates to Plan section
- [ ] Click "Go Back" - returns to Input section with data preserved
- [ ] **Firestore Check:** `/estimates/{id}` document exists with `status: "draft"` or `"clarifying"`
- [ ] **Firestore Check:** `/estimates/{id}/conversations` subcollection contains chat messages
- [ ] Open an existing estimate from dashboard - estimate loads with previous data intact

---

### Story 1.2: Plan Section

As a **contractor**,
I want to **review extracted CAD data and scope breakdown**,
So that **I can verify and adjust before final estimate generation**.

**Acceptance Criteria:**

**Given** I have completed the Input section
**When** I navigate to the Plan section
**Then** I see extracted measurements from CAD displayed in a table/visual

**Given** I see extracted measurements
**When** I notice an incorrect dimension
**Then** I can click to edit and correct it

**Given** I am in the Plan section
**When** scope breakdown is generated
**Then** I see Bill of Quantities organized by CSI division

**Given** I am viewing the scope breakdown
**When** I want to modify quantities
**Then** I can manually adjust any line item

**Given** I want to discuss with the agent
**When** I type in the chat
**Then** I can request modifications and see agent responses

**Given** location data is auto-detected
**When** I want to override
**Then** I can change zip code, union/non-union, and other location params

**Given** I am satisfied with the plan
**When** I click "Generate Estimate"
**Then** I proceed to Final Estimate section

**Prerequisites:** Story 1.1

**Technical Notes:**
- `CadDataReview.tsx` - table of rooms, walls, areas with edit capability
- `ScopeBreakdown.tsx` - expandable CSI divisions with line items
- `AgentAnalysis.tsx` - continued chat with agent for modifications
- Location override controls (zip code input, union toggle)
- Store updates via `useEstimateStore`

**FRs Covered:** FR15-16, FR29, FR33-36, FR41

**Verification Checklist:**
- [ ] Complete Input section and navigate to Plan - Plan section loads with CAD data
- [ ] Verify extracted measurements table shows: rooms, walls, areas with dimensions
- [ ] Click on a dimension value (e.g., "12 ft") - inline edit mode activates
- [ ] Change dimension from "12 ft" to "14 ft" - value updates and shows "edited" indicator
- [ ] Verify Bill of Quantities displays organized by CSI division headers (03, 06, 09, etc.)
- [ ] Expand a CSI division - line items appear with quantity, unit, description
- [ ] Click on a quantity field - can manually adjust the value
- [ ] Add a new line item via "Add Item" button - new row appears
- [ ] Delete a line item via trash icon - item removed with confirmation
- [ ] Type in agent chat: "Add insulation to scope" - agent responds with confirmation
- [ ] Verify location section shows auto-detected zip code and union status
- [ ] Change zip code from "80202" to "90210" - location factors update
- [ ] Toggle union/non-union switch - labor rates section reflects change
- [ ] Click "Generate Estimate" button - navigates to Final Estimate section
- [ ] Click "Back to Input" - returns to Input section with all data preserved
- [ ] **Firestore Check:** `/estimates/{id}` document shows updated `extractedData` with edited values
- [ ] **Firestore Check:** `billOfQuantities` field contains CSI-organized line items

---

### Story 1.3: Final Estimate Section

As a **contractor**,
I want to **view, modify, and download my complete estimate**,
So that **I can present professional estimates to clients**.

**Acceptance Criteria:**

**Given** I am in the Final Estimate section
**When** the estimate is ready
**Then** I see summary card with total cost, timeline, and confidence range (P50/P80/P90)

**Given** I am viewing the estimate
**When** I want to see details
**Then** I can expand sections for cost breakdown, BoQ, labor analysis, schedule, risk assessment

**Given** I see a line item I want to modify
**When** I edit quantity, unit cost, or description
**Then** the system recalculates totals automatically

**Given** I want to add context
**When** I click on a line item
**Then** I can add notes/comments

**Given** I want to adjust margins
**When** I change overhead or profit percentage
**Then** totals recalculate

**Given** I want to see the timeline
**When** I view schedule section
**Then** I see Gantt chart or task list with dependencies

**Given** I want to understand risk
**When** I view risk section
**Then** I see probability distribution chart, top risks, and recommended contingency

**Given** I am satisfied with the estimate
**When** I click "Download PDF"
**Then** PDF is generated and downloaded

**Prerequisites:** Story 1.2

**Technical Notes:**
- `EstimateSummary.tsx` - hero card with key metrics
- `CostBreakdown.tsx` - expandable by CSI division, editable line items
- `RiskAnalysis.tsx` - probability chart (use Recharts), risk table
- `PdfExport.tsx` - trigger Cloud Function, show download link
- Timeline component - simple Gantt or task list view
- All edits update store and trigger recalculation

**FRs Covered:** FR47, FR52-58, FR62

**Verification Checklist:**
- [ ] Complete Plan section and navigate to Final Estimate - estimate loads with summary card
- [ ] Verify summary card shows: total cost (e.g., "$85,000"), timeline (e.g., "6 weeks"), confidence range (P50/P80/P90)
- [ ] Verify P50, P80, P90 values are displayed (e.g., "$78K / $85K / $92K")
- [ ] Click "Cost Breakdown" section - expands to show CSI division breakdown
- [ ] Verify each division shows: material cost, labor cost, equipment cost, subtotal
- [ ] Click on a line item quantity - can edit inline
- [ ] Change quantity from "100 sqft" to "120 sqft" - totals recalculate automatically within 1 second
- [ ] Click on unit cost field - can edit the rate
- [ ] Click "Add Note" on a line item - note input appears, save note, verify note icon shows
- [ ] Locate overhead/profit margin controls - change from 15% to 20%
- [ ] Verify grand total updates after margin change
- [ ] Click "Schedule" section - Gantt chart or task list appears
- [ ] Verify tasks show dependencies (arrows or indentation)
- [ ] Click "Risk Analysis" section - probability distribution chart appears
- [ ] Verify top 5 risks are listed with impact amounts
- [ ] Verify recommended contingency percentage is displayed
- [ ] Click "Download PDF" button - PDF generation starts, download completes within 10 seconds
- [ ] Open downloaded PDF - verify it contains: Executive Summary, Cost Breakdown, Schedule, Risk sections
- [ ] **Edge Case:** Edit a line item then download PDF - PDF reflects the edited values

---

### Story 1.4: Pipeline Visibility & Feedback

As a **contractor**,
I want to **see agent pipeline progress and submit actual costs after project completion**,
So that **I trust the system and help improve accuracy**.

**Acceptance Criteria:**

**Given** estimate generation is in progress
**When** agents are processing
**Then** I see pipeline progress showing which agent is active and which are complete

**Given** an agent is processing
**When** it completes
**Then** I see its status update in real-time and can view intermediate output

**Given** pipeline is running
**When** I click on a completed agent
**Then** I can view its output summary (e.g., "Location Agent: Denver, CO - Union market, high permit costs")

**Given** my project is complete
**When** I open a past estimate
**Then** I see "Add Actual Costs" button

**Given** I click "Add Actual Costs"
**When** I enter actual project costs
**Then** system calculates and displays variance analysis (estimate vs actual)

**Given** I have submitted actuals
**When** I view my profile/dashboard
**Then** I can see my historical accuracy metrics (MAPE)

**Prerequisites:** Story 1.3

**Technical Notes:**
- `PipelineProgress.tsx` - vertical stepper showing 7 agents
- `AgentCard.tsx` - individual agent status with expandable output
- Use Firestore `onSnapshot` listeners for real-time updates
- `usePipelineStatus.ts` hook for subscribing to `/estimates/{id}/agentOutputs`
- Feedback form for actual costs
- Variance display component

**FRs Covered:** FR65-67, FR69-70, FR72

**Verification Checklist:**
- [ ] Start a new estimate and trigger pipeline - pipeline progress component appears
- [ ] Verify 7 agents are shown in vertical stepper: Clarification, CAD Analysis, Location, Scope, Cost, Risk, Final
- [ ] Verify first agent (Clarification) shows "running" status with spinner/animation
- [ ] Wait for Clarification agent to complete - status changes to "completed" with checkmark
- [ ] Verify next agent (CAD Analysis) automatically starts - shows "running"
- [ ] Click on completed "Clarification" agent card - expands to show output summary
- [ ] Verify output summary shows extracted data (e.g., "Project: Kitchen remodel, Denver CO, 200 sqft")
- [ ] Wait for all 7 agents to complete (< 5 minutes total) - all show "completed"
- [ ] Verify estimate status changes to "complete" when pipeline finishes
- [ ] **Real-time Test:** Open same estimate in two browser tabs - both show synchronized pipeline progress
- [ ] Navigate to dashboard, open a completed estimate - "Add Actual Costs" button visible
- [ ] Click "Add Actual Costs" - form appears with fields for actual total, breakdown by category
- [ ] Enter actual cost "$82,000" and submit - variance analysis displays
- [ ] Verify variance shows: estimated vs actual, percentage difference, categorization
- [ ] Navigate to profile/dashboard - historical MAPE accuracy metric displayed
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/` subcollection has 7 documents
- [ ] **Firestore Check:** Each agent document has: status, output, duration, tokensUsed
- [ ] **Edge Case:** Simulate agent failure (mock) - error state shown, retry button appears

---

## Epic 2: Deep Agent Pipeline

**Owner:** Dev 2
**Goal:** Build the deep agent pipeline that transforms a `ClarificationOutput` into a complete cost estimate. This pipeline consumes the output from Dev 3's Clarification Agent and runs: Location → Scope → Cost → Risk → Final agents.

**Input Contract:** `ClarificationOutput` v3.0.0 (see [schema](/docs/clarification-output-schema.md))

**Exclusive Files:**
- `functions/agents/orchestrator.py`
- `functions/agents/location_agent.py`
- `functions/agents/scope_agent.py`
- `functions/agents/cost_agent.py`
- `functions/agents/risk_agent.py`
- `functions/agents/final_agent.py`
- `functions/main.py` (shared with Dev 3 for entry points)
- `functions/config/**`
- Firestore schema design and rules

---

### Story 2.1: Pipeline Foundation & Orchestrator

As a **system**,
I want to **create the pipeline infrastructure that consumes ClarificationOutput**,
So that **deep agents can be plugged in and executed in sequence**.

**Acceptance Criteria:**

**Given** Dev 3's Clarification Agent produces a `ClarificationOutput`
**When** I receive the validated output
**Then** I start the deep agent pipeline with status "processing"

**Given** the orchestrator is configured
**When** I define DEEP_AGENT_SEQUENCE
**Then** it contains 5 agents in correct order: location → scope → cost → risk → final

**Given** agents are processing
**When** each agent completes a step
**Then** I write agent output to `/agentOutputs/{agentName}` and update `pipelineStatus`

**Given** a user calls `delete_estimate`
**When** I receive estimate ID
**Then** I delete estimate and all subcollections

**Given** `ClarificationOutput` validation fails
**When** required fields are missing or schema version mismatches
**Then** I reject the input and return validation errors

**Prerequisites:** None (first story for Dev 2)

**Technical Notes:**
- `functions/main.py` - Cloud Function entry points: `start_deep_pipeline`, `delete_estimate`
- `functions/agents/orchestrator.py` - pipeline runner with DEEP_AGENT_SEQUENCE
- `functions/services/firestore_service.py` - Firestore CRUD helpers
- Validate incoming `ClarificationOutput` against schema v3.0.0
- Status enum: processing → plan_review → final → exported
- Create base `Agent` class that all deep agents inherit from
- Input: `ClarificationOutput` with full CSI scope, CAD data, and project brief

**FRs Covered:** FR5, FR9, FR11, FR74

**Verification Checklist:**
- [ ] **Deploy Test:** `firebase deploy --only functions` completes without errors
- [ ] **Emulator Test:** `firebase emulators:start` - functions emulator starts on port 5001
- [ ] Call `start_deep_pipeline` with valid `ClarificationOutput` JSON
- [ ] Verify response: `{success: true, data: {estimateId: "xxx", status: "processing"}}`
- [ ] **Firestore Check:** `/estimates/{estimateId}` document updated with `clarificationOutput` field
- [ ] **Firestore Check:** Document has `status: "processing"`
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/` subcollection initialized
- [ ] Verify `pipelineStatus` field shows: `{currentAgent: "location", completedAgents: [], progress: 0}`
- [ ] Verify DEEP_AGENT_SEQUENCE contains 5 agents: location, scope, cost, risk, final
- [ ] **Schema Validation Test:** Send `ClarificationOutput` missing required CSI divisions - returns validation error
- [ ] **Schema Validation Test:** Send `ClarificationOutput` with wrong schemaVersion - returns error
- [ ] **Schema Validation Test:** Send valid `ClarificationOutput` - passes validation
- [ ] Call `delete_estimate` with valid estimateId - returns `{success: true}`
- [ ] **Firestore Check:** Estimate document deleted
- [ ] **Firestore Check:** All subcollections (agentOutputs, conversations) also deleted
- [ ] **Error Case:** Call `start_deep_pipeline` with missing `ClarificationOutput` - returns appropriate error
- [ ] **Console Check:** Cloud Logging shows structured logs for each operation

---

### Story 2.2: Location Intelligence Agent

As a **system**,
I want to **gather location-specific cost factors**,
So that **estimates are adjusted for regional variations**.

**Acceptance Criteria:**

**Given** project brief contains a location/zip code
**When** Location Agent runs
**Then** it calls location service with the zip code

**Given** location service returns data
**When** I process the response
**Then** I extract labor rates, permit costs, weather factors, union status

**Given** location data is retrieved
**When** I store the results
**Then** `locationFactors` object is saved with all cost adjustment data

**Given** location lookup fails
**When** zip code is not found
**Then** I use regional defaults and flag for user review

**Given** location analysis is complete
**When** outputs are saved to Firestore
**Then** pipeline proceeds to Scope Agent

**Prerequisites:** Story 2.1

**Technical Notes:**
- `functions/agents/location_agent.py` - calls `cost_data_service.get_location_factors()`
- Location factors schema: `{laborRates: {}, isUnion: bool, permitCosts: {}, weatherFactors: {}, regionCode}`
- **Input:** Reads `projectBrief.location.zipCode` from `ClarificationOutput`
- Handle missing zip codes gracefully with regional fallbacks
- Cache location data to reduce API calls

**FRs Covered:** FR37-40 (agent side)

**Verification Checklist:**
- [ ] Pipeline reaches Location Agent as first agent after receiving `ClarificationOutput`
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/location` shows `status: "running"`
- [ ] Verify agent calls `cost_data_service.get_location_factors("80202")` for Denver zip
- [ ] **Mock Service Test:** Mock returns labor rates, union status, permit costs - agent processes
- [ ] **Firestore Check:** `/estimates/{id}` has `locationFactors` field populated
- [ ] Verify `locationFactors` contains: `{laborRates: {...}, isUnion: bool, permitCosts: {...}, weatherFactors: {...}}`
- [ ] Verify `laborRates` has rates for: electrician, plumber, carpenter, general labor
- [ ] Verify `isUnion` boolean reflects market (Denver = mixed market)
- [ ] Verify `permitCosts` has estimated permit percentage or fixed amount
- [ ] Verify `weatherFactors` has seasonal construction impact data
- [ ] **Unknown Zip Test:** Use zip "00000" - agent uses regional defaults and sets `needsReview: true`
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/location` shows `status: "completed"`
- [ ] Verify `agentOutputs/location` document has summary field with human-readable description
- [ ] Verify pipeline proceeds to Scope Agent
- [ ] **Console Check:** Logs show location lookup duration and data source

---

### Story 2.3: Construction Scope Agent

As a **system**,
I want to **refine the Bill of Quantities from ClarificationOutput with cost database lookups**,
So that **all materials and labor can be accurately costed**.

**Acceptance Criteria:**

**Given** `ClarificationOutput.csiScope` contains initial scope breakdown
**When** Scope Agent runs
**Then** it validates and enriches the BoQ with cost database item codes

**Given** CAD measurements exist in `ClarificationOutput.cadData`
**When** I validate quantities
**Then** I verify material quantities match spatial data (e.g., sqft of drywall matches room areas)

**Given** CSI divisions are marked as included
**When** I process each division
**Then** I map line items to cost database entries with unit costs

**Given** BoQ is validated
**When** I check completeness
**Then** all required divisions for the project type are included per the schema

**Given** scope analysis is complete
**When** outputs are saved to Firestore
**Then** enriched `billOfQuantities` is stored and pipeline proceeds to Cost Agent

**Prerequisites:** Story 2.2

**Technical Notes:**
- `functions/agents/scope_agent.py` - CSI MasterFormat BoQ enrichment
- **Input:** Reads `csiScope` from `ClarificationOutput` (already has 24 divisions)
- BoQ schema: `{divisions: [{code, name, lineItems: [{item, quantity, unit, description, costCode}]}]}`
- Map line items to RSMeans-style cost codes
- Validate quantities against `cadData.spaceModel` measurements
- Flag discrepancies between user-stated quantities and CAD-extracted quantities

**FRs Covered:** FR30-32

**Verification Checklist:**
- [ ] Pipeline reaches Scope Agent after Location completes
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/scope` shows `status: "running"`
- [ ] Verify agent reads `csiScope` from `ClarificationOutput` and enriches with cost codes
- [ ] **Firestore Check:** `/estimates/{id}` has `billOfQuantities` field populated
- [ ] Verify `billOfQuantities.divisions` is an array of CSI divisions
- [ ] Verify kitchen remodel includes divisions: 06 (Wood), 09 (Finishes), 22 (Plumbing), 26 (Electrical)
- [ ] Expand Division 09 (Finishes) - contains line items for drywall, paint, flooring, tile
- [ ] Verify each line item has: `{item, quantity, unit, description}`
- [ ] **Quantity Derivation Test:** 200 sqft kitchen should show ~200 sqft drywall, ~40 LF base trim
- [ ] Verify agent selects "mid-range" materials based on `projectBrief.finishes`
- [ ] **Completeness Test:** BoQ includes all divisions needed for kitchen remodel
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/scope` shows `status: "completed"`
- [ ] Verify `agentOutputs/scope` has `output` field with full BoQ structure
- [ ] Verify pipeline proceeds to Cost Agent
- [ ] **Project Type Test:** Bathroom remodel generates different division mix than kitchen
- [ ] **Console Check:** Logs show quantity calculations and material selections

---

### Story 2.4: Cost Estimation Agent

As a **system**,
I want to **calculate material, labor, and equipment costs**,
So that **a detailed cost estimate is produced**.

**Acceptance Criteria:**

**Given** enriched Bill of Quantities exists from Scope Agent
**When** Cost Agent runs
**Then** it retrieves unit costs for each line item from cost database

**Given** unit costs are retrieved
**When** I calculate material costs
**Then** total = quantity × unit cost for each item

**Given** labor rates are available from Location Agent output
**When** I calculate labor costs
**Then** I compute man-hours × labor rates by trade

**Given** equipment is required
**When** I calculate equipment costs
**Then** I add rental/usage costs for required equipment

**Given** all costs are calculated
**When** I apply adjustments
**Then** location factors and overhead/profit margins are applied

**Given** cost estimation is complete
**When** outputs are saved to Firestore
**Then** `costEstimate` is stored and pipeline proceeds to Risk Agent

**Prerequisites:** Story 2.3

**Technical Notes:**
- `functions/agents/cost_agent.py` - cost calculations using mock RSMeans data
- Cost estimate schema: `{materials: {}, labor: {}, equipment: {}, subtotals: {}, adjustments: {}, total}`
- Apply location adjustment factors from Location Agent
- Support configurable overhead and profit margins
- Track cost confidence based on data source quality

**FRs Covered:** FR42-46

**Verification Checklist:**
- [ ] Pipeline reaches Cost Agent after Scope completes
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/cost` shows `status: "running"`
- [ ] Verify agent retrieves unit costs for each BoQ line item
- [ ] **Mock Data Test:** Mock returns unit costs from RSMeans-schema data - agent processes
- [ ] **Firestore Check:** `/estimates/{id}` has `costEstimate` field populated
- [ ] Verify `costEstimate` contains: `{materials: {...}, labor: {...}, equipment: {...}}`
- [ ] Verify material costs = quantity × unit cost for each line item
- [ ] Verify labor costs calculated using `locationFactors.laborRates` × man-hours
- [ ] Verify equipment costs included for items requiring rentals (e.g., scaffolding)
- [ ] Verify `costEstimate.subtotals` shows: materials total, labor total, equipment total
- [ ] Verify `costEstimate.adjustments` shows location adjustment factor applied
- [ ] **Margin Test:** Overhead (10%) and profit (10%) applied to subtotal
- [ ] Verify `costEstimate.total` = subtotals + adjustments + overhead + profit
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/cost` shows `status: "completed"`
- [ ] Verify `agentOutputs/cost` has confidence score based on data quality
- [ ] Verify pipeline proceeds to Risk Agent
- [ ] **Console Check:** Logs show cost calculation breakdown and data sources

---

### Story 2.5: Risk Analysis & Final Estimator Agent

As a **system**,
I want to **assess estimation uncertainty and synthesize all outputs into a final estimate**,
So that **contractors get a complete, professional estimate with confidence ranges**.

**Acceptance Criteria:**

**Given** cost estimate is complete
**When** Risk Agent runs
**Then** it calls Monte Carlo service with cost line items and uncertainty ranges

**Given** Monte Carlo simulation runs
**When** 1000+ iterations complete
**Then** I receive P50, P80, P90 percentile values

**Given** percentiles are calculated
**When** I analyze the distribution
**Then** I recommend a contingency percentage based on P80-P50 spread

**Given** simulation includes sensitivity analysis
**When** I identify top contributors
**Then** I list top 5 risk factors driving cost uncertainty

**Given** risk analysis is complete
**When** Final Agent runs
**Then** it aggregates outputs from all preceding agents into `finalEstimate`

**Given** all data is aggregated
**When** I generate the executive summary
**Then** I create a concise overview with total cost, timeline, and confidence range

**Given** final estimate is complete
**When** outputs are saved to Firestore
**Then** `finalEstimate` is stored and estimate status becomes "complete"

**Prerequisites:** Story 2.4

**Technical Notes:**
- `functions/agents/risk_agent.py` - calls `monte_carlo.run_simulation()`
- `functions/agents/final_agent.py` - synthesis and summary generation
- Risk analysis schema: `{p50, p80, p90, recommendedContingency, topRisks: [], distribution: []}`
- Final estimate schema: `{summary: {}, timeline: {}, breakdown: {}, recommendations: []}`
- Generate executive summary with key metrics
- Create timeline with task dependencies
- Prepare data structure optimized for PDF generation
- Handle error states and partial completions gracefully

**FRs Covered:** FR48-51, FR53 (data), FR68, FR71, FR73, FR77

**Verification Checklist:**
- [ ] Pipeline reaches Risk Agent after Cost completes
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/risk` shows `status: "running"`
- [ ] Verify agent calls `monte_carlo.run_simulation()` with cost line items
- [ ] **Mock Service Test:** Mock returns P50/P80/P90 values - agent processes correctly
- [ ] **Firestore Check:** `/estimates/{id}` has `riskAnalysis` field populated
- [ ] Verify `riskAnalysis` contains: `{p50, p80, p90, recommendedContingency, topRisks: []}`
- [ ] Verify P50 < P80 < P90 (valid percentile order)
- [ ] Verify P50 is close to `costEstimate.total` (within 10%)
- [ ] Verify `recommendedContingency` percentage is derived from P80-P50 spread
- [ ] **Example:** If P50=$80K, P80=$88K → contingency ~10%
- [ ] Verify `topRisks` array has 5 items with: `{item, impact, probability}`
- [ ] Verify top risks are sorted by impact (highest first)
- [ ] Verify `riskAnalysis.distribution` has histogram data for charting
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/risk` shows `status: "completed"`
- [ ] Verify `agentOutputs/risk` has narrative summary for report
- [ ] **Final Agent:** Pipeline proceeds to Final Agent after Risk completes
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/final` shows `status: "running"`
- [ ] Verify agent aggregates outputs from all preceding agents (Location, Scope, Cost, Risk)
- [ ] **Firestore Check:** `/estimates/{id}` has `finalEstimate` field populated
- [ ] Verify `finalEstimate.summary` contains: total, timeline, confidenceRange
- [ ] Verify summary total matches `costEstimate.total` + recommended contingency
- [ ] Verify `finalEstimate.timeline` has: totalDuration, tasks[], criticalPath[]
- [ ] Verify `finalEstimate.breakdown` mirrors `costEstimate` structure
- [ ] **Firestore Check:** `/estimates/{id}` status changes to "complete"
- [ ] **Firestore Check:** All 5 deep agent outputs marked completed in `agentOutputs` subcollection
- [ ] **Pipeline Duration Test:** Total deep pipeline time < 3 minutes for standard project
- [ ] **Error Handling Test:** Simulate agent failure mid-pipeline - estimate shows partial results
- [ ] **Console Check:** Logs show final synthesis and estimate completion event

---

## Epic 3: User Input & Clarification

**Owner:** Dev 3
**Goal:** Handle all user input (CAD upload, voice, text) and run the Clarification Agent to produce a validated `ClarificationOutput` artifact. This output is the handoff to Dev 2's Deep Agent Pipeline.

**Output Contract:** `ClarificationOutput` v3.0.0 (see [schema](/docs/clarification-output-schema.md))

**Exclusive Files:**
- `functions/agents/clarification_agent.py`
- `functions/services/cad_parser.py`
- `functions/services/vision_service.py`
- `functions/services/whisper_service.py`
- `functions/services/storage_service.py`
- `functions/main.py` (shared with Dev 2 - owns `start_estimate`, `send_clarification_message`)

---

### Story 3.1: CAD File Upload & DWG Parsing

As a **system**,
I want to **accept CAD file uploads and extract measurements from DWG/DXF files**,
So that **quantities can be automatically calculated**.

**Acceptance Criteria:**

**Given** a user uploads a CAD file
**When** file is received
**Then** I validate file type (PDF, DWG, DXF, PNG, JPG) and store in Firebase Storage

**Given** a DWG or DXF file is uploaded
**When** I process with ezdxf
**Then** I extract all entities: lines, polylines, circles, text annotations

**Given** entities are extracted
**When** I analyze the drawing
**Then** I identify rooms, walls, areas with dimensions

**Given** extraction completes
**When** I return results
**Then** output is structured JSON: `{rooms: [], walls: [], areas: [], scale: {...}}`

**Given** extraction has ambiguities
**When** scale is unclear or entities are unlabeled
**Then** I flag items for user verification

**Prerequisites:** None (independent service)

**Technical Notes:**
- `storage_service.py` - Firebase Storage upload helper
- `cad_parser.py` with `extract(file_url, file_type)` function
- Use ezdxf library for DWG/DXF programmatic parsing
- Return structured `ExtractionResult` dataclass
- Handle coordinate systems and unit conversion
- Log extraction confidence scores

**FRs Covered:** FR12-14, FR17

**Verification Checklist:**
- [ ] **Unit Test:** Call `storage_service.upload(file_bytes, "test.dwg")` - returns Firebase Storage URL
- [ ] **File Validation Test:** Upload .dwg file - accepted
- [ ] **File Validation Test:** Upload .dxf file - accepted
- [ ] **File Validation Test:** Upload .pdf file - accepted
- [ ] **File Validation Test:** Upload .exe file - rejected with validation error
- [ ] **Firebase Storage Check:** Uploaded file exists at `gs://bucket/cad/{estimateId}/filename`
- [ ] **Unit Test:** Call `cad_parser.extract(file_url, "dwg")` with sample DWG file
- [ ] Verify ezdxf processes file without errors
- [ ] Verify response contains: `{rooms: [], walls: [], areas: [], scale: {...}, confidence: float}`
- [ ] **Sample DWG Test:** kitchen_plan.dwg returns rooms with "Kitchen" label
- [ ] **Sample DWG Test:** walls array contains wall objects with `length` in feet
- [ ] **Sample DWG Test:** areas array shows calculated square footages
- [ ] **Scale Detection Test:** Drawing with 1/4"=1' scale - `scale.ratio` = 48
- [ ] **Entity Extraction Test:** Verify lines, polylines, circles extracted from test file
- [ ] **Text Annotation Test:** Room labels from DWG text entities appear in output
- [ ] **Ambiguity Test:** Unlabeled room - flagged with `needsVerification: true`
- [ ] **Unlabeled Scale Test:** No scale annotation - `scale.detected: false`, flagged for review
- [ ] **Error Test:** Corrupted DWG file - returns error response, doesn't crash
- [ ] **Console Check:** Logs show entity counts and extraction duration

---

### Story 3.2: Vision-Based CAD Extraction

As a **system**,
I want to **extract measurements from PDF and image-based plans using GPT-4o Vision**,
So that **any plan format can be processed**.

**Acceptance Criteria:**

**Given** a PDF or image CAD file is uploaded
**When** I process with Vision API
**Then** I send image to GPT-4o with structured extraction prompt

**Given** GPT-4o analyzes the image
**When** response is received
**Then** I parse extracted measurements, room labels, and annotations

**Given** Vision extraction completes
**When** results are uncertain
**Then** I include confidence scores and flag low-confidence items

**Given** extraction completes
**When** I return results
**Then** output matches same schema as programmatic extraction

**Given** PDF has multiple pages
**When** I process the file
**Then** I handle each page and combine results

**Prerequisites:** Story 3.1

**Technical Notes:**
- `vision_service.py` with `extract_with_vision(file_url)` function
- Use OpenAI GPT-4o (gpt-4o) with vision capabilities
- Structured prompt for construction plan extraction
- Convert PDF pages to images if needed
- Same output schema as ezdxf extraction for consistency
- Include `confidence` field in output

**FRs Covered:** FR13-14

**Verification Checklist:**
- [ ] **Unit Test:** Call `vision_service.extract_with_vision(pdf_url)` with sample PDF
- [ ] Verify OpenAI API called with gpt-4o model and image content
- [ ] Verify response contains same schema as ezdxf: `{rooms: [], walls: [], areas: [], scale: {...}}`
- [ ] **PDF Test:** floor_plan.pdf returns room dimensions matching visual inspection
- [ ] **Image Test:** kitchen_plan.jpg processed successfully - rooms extracted
- [ ] **Image Test:** kitchen_plan.png processed successfully - dimensions accurate
- [ ] **Structured Prompt Test:** Verify prompt asks for: room names, dimensions, wall lengths, scale
- [ ] **Multi-page PDF Test:** 3-page PDF - all pages processed, results combined
- [ ] **Low Quality Image Test:** Blurry scan - confidence score < 70%, items flagged
- [ ] **High Quality Image Test:** Clear architectural drawing - confidence score > 90%
- [ ] Verify `confidence` field present in response
- [ ] **Schema Consistency Test:** Vision output parseable by same code as ezdxf output
- [ ] **Handwritten Test:** Hand-sketched floor plan - extracts approximate dimensions
- [ ] **Error Test:** Invalid image URL - returns error response gracefully
- [ ] **Token Usage Test:** Verify reasonable token usage logged (not excessive)
- [ ] **Console Check:** Logs show Vision API latency and token consumption

---

### Story 3.3: Voice Input Processing

As a **system**,
I want to **transcribe voice input for project descriptions**,
So that **users can describe projects hands-free**.

**Acceptance Criteria:**

**Given** Web Speech API is available in browser
**When** user speaks
**Then** browser handles transcription (frontend responsibility)

**Given** Web Speech API is NOT available
**When** user speaks and audio is captured
**Then** audio is sent to Whisper API for transcription

**Given** audio is received by Whisper service
**When** I process with OpenAI Whisper
**Then** I return transcribed text

**Given** transcription completes
**When** text is returned
**Then** confidence score is included if available

**Prerequisites:** None (independent service)

**Technical Notes:**
- `whisper_service.py` with `transcribe(audio_bytes)` function
- Use OpenAI Whisper API (whisper-1)
- Accept common audio formats (webm, mp3, wav)
- This is a fallback - primary transcription is browser-side Web Speech API
- Return `{text: str, confidence: float}`

**FRs Covered:** FR19

**Verification Checklist:**
- [ ] **Browser Test:** In Chrome, verify Web Speech API available (`'webkitSpeechRecognition' in window` = true)
- [ ] **Browser Test:** In Safari/Firefox, verify fallback to Whisper API triggered
- [ ] **Unit Test:** Call `whisper_service.transcribe(audio_bytes)` with sample .webm audio
- [ ] Verify OpenAI Whisper API called with whisper-1 model
- [ ] Verify response: `{text: "transcribed text here", confidence: 0.95}`
- [ ] **Audio Format Test:** .webm file - transcribed successfully
- [ ] **Audio Format Test:** .mp3 file - transcribed successfully
- [ ] **Audio Format Test:** .wav file - transcribed successfully
- [ ] **Short Audio Test:** 3-second clip - transcription returned in < 2 seconds
- [ ] **Long Audio Test:** 30-second clip - transcription accurate, returned in < 10 seconds
- [ ] **Construction Terms Test:** "200 square foot kitchen remodel" - transcribed accurately
- [ ] **Noisy Audio Test:** Background noise - transcription still reasonable
- [ ] **Accent Test:** Various English accents - transcription accurate
- [ ] **Empty Audio Test:** Silent audio file - returns empty string, no error
- [ ] **Error Test:** Invalid audio format - returns error response
- [ ] Verify confidence score reflects transcription quality
- [ ] **Console Check:** Logs show Whisper API latency and audio duration

---

### Story 3.4: Clarification Agent & ClarificationOutput Generation

As a **system**,
I want to **understand the project through natural conversation and produce a validated ClarificationOutput**,
So that **Dev 2's Deep Agent Pipeline has everything needed to generate estimates**.

**Acceptance Criteria:**

**Given** a new estimate with CAD file upload (mandatory)
**When** Clarification Agent starts
**Then** it processes the CAD file and analyzes the project description

**Given** input is ambiguous or incomplete
**When** I process the description
**Then** I generate clarifying questions for the user (via text or voice)

**Given** user provides answers to clarifying questions
**When** I process the response
**Then** I extract structured project data including full address, scope by all 24 CSI divisions, and spatial relationships

**Given** CAD extraction is complete
**When** I build the spatial model
**Then** I generate a detailed `layoutNarrative` describing what's next to what (min 200 characters)

**Given** user answers are sufficient and CAD is processed
**When** Clarification Agent completes
**Then** I output a validated `ClarificationOutput` v3.0.0 with all required fields

**Given** `ClarificationOutput` is generated
**When** I validate against schema
**Then** all 24 CSI divisions are present, all excluded divisions have reasons, and CAD data is populated

**Given** validation passes
**When** outputs are saved to Firestore
**Then** pipeline hands off to Dev 2's Deep Agent Pipeline via `start_deep_pipeline`

**Prerequisites:** Stories 3.1, 3.2, 3.3

**Technical Notes:**
- `functions/agents/clarification_agent.py` - Deep Agent with conversation handling
- Store conversation in `/estimates/{id}/conversations`
- Cloud Functions: `start_estimate`, `send_clarification_message`
- Integrates CAD parsing (ezdxf or vision) based on file type
- Builds complete `ClarificationOutput` including:
  - `projectBrief` with full address
  - `csiScope` with all 24 divisions explicitly listed
  - `cadData.spatialRelationships.layoutNarrative`
  - Project-type-specific data (kitchenSpecific, bathroomSpecific, etc.)
- Validates output against schema v3.0.0 before handoff
- Use GPT-4.1 for natural language understanding

**FRs Covered:** FR23-26

**Output Schema:** See [ClarificationOutput Schema](/docs/clarification-output-schema.md)

**Verification Checklist:**
- [ ] **Emulator Test:** Call `start_estimate` with CAD file URL and description
- [ ] Verify response: `{success: true, data: {estimateId: "xxx", status: "clarifying"}}`
- [ ] **Firestore Check:** `/estimates/{estimateId}` document created with status "clarifying"
- [ ] Verify Clarification Agent starts and processes CAD file
- [ ] **CAD Integration Test:** DWG file triggers ezdxf extraction, PDF triggers vision extraction
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/clarification` shows `status: "running"`
- [ ] Verify agent identifies missing info and generates questions
- [ ] Call `send_clarification_message` with `{estimateId, message: "answer"}` - agent processes response
- [ ] **Voice Input Test:** Send transcribed voice text - processed same as typed text
- [ ] Verify agent extracts full address including street, city, state, zip
- [ ] Continue conversation until agent indicates clarification complete (`isComplete: true`)
- [ ] **ClarificationOutput Validation:**
  - [ ] `schemaVersion` equals "3.0.0"
  - [ ] `projectBrief.location.fullAddress` is populated
  - [ ] All 24 CSI divisions present in `csiScope`
  - [ ] Each excluded division has `exclusionReason`
  - [ ] `cadData.fileUrl` is populated (CAD is mandatory)
  - [ ] `cadData.spatialRelationships.layoutNarrative` >= 200 characters
  - [ ] Project-specific data populated (e.g., `kitchenSpecific` for kitchen remodel)
- [ ] **Firestore Check:** `/estimates/{id}` has `clarificationOutput` field with full schema
- [ ] **Firestore Check:** `/estimates/{id}/agentOutputs/clarification` shows `status: "completed"`
- [ ] Verify handoff to Dev 2: `start_deep_pipeline` called with `ClarificationOutput`
- [ ] **Ambiguous Input Test:** Send vague description "fix my house" - agent asks clarifying questions
- [ ] **Complete Input Test:** Send detailed description with all info - agent proceeds faster
- [ ] **Schema Validation Error Test:** Missing CSI division - validation fails before handoff
- [ ] **Console Check:** Logs show GPT-4.1 API calls, CAD extraction, and schema validation

---

## Epic 4: Data Services & PDF Output

**Owner:** Dev 4
**Goal:** Build cost data services (mock RSMeans), location intelligence, Monte Carlo simulation, and PDF generation. These are independent services called by agents.

**Exclusive Files:**
- `functions/services/cost_data_service.py`
- `functions/services/monte_carlo.py`
- `functions/services/pdf_generator.py`
- `functions/templates/**`
- Firestore `/costData/**` collections

---

### Story 4.1: Location Intelligence Service

As a **system**,
I want to **provide location-based cost factors**,
So that **estimates are adjusted for regional variations**.

**Acceptance Criteria:**

**Given** a zip code is provided
**When** I query location data
**Then** I return labor rates for relevant trades

**Given** a zip code is provided
**When** I analyze the market
**Then** I determine union vs. non-union labor market

**Given** a location is provided
**When** I query permit data
**Then** I return estimated permit costs (% of project value or fixed)

**Given** a location and project timeline
**When** I query weather data
**Then** I return seasonal factors that may impact construction

**Given** all location queries complete
**When** I return results
**Then** output is structured: `{laborRates: {}, isUnion: bool, permitCosts: {}, weatherFactors: {}}`

**Prerequisites:** None (independent service)

**Technical Notes:**
- `cost_data_service.py` with `get_location_factors(zip_code)` function
- Firestore `/costData/locationFactors/{zipCode}` for mock data
- Create mock dataset covering major US regions
- Labor rates by trade (electrician, plumber, carpenter, etc.)
- Return `LocationFactors` dataclass

**FRs Covered:** FR37-40

**Verification Checklist:**
- [ ] **Unit Test:** Call `get_location_factors("80202")` - returns Denver location data
- [ ] Verify response: `{laborRates: {...}, isUnion: bool, permitCosts: {...}, weatherFactors: {...}}`
- [ ] Verify `laborRates` contains: electrician, plumber, carpenter, general_labor (hourly rates)
- [ ] **Denver Test:** `laborRates.electrician` returns ~$45-65/hr (reasonable Denver rate)
- [ ] **Union Market Test:** `isUnion: true` for Chicago (60601), `isUnion: false` for Houston (77001)
- [ ] Verify `permitCosts` has percentage and/or fixed values
- [ ] Verify `weatherFactors` has seasonal impact data (winter slowdown, etc.)
- [ ] **NYC Test:** Call with "10001" - returns high labor rates, union market
- [ ] **Rural Test:** Call with rural zip code - returns lower rates
- [ ] **Invalid Zip Test:** Call with "00000" - returns regional defaults with `isDefault: true`
- [ ] **Firestore Check:** `/costData/locationFactors/{zipCode}` documents exist for test zips
- [ ] Verify labor rates by trade: electrician > plumber > carpenter > general_labor (typical hierarchy)
- [ ] **Cache Test:** Second call to same zip code returns faster (cached)
- [ ] **Console Check:** Logs show data source (cache vs. database) for each request

---

### Story 4.2: Cost Data & Monte Carlo Simulation

As a **system**,
I want to **provide RSMeans-compatible cost data and run risk simulations**,
So that **estimates are accurate and include uncertainty analysis**.

**Acceptance Criteria:**

**Given** a material item is requested
**When** I query cost database
**Then** I return unit cost, labor hours, crew composition

**Given** a line item with cost ranges
**When** I run Monte Carlo simulation
**Then** I perform 1000+ iterations using triangular distributions

**Given** simulation completes
**When** I analyze results
**Then** I calculate P50, P80, P90 percentiles

**Given** percentiles are calculated
**When** I determine contingency
**Then** I recommend contingency percentage based on P80-P50 spread

**Given** simulation includes line items
**When** I analyze sensitivity
**Then** I identify top risk factors (items contributing most to variance)

**Prerequisites:** Story 4.1

**Technical Notes:**
- `cost_data_service.py` with `get_material_cost(item_code)`, `get_labor_rate(trade, location)`
- Firestore `/costData/materials/{code}`, `/costData/laborRates/{id}`
- Mock data with RSMeans schema: `{unitCost, laborHours, crew, productivity}`
- `monte_carlo.py` with `run_simulation(line_items, iterations=1000)`
- Use NumPy for triangular distributions: `np.random.triangular(low, likely, high)`
- Return `MonteCarloResult` dataclass

**FRs Covered:** FR48-51

**Verification Checklist:**
- [ ] **Unit Test:** Call `get_material_cost("092900")` (drywall) - returns cost data
- [ ] Verify response: `{unitCost: float, laborHours: float, crew: str, productivity: float}`
- [ ] **Drywall Test:** Unit cost ~$1.50-3.00/sqft (reasonable range)
- [ ] **Labor Hours Test:** Drywall shows ~0.02-0.04 hours/sqft
- [ ] **Crew Test:** Returns crew composition (e.g., "2 Carpenters + 1 Laborer")
- [ ] **Unit Test:** Call `get_labor_rate("electrician", "80202")` - returns hourly rate
- [ ] Verify labor rate matches `locationFactors.laborRates.electrician`
- [ ] **Firestore Check:** `/costData/materials/{code}` documents exist for common materials
- [ ] **Monte Carlo Test:** Call `run_simulation(line_items, 1000)` with sample data
- [ ] Verify response: `{p50: float, p80: float, p90: float, contingency: float, topRisks: []}`
- [ ] Verify P50 < P80 < P90 (correct percentile order)
- [ ] **Distribution Test:** 1000 iterations produce reasonable spread (P90/P50 ratio ~1.1-1.3)
- [ ] Verify `contingency` percentage derived from P80-P50 spread
- [ ] Verify `topRisks` array sorted by impact, has item names
- [ ] **Performance Test:** 1000 iterations complete in < 2 seconds
- [ ] **Triangular Distribution Test:** Verify NumPy triangular distribution used (low, likely, high)
- [ ] **Sensitivity Test:** Item with highest variance contributes most to topRisks
- [ ] **Console Check:** Logs show simulation duration and iteration count

---

### Story 4.3: PDF Report Generation

As a **system**,
I want to **generate professional PDF estimate reports**,
So that **contractors can present to clients**.

**Acceptance Criteria:**

**Given** a complete estimate exists
**When** PDF generation is requested
**Then** I render HTML template with estimate data

**Given** HTML is rendered
**When** I convert to PDF
**Then** I use WeasyPrint to generate professional PDF

**Given** PDF is generated
**When** I store the file
**Then** PDF is saved to Firebase Storage and URL is returned

**Given** estimate includes CAD data
**When** I generate PDF
**Then** I include annotated CAD plan showing measured areas

**Given** PDF generation completes
**When** URL is returned
**Then** PDF is downloadable by user

**Prerequisites:** Story 4.2

**Technical Notes:**
- `pdf_generator.py` with `generate_pdf(estimate_id)` function
- `functions/templates/estimate_report.html` - Jinja2 template
- `functions/templates/styles.css` - CSS for print styling
- Use WeasyPrint for HTML→PDF conversion
- Sections: Executive Summary, Cost Breakdown, BoQ, Labor, Schedule, Risk, Assumptions
- Store PDF in Firebase Storage `/pdfs/{estimateId}/estimate.pdf`

**FRs Covered:** FR59-61, FR75

**Verification Checklist:**
- [ ] **Unit Test:** Call `generate_pdf(estimate_id)` with completed estimate - returns URL
- [ ] Verify Jinja2 template renders without errors
- [ ] Verify WeasyPrint converts HTML to PDF successfully
- [ ] **Firebase Storage Check:** PDF saved at `gs://bucket/pdfs/{estimateId}/estimate.pdf`
- [ ] Verify returned URL is accessible and downloads PDF
- [ ] **PDF Content - Page 1:** Executive Summary with total cost, timeline, confidence range
- [ ] **PDF Content - Page 2+:** Cost Breakdown by CSI division
- [ ] **PDF Content:** Bill of Quantities with quantities, units, costs
- [ ] **PDF Content:** Labor Analysis section showing trades and hours
- [ ] **PDF Content:** Schedule section with task list or Gantt representation
- [ ] **PDF Content:** Risk Analysis with P50/P80/P90 and top risks
- [ ] **PDF Content:** Assumptions and exclusions section
- [ ] **CAD Test:** Estimate with CAD data - PDF includes annotated plan image
- [ ] **Styling Test:** PDF has professional formatting (headers, tables, page numbers)
- [ ] **Print Test:** PDF prints correctly on letter-size paper
- [ ] **Size Test:** PDF file size reasonable (< 5MB for typical estimate)
- [ ] **Generation Time Test:** PDF generated in < 10 seconds
- [ ] **Error Test:** Invalid estimate ID - returns appropriate error
- [ ] **Console Check:** Logs show template rendering and PDF generation duration

---

### Story 4.4: Cost Data Seeding & Maintenance

As a **system**,
I want to **have comprehensive mock cost data available**,
So that **estimates cover all residential project types**.

**Acceptance Criteria:**

**Given** MVP needs mock data
**When** I seed the database
**Then** Firestore contains cost data for all MVP-scope CSI divisions

**Given** residential projects need materials
**When** I query materials
**Then** I find data for: concrete, framing, insulation, drywall, flooring, tile, fixtures, cabinets, appliances, roofing, siding, windows, doors

**Given** labor is needed
**When** I query labor rates
**Then** I find rates for: general labor, carpenter, electrician, plumber, HVAC tech, roofer, painter, tile setter

**Given** multiple locations are used
**When** I query location factors
**Then** I find data for 50+ major US metro areas

**Prerequisites:** None (can run in parallel with other stories)

**Technical Notes:**
- Create seeding script for Firestore
- RSMeans-compatible schema for future API integration
- Cover CSI divisions: 03, 04, 05, 06, 07, 08, 09, 10, 22, 23, 26, 31, 32
- Include productivity factors and crew compositions
- Location data: major metros across US regions

**FRs Covered:** FR42-46 (data foundation)

**Verification Checklist:**
- [ ] **Seeding Script Test:** Run seeding script - completes without errors
- [ ] **Firestore Check:** `/costData/materials/` collection has 100+ documents
- [ ] **Division 03 (Concrete):** Materials exist: concrete, rebar, forms
- [ ] **Division 06 (Wood):** Materials exist: 2x4, 2x6, plywood, trim
- [ ] **Division 07 (Thermal):** Materials exist: insulation (batt, foam, blown)
- [ ] **Division 08 (Openings):** Materials exist: doors, windows, hardware
- [ ] **Division 09 (Finishes):** Materials exist: drywall, paint, flooring, tile, carpet
- [ ] **Division 10 (Specialties):** Materials exist: cabinets, countertops
- [ ] **Division 22 (Plumbing):** Materials exist: fixtures, pipe, fittings
- [ ] **Division 23 (HVAC):** Materials exist: ducts, registers, units
- [ ] **Division 26 (Electrical):** Materials exist: wire, outlets, panels, fixtures
- [ ] **Division 31 (Earthwork):** Materials exist: excavation, grading
- [ ] **Division 32 (Exterior):** Materials exist: concrete flatwork, landscaping
- [ ] Verify each material has RSMeans schema: `{unitCost, laborHours, crew, productivity}`
- [ ] **Labor Rates Check:** `/costData/laborRates/` has trades: electrician, plumber, carpenter, hvac, roofer, painter, tile_setter, general_labor
- [ ] **Location Factors Check:** `/costData/locationFactors/` has 50+ zip codes
- [ ] Verify major metros covered: NYC, LA, Chicago, Houston, Phoenix, Denver, Atlanta, Seattle
- [ ] **Query Test:** Query for "drywall" returns multiple results (sizes, types)
- [ ] **Completeness Test:** Kitchen remodel BoQ can be fully costed from seeded data
- [ ] **Completeness Test:** Bathroom remodel BoQ can be fully costed from seeded data
- [ ] **Console Check:** Seeding script logs document counts by collection

---

## Epic 5: Multi-Retailer Price Optimization

**Owner:** Dev 5
**Goal:** Integrate Unrawngle API to compare material prices across Home Depot, Lowe's, Ace Hardware, Wayfair, and other retailers. Find the best prices for each material with fuzzy matching (doesn't require exact brand match).

**Exclusive Files:**
- `functions/services/unrawngle_service.py`
- `functions/services/price_optimizer.py`
- `src/components/estimate/PriceComparison/`
- `src/hooks/usePriceComparison.ts`

---

### Story 5.1: Unrawngle API Integration

As a **system**,
I want to **integrate with the Unrawngle API for product search**,
So that **I can query prices across multiple retailers**.

**Acceptance Criteria:**

**Given** an Unrawngle API key is configured
**When** I call the search endpoint with a product query
**Then** I receive results from Home Depot, Lowe's, Ace Hardware, Wayfair, and other supported retailers

**Given** a search query is made
**When** results return
**Then** each result includes: product name, price, retailer, URL, availability, and product image

**Given** API rate limits exist
**When** I make multiple requests
**Then** I implement proper rate limiting and request queuing

**Given** API errors occur
**When** a request fails
**Then** I handle gracefully with retry logic and fallback to cached data

**Prerequisites:** None (can start independently)

**Technical Notes:**
- `functions/services/unrawngle_service.py` - API client wrapper
- Store API key in Cloud Functions environment variables
- Implement response caching in Firestore to reduce API calls
- Handle pagination for large result sets
- Log all API calls for usage monitoring

**FRs Covered:** New feature (price optimization)

**Verification Checklist:**
- [ ] **Environment Test:** `UNRAWNGLE_API_KEY` environment variable is set
- [ ] **Unit Test:** Call `unrawngle_service.search("2x4 lumber")` - returns results
- [ ] Verify response includes products from: Home Depot, Lowe's (minimum 2 retailers)
- [ ] Verify each result has: `{name, price, retailer, url, availability, imageUrl}`
- [ ] **Home Depot Test:** Search returns Home Depot results with valid product URLs
- [ ] **Lowe's Test:** Search returns Lowe's results with valid product URLs
- [ ] **Ace Hardware Test:** Search includes Ace Hardware when available
- [ ] **Wayfair Test:** Search includes Wayfair for applicable products (fixtures, etc.)
- [ ] **Price Accuracy Test:** Returned prices match actual retailer websites (spot check)
- [ ] **URL Test:** Product URLs link to correct product pages
- [ ] **Availability Test:** Results include stock availability info
- [ ] **Rate Limiting Test:** 10 rapid requests - all succeed without 429 errors
- [ ] **Queue Test:** 50 requests queued - processed without failures
- [ ] **Retry Test:** Simulate API timeout - retry logic kicks in
- [ ] **Cache Test:** Repeated query returns cached result faster
- [ ] **Firestore Check:** `/priceCache/{queryHash}` documents created for caching
- [ ] **Error Test:** Invalid API key - returns authentication error
- [ ] **Console Check:** Logs show API call counts and cache hit/miss ratios

---

### Story 5.2: Fuzzy Product Matching

As a **system**,
I want to **match BoQ line items to retailer products with fuzzy matching**,
So that **I find equivalent products even if brand/model differs**.

**Acceptance Criteria:**

**Given** a BoQ line item like "2x4x8 lumber, SPF"
**When** I search across retailers
**Then** I find matching products regardless of exact brand (e.g., finds both branded and store-brand lumber)

**Given** a product category like "interior latex paint, white, 1 gallon"
**When** I search with fuzzy matching
**Then** I return Behr, Valspar, Glidden, and store brands as valid matches

**Given** products have different units or quantities
**When** I compare prices
**Then** I normalize to price-per-unit for fair comparison (e.g., $/sqft, $/linear ft)

**Given** a match confidence score is calculated
**When** confidence is below 70%
**Then** I flag for user review with suggested alternatives

**Given** user approves or rejects a match
**When** feedback is provided
**Then** I learn and improve future matching for similar items

**Prerequisites:** Story 5.1

**Technical Notes:**
- `functions/services/price_optimizer.py` - matching logic
- Use product category + specifications for matching (not just name)
- Implement Levenshtein distance or embedding-based similarity
- Store user match preferences for learning
- Support manual override of auto-matched products

**FRs Covered:** New feature (intelligent matching)

**Verification Checklist:**
- [ ] **Unit Test:** Call `match_product("2x4x8 lumber, SPF")` - returns matched products
- [ ] Verify matches include both branded and store-brand 2x4 lumber
- [ ] **Generic Match Test:** "interior latex paint, white, 1 gallon" matches Behr, Valspar, Glidden
- [ ] **Category Match Test:** Matching uses product category, not just name
- [ ] **Specs Match Test:** "1/2 inch drywall" matches products with "1/2"" or "0.5 inch"
- [ ] **Unit Normalization Test:** Compare paint prices normalized to $/gallon
- [ ] **Unit Normalization Test:** Compare lumber prices normalized to $/linear foot
- [ ] Verify each match has `confidence` score (0-100)
- [ ] **High Confidence Test:** Exact product match shows confidence > 90%
- [ ] **Low Confidence Test:** Fuzzy match shows confidence 70-89%
- [ ] **Flag Test:** Confidence < 70% - match flagged with `needsReview: true`
- [ ] **Alternatives Test:** Low-confidence matches include `alternatives` array
- [ ] **User Feedback Test:** User approves match - preference stored in Firestore
- [ ] **Learning Test:** After approval, same item matches preferred product first
- [ ] **Override Test:** User can manually override auto-matched product
- [ ] **Firestore Check:** `/userPreferences/{userId}/productMatches` stores preferences
- [ ] **Similarity Algorithm Test:** Verify Levenshtein distance or embedding similarity used
- [ ] **Console Check:** Logs show match confidence and algorithm used

---

### Story 5.3: Price Comparison Engine

As a **system**,
I want to **compare prices across retailers and find optimal purchasing strategy**,
So that **contractors can minimize material costs**.

**Acceptance Criteria:**

**Given** a complete Bill of Quantities
**When** I run price optimization
**Then** I search Unrawngle for each line item across all retailers

**Given** prices are retrieved for all items
**When** I calculate totals
**Then** I show: cheapest single-retailer total, mixed-retailer optimal total, and potential savings

**Given** some items are cheaper at different stores
**When** I calculate optimal strategy
**Then** I recommend which items to buy where, considering shipping/pickup logistics

**Given** price data is retrieved
**When** I display results
**Then** I show price breakdown by retailer with percentage savings vs. baseline

**Given** prices change over time
**When** estimate is viewed later
**Then** I can refresh prices with one click to get current data

**Prerequisites:** Story 5.2

**Technical Notes:**
- Run price lookup in parallel for all BoQ items
- Consider shipping costs and minimum order thresholds
- Calculate "hassle factor" for multi-store shopping
- Cache results with TTL (24 hours default)
- Support "single store" vs "optimize across stores" modes

**FRs Covered:** New feature (cost optimization)

**Verification Checklist:**
- [ ] **Unit Test:** Call `compare_prices(billOfQuantities)` - returns comparison results
- [ ] Verify all BoQ line items have price lookups attempted
- [ ] Verify response includes: `{singleRetailerTotals: {}, optimalTotal, potentialSavings}`
- [ ] **Single Retailer Test:** `singleRetailerTotals.homeDepot` shows total if buying all from HD
- [ ] **Single Retailer Test:** `singleRetailerTotals.lowes` shows total if buying all from Lowe's
- [ ] **Optimal Test:** `optimalTotal` <= all single-retailer totals (mixed is same or cheaper)
- [ ] **Savings Test:** `potentialSavings` = cheapest single retailer - optimal
- [ ] Verify `itemBreakdown` shows best retailer per item
- [ ] **Recommendation Test:** For each item, shows `{item, bestRetailer, price, savings}`
- [ ] **Shipping Test:** Shipping costs factored into optimization
- [ ] **Minimum Order Test:** Retailers with minimum thresholds noted in results
- [ ] **Parallel Test:** Price lookups for all items run in parallel (< 30s for 50 items)
- [ ] **Hassle Factor Test:** Multi-store option shows estimated extra effort
- [ ] **Cache TTL Test:** Results cached with 24-hour TTL
- [ ] **Refresh Test:** `refreshPrices: true` flag bypasses cache
- [ ] **Mode Test:** "single_store" mode returns best single retailer only
- [ ] **Mode Test:** "optimize" mode returns mixed-retailer strategy
- [ ] **Console Check:** Logs show optimization algorithm duration and savings found

---

### Story 5.4: Price Comparison UI

As a **contractor**,
I want to **view and interact with price comparison results**,
So that **I can make informed purchasing decisions**.

**Acceptance Criteria:**

**Given** I am in the Final Estimate section
**When** I click "Compare Prices"
**Then** I see a price comparison panel with retailer breakdown

**Given** price comparison is displayed
**When** I view the results
**Then** I see: best price per item, retailer logos, savings amount, and "Buy" links

**Given** an item has multiple matches
**When** I click on the item
**Then** I see all matched products with prices and can select preferred option

**Given** I want to optimize
**When** I click "Find Best Prices"
**Then** system calculates and displays optimal purchasing strategy

**Given** I have a preferred retailer
**When** I filter by retailer
**Then** I see prices only from that retailer with comparison to optimal

**Given** I approve the price comparison
**When** I click "Apply to Estimate"
**Then** the estimate updates with optimized material costs

**Prerequisites:** Story 5.3, Epic 1 (UI components)

**Technical Notes:**
- `src/components/estimate/PriceComparison/` - React components
- `PriceComparisonPanel.tsx` - main comparison view
- `RetailerCard.tsx` - individual retailer pricing
- `ProductMatchCard.tsx` - fuzzy match results with selection
- `usePriceComparison.ts` - hook for price lookup
- Show retailer logos and direct purchase links
- Responsive design for mobile viewing

**FRs Covered:** New feature (UI for price optimization)

**Verification Checklist:**
- [ ] Navigate to Final Estimate section - "Compare Prices" button visible
- [ ] Click "Compare Prices" - loading state shown, then price comparison panel appears
- [ ] Verify panel shows retailer breakdown with logos: Home Depot, Lowe's, etc.
- [ ] Verify each retailer shows: total cost, number of items, savings vs. highest
- [ ] Verify "Best Price" badge on cheapest retailer
- [ ] Verify individual items show: item name, best price, retailer, "Buy" link
- [ ] Click on an item row - expands to show all matched products with prices
- [ ] Verify expanded view shows product images from each retailer
- [ ] Select different product match - selection updates, totals recalculate
- [ ] Click "Find Best Prices" - optimization runs, shows optimal strategy
- [ ] Verify optimal strategy shows items grouped by retailer
- [ ] Verify savings amount highlighted (e.g., "Save $450 with mixed retailers")
- [ ] Click retailer filter (e.g., "Home Depot only") - view filters to that retailer
- [ ] Verify filtered view shows comparison to optimal
- [ ] Click "Apply to Estimate" - estimate material costs update with optimized prices
- [ ] **Firestore Check:** `/estimates/{id}` has `priceComparison` field with selected strategy
- [ ] **Responsive Test:** Panel displays correctly on tablet (768px width)
- [ ] **Mobile Test:** Panel collapses to accordion on mobile (< 640px)
- [ ] **Edge Case:** Item with no matches - shows "No matches found" with manual search option

---

### Story 5.5: Shopping List Generator

As a **contractor**,
I want to **generate optimized shopping lists by retailer**,
So that **I can efficiently purchase materials**.

**Acceptance Criteria:**

**Given** I have approved price comparisons
**When** I click "Generate Shopping Lists"
**Then** I get separate lists for each retailer with items to purchase there

**Given** a shopping list is generated
**When** I view it
**Then** each item shows: product name, quantity, unit price, subtotal, and direct link

**Given** I want to share with my team
**When** I click "Export"
**Then** I can download as PDF or share via link

**Given** a retailer has a minimum order for free shipping
**When** my order is below threshold
**Then** I see a warning with suggestion to add items or switch to pickup

**Given** I click a "Buy Now" link
**When** I'm redirected to retailer
**Then** the product is pre-selected (where retailer supports deep linking)

**Prerequisites:** Story 5.4

**Technical Notes:**
- Generate printable shopping lists grouped by retailer
- Include store locations for pickup options
- Calculate shipping costs vs. pickup trade-offs
- Support bulk add-to-cart where retailer APIs allow
- Track which items were purchased (for feedback loop)

**FRs Covered:** New feature (purchasing workflow)

**Verification Checklist:**
- [ ] Complete price comparison and click "Generate Shopping Lists" - lists appear
- [ ] Verify separate lists generated for each retailer with items to buy there
- [ ] **Home Depot List:** Shows HD items with quantities, prices, subtotals
- [ ] **Lowe's List:** Shows Lowe's items with quantities, prices, subtotals
- [ ] Verify each item shows: product name, quantity needed, unit price, line total, product link
- [ ] Click product link - opens retailer page in new tab with correct product
- [ ] **Export PDF Test:** Click "Export" → "PDF" - shopping list PDF downloads
- [ ] **Export Link Test:** Click "Export" → "Share Link" - shareable link generated
- [ ] Verify shareable link shows read-only shopping lists when opened
- [ ] **Minimum Order Warning:** Retailer with order below free shipping threshold shows warning
- [ ] **Suggestion Test:** Warning suggests adding items or switching to pickup
- [ ] Verify "Store Pickup" vs "Delivery" toggle available per retailer
- [ ] **Pickup Test:** Select pickup - shows nearby store locations
- [ ] Click "Buy Now" link for Home Depot - redirects to HD with product pre-selected (if supported)
- [ ] Verify each list shows: item count, subtotal, estimated tax, grand total
- [ ] **Print Test:** Click "Print" - printable format renders correctly
- [ ] **Track Purchase Test:** Mark items as "Purchased" - status updates, stored in Firestore
- [ ] **Firestore Check:** `/estimates/{id}/shoppingLists` subcollection has list documents
- [ ] **Edge Case:** Empty shopping list (no items) - shows "No items to purchase" message

---

## Summary

| Epic | Developer | Stories | Key Deliverables |
|------|-----------|---------|------------------|
| 1 | Dev 1 (UI) | 4 | Complete React frontend with all three sections |
| 2 | Dev 2 (Deep Pipeline) | 5 | 5-agent deep pipeline (Location → Scope → Cost → Risk → Final) + orchestrator |
| 3 | Dev 3 (Input & Clarification) | 4 | CAD parsing, voice services, Clarification Agent, `ClarificationOutput` |
| 4 | Dev 4 (Data/PDF) | 4 | Cost data, Monte Carlo, PDF generation |
| 5 | Dev 5 (Price) | 5 | Unrawngle API integration, fuzzy matching, price optimization |

**Total:** 5 Epics, 22 Stories

**Handoff Architecture:**
- Dev 3 produces `ClarificationOutput` v3.0.0 (see [schema](/docs/clarification-output-schema.md))
- Dev 2 consumes `ClarificationOutput` and runs deep agent pipeline

**Parallel Work Pattern:**
- All 5 developers can start immediately
- Dev 1 uses mock data/APIs
- Dev 3 builds input handling + Clarification Agent → produces `ClarificationOutput`
- Dev 2 builds deep pipeline → consumes `ClarificationOutput`
- Dev 4 builds data services to defined interfaces
- Dev 5 works on enhancements that don't block MVP

---

## FR Coverage Matrix

### Complete FR to Story Mapping

| FR | Description | Epic | Story | Developer |
|----|-------------|------|-------|-----------|
| FR1-4 | User authentication (existing) | N/A | Existing | N/A |
| FR5 | Create new estimate | 3 | 3.4 | **Dev 3** |
| FR6 | View estimate list | 1 | 1.1 | Dev 1 |
| FR7 | Filter/sort estimates | 1 | 1.1 | Dev 1 |
| FR8 | Open existing estimate | 1 | 1.1 | Dev 1 |
| FR9 | Delete estimates | 2 | 2.1 | Dev 2 |
| FR10 | Duplicate estimate | 1 | 1.1 | Dev 1 |
| FR11 | Auto-save progress | 2 | 2.1 | Dev 2 |
| FR12 | Upload CAD files | 3 | 3.1 | Dev 3 |
| FR13 | Parse CAD, extract dimensions | 3 | 3.1, 3.2 | Dev 3 |
| FR14 | Convert CAD to JSON | 3 | 3.1, 3.2 | Dev 3 |
| FR15 | Display extracted measurements | 1 | 1.2 | Dev 1 |
| FR16 | Correct extracted dimensions | 1 | 1.2 | Dev 1 |
| FR17 | Store CAD in Firebase Storage | 3 | 3.1 | Dev 3 |
| FR18 | Text input chatbox | 1 | 1.1 | Dev 1 |
| FR19 | Voice input | 3 | 3.3 | Dev 3 |
| FR20 | Visual feedback during recording | 1 | 1.1 | Dev 1 |
| FR21 | Display transcribed voice | 1 | 1.1 | Dev 1 |
| FR22 | Edit transcription | 1 | 1.1 | Dev 1 |
| FR23 | Clarification Agent asks questions | 3 | 3.4 | **Dev 3** |
| FR24 | Process user answers | 3 | 3.4 | **Dev 3** |
| FR25 | Extract structured data | 3 | 3.4 | **Dev 3** |
| FR26 | Correlate description with CAD | 3 | 3.4 | **Dev 3** |
| FR27 | Review project brief | 1 | 1.1 | Dev 1 |
| FR28 | Modify inputs | 1 | 1.1 | Dev 1 |
| FR29 | Display CAD measurements | 1 | 1.2 | Dev 1 |
| FR30 | Generate BoQ | 2 | 2.3 | Dev 2 |
| FR31 | Calculate material quantities | 2 | 2.3 | Dev 2 |
| FR32 | Identify required trades | 2 | 2.3 | Dev 2 |
| FR33 | View scope breakdown | 1 | 1.2 | Dev 1 |
| FR34 | Discuss with agent | 1 + 2 | 1.2, 2.3 | Dev 1, Dev 2 |
| FR35 | Adjust quantities | 1 | 1.2 | Dev 1 |
| FR36 | Proceed to Final Estimate | 1 | 1.2 | Dev 1 |
| FR37 | Retrieve labor rates | 4 | 4.1 | Dev 4 |
| FR38 | Determine union/non-union | 4 | 4.1 | Dev 4 |
| FR39 | Retrieve permit costs | 4 | 4.1 | Dev 4 |
| FR40 | Retrieve weather factors | 4 | 4.1 | Dev 4 |
| FR41 | Override location params | 1 | 1.2 | Dev 1 |
| FR42 | Calculate material costs | 2 | 2.4 | Dev 2 |
| FR43 | Calculate labor costs | 2 | 2.4 | Dev 2 |
| FR44 | Calculate equipment costs | 2 | 2.4 | Dev 2 |
| FR45 | Apply location adjustments | 2 | 2.4 | Dev 2 |
| FR46 | Calculate overhead/profit | 2 | 2.4 | Dev 2 |
| FR47 | Adjust margins | 1 | 1.3 | Dev 1 |
| FR48 | Monte Carlo simulation | 4 | 4.2 | Dev 4 |
| FR49 | Calculate confidence intervals | 4 | 4.2 | Dev 4 |
| FR50 | Identify top risk factors | 4 | 4.2 | Dev 4 |
| FR51 | Recommend contingency | 4 | 4.2 | Dev 4 |
| FR52 | View probability distribution | 1 | 1.3 | Dev 1 |
| FR53 | Display complete estimate | 1 | 1.3 | Dev 1 |
| FR54 | Modify line items | 1 | 1.3 | Dev 1 |
| FR55 | Recalculate totals | 1 | 1.3 | Dev 1 |
| FR56 | Add notes to line items | 1 | 1.3 | Dev 1 |
| FR57 | View timeline | 1 | 1.3 | Dev 1 |
| FR58 | Adjust task durations | 1 | 1.3 | Dev 1 |
| FR59 | Generate PDF | 4 | 4.3 | Dev 4 |
| FR60 | PDF sections | 4 | 4.3 | Dev 4 |
| FR61 | Annotated CAD in PDF | 4 | 4.3 | Dev 4 |
| FR62 | Download PDF | 1 | 1.3 | Dev 1 |
| FR63 | Customize PDF sections | 4 | 4.3 | Dev 4 |
| FR64 | Client-ready estimate | 4 | 4.3 | Dev 4 |
| FR65 | View pipeline progress | 1 | 1.4 | Dev 1 |
| FR66 | See current agent | 1 | 1.4 | Dev 1 |
| FR67 | View intermediate outputs | 1 | 1.4 | Dev 1 |
| FR68 | Handle agent failures | 2 | 2.5 | Dev 2 |
| FR69 | Input actual costs | 1 | 1.4 | Dev 1 |
| FR70 | View variance analysis | 1 | 1.4 | Dev 1 |
| FR71 | Categorize variance | 2 | 2.5 | Dev 2 |
| FR72 | View accuracy metrics | 1 | 1.4 | Dev 1 |
| FR73 | Use feedback for improvement | 2 | 2.5 | Dev 2 |
| FR74 | Firestore persistence | 2 | 2.1 | Dev 2 |
| FR75 | Firebase Storage | 4 | 4.3 | Dev 4 |
| FR76 | Export JSON | 1 | 1.3 | Dev 1 |
| FR77 | Version history | 2 | 2.1 | Dev 2 |
| FR78 | Restore versions | 2 | 2.1 | Dev 2 |
| NEW | Unrawngle API integration | 5 | 5.1 | Dev 5 |
| NEW | Fuzzy product matching | 5 | 5.2 | Dev 5 |
| NEW | Price comparison engine | 5 | 5.3 | Dev 5 |
| NEW | Price comparison UI | 5 | 5.4 | Dev 5 |
| NEW | Shopping list generator | 5 | 5.5 | Dev 5 |

### Coverage Summary

| Developer | FRs Covered | Count |
|-----------|-------------|-------|
| Dev 1 (UI) | FR6-8, FR10, FR15-16, FR18, FR20-22, FR27-29, FR33, FR35-36, FR41, FR47, FR52-58, FR62, FR65-67, FR69-70, FR72, FR76 | 32 |
| Dev 2 (Deep Pipeline) | FR9, FR11, FR30-32, FR34, FR42-46, FR68, FR71, FR73-74, FR77-78 | 17 |
| Dev 3 (Input & Clarification) | FR5, FR12-14, FR17, FR19, FR23-26 | 10 |
| Dev 4 (Data/PDF) | FR37-40, FR48-51, FR59-61, FR63-64, FR75 | 14 |
| Dev 5 (Price) | NEW: Unrawngle integration, fuzzy matching, price optimization, UI, shopping lists | 5 new features |
| Existing | FR1-4 | 4 |

**Total: 75 FRs covered** (FR1-4 existing authentication = 78 total in PRD)

---

## Integration Points

### Handoff Contract: Dev 3 → Dev 2

**ClarificationOutput v3.0.0** (see [full schema](/docs/clarification-output-schema.md))

Dev 3 produces and validates this artifact. Dev 2 consumes it.

```typescript
interface ClarificationOutput {
  estimateId: string;
  schemaVersion: "3.0.0";
  projectBrief: {
    projectType: ProjectType;
    location: { fullAddress, city, state, zipCode };
    scopeSummary: { totalSqft, rooms, finishLevel };
  };
  csiScope: {
    // All 24 CSI divisions explicitly listed
    div01_general_requirements: CSIDivision;
    // ... div02 through div33
  };
  cadData: {
    fileUrl: string;  // REQUIRED
    spaceModel: { rooms, walls, openings };
    spatialRelationships: { layoutNarrative: string }; // min 200 chars
    kitchenSpecific?: {...};
    bathroomSpecific?: {...};
  };
  conversation: {...};
  flags: {...};
}
```

### Service Interfaces (Dev 4 implements)

**Location Service Interface:**
```python
def get_location_factors(zip_code: str) -> LocationFactors:
    """Returns {laborRates: {}, isUnion: bool, permitCosts: {}, weatherFactors: {}}"""
```

**Cost Data Interface:**
```python
def get_material_cost(item_code: str) -> MaterialCost:
    """Returns {unitCost: float, laborHours: float, crew: str, productivity: float}"""
```

**Monte Carlo Interface:**
```python
def run_simulation(line_items: list, iterations: int = 1000) -> MonteCarloResult:
    """Returns {p50: float, p80: float, p90: float, contingency: float, topRisks: []}"""
```

**PDF Generator Interface:**
```python
def generate_pdf(estimate_id: str, sections: list = None) -> str:
    """Returns PDF download URL"""
```

### API Contracts

**Dev 3 Cloud Functions (Input & Clarification):**
- `start_estimate(projectDescription, cadFileUrl)` → `{estimateId, status: "clarifying"}`
- `send_clarification_message(estimateId, message)` → `{response, isComplete, clarificationOutput?}`

**Dev 2 Cloud Functions (Deep Pipeline):**
- `start_deep_pipeline(clarificationOutput)` → `{estimateId, status: "processing"}`
- `delete_estimate(estimateId)` → `{success}`
- `get_estimate_pdf(estimateId, sections?)` → `{pdfUrl}`

**Firestore Real-time:**
- `/estimates/{id}` - estimate document with `clarificationOutput` and `finalEstimate`
- `/estimates/{id}/agentOutputs/{agent}` - pipeline status
- `/estimates/{id}/conversations/{msgId}` - chat history

---

## Next Steps

1. **Dev 1-4:** Start on Story X.1 immediately (all can work in parallel)
2. **Dev 5:** Begin after Epic 1-2 have basic functionality
3. **Integration:** After individual stories complete, integrate via defined interfaces
4. **Testing:** E2E tests after integration

**Recommended Sprint Structure:**
- Sprint 1: All devs complete Story X.1
- Sprint 2: All devs complete Story X.2
- Sprint 3: Complete remaining stories + integration
- Sprint 4: Dev 5 stretch goals + polish

---

_For implementation: Use the `create-story` workflow to generate individual story implementation plans from this epic breakdown._

_This document is the source of truth for TrueCost MVP scope and team assignments._

---

**Document Version:** 2.0
**Created:** 2025-12-09
**Last Updated:** 2025-12-10
**Change Log:**
- v2.0 (2025-12-10): **Major restructure** - Split responsibilities between Dev 2 and Dev 3:
  - Dev 3 now owns: CAD parsing, voice services, AND Clarification Agent (Story 3.4)
  - Dev 2 now owns: Deep Agent Pipeline only (Location → Scope → Cost → Risk → Final)
  - Created `ClarificationOutput` v3.0.0 schema as handoff contract between Dev 3 → Dev 2
  - Schema includes: full address, all 24 CSI divisions with explicit status, spatial relationships, project-specific data
  - CAD upload is now mandatory (not optional)
  - See [ClarificationOutput Schema](/docs/clarification-output-schema.md) for full interface contract
- v1.1 (2025-12-10): Added Verification Checklists to all 24 stories for human-testable QA
