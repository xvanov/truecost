# TrueCost - Product Requirements Document

**Author:** xvanov
**Date:** 2025-12-09
**Version:** 1.1

---

## Executive Summary

TrueCost is an AI-powered construction estimation system that pivots the existing CollabCanvas collaborative canvas application into an intelligent, multi-agent estimation engine. Built on the LangChain Deep Agents framework within the Firebase ecosystem, TrueCost employs a hierarchy of 7 specialized deep agents—each an expert in its domain—that collaborate through structured workflows to transform project plans (CAD) and descriptions into comprehensive, professionally-credible estimates.

The system addresses a critical pain point in residential construction: **estimation inaccuracy kills profitability**. Contractors who underbid lose money on cost overruns; those who overbid lose jobs to competitors. TrueCost delivers accurate, risk-adjusted cost and timeline estimates by analyzing CAD plans, synthesizing data from multiple sources, automatically adjusting for location-specific factors, and providing probabilistic ranges rather than single-point guesses.

### What Makes This Special

**The Magic Moment:** A contractor uploads their CAD plan and describes the project scope via text or voice, and within minutes receives a comprehensive, professionally-formatted estimate with cost breakdown, timeline, risk analysis, and confidence intervals—all automatically extracted from the plan and calculated.

This isn't just automation—it's a paradigm shift from "user + spreadsheet" to "user + AI estimation department." The 7 specialized agents reason together like a professional estimating team, but with superhuman data access and consistency:

1. **Clarification Agent** → Understands the project through natural conversation (text or voice)
2. **CAD Analysis Agent** → Extracts structured data from uploaded CAD plans
3. **Location Intelligence Agent** → Gathers zip-code specific labor rates, permits, weather, soil data
4. **Construction Scope Agent** → Creates bill of quantities in CSI MasterFormat
5. **Cost Estimation Agent** → Calculates material, labor, and equipment costs
6. **Risk Analysis Agent** → Models uncertainty with Monte Carlo simulation
7. **Final Estimator Agent** → Synthesizes risk-adjusted estimate and professional report

**Key Differentiators:**
| TrueCost | Traditional Tools |
|----------|-------------------|
| CAD plan analysis + natural language input | Manual takeoff from drawings |
| 7 specialized agents reasoning together | Single user + spreadsheet |
| Voice and text input options | Keyboard only |
| Automatic quantity extraction from plans | Manual measurements |
| Risk-adjusted ranges (Monte Carlo) | Single-point estimates |
| Continuous accuracy improvement | No learning capability |

---

## Project Classification

**Technical Type:** Web Application (SPA)
**Domain:** Construction / General Business
**Complexity:** Low (no regulatory compliance)

This is a **brownfield pivot** from the existing CollabCanvas application. The project leverages:
- Existing React 19 + TypeScript + Vite + Firebase infrastructure (~44,000 LOC)
- Real-time collaboration capabilities
- Canvas-based construction plan annotation
- BOM and pricing infrastructure
- Existing Google OAuth authentication

The pivot transforms CollabCanvas from a collaborative annotation tool into an AI-powered estimation engine while preserving the existing frontend infrastructure and Firebase backend.

### Brownfield Context

**Existing Assets to Leverage:**
- Firebase Auth (Google OAuth) - authentication ready and will be reused
- Cloud Firestore - data persistence patterns established
- Cloud Functions - AI command and pricing API integration patterns
- Firebase Storage - file storage for CAD uploads
- React component library with Tailwind CSS styling
- Zustand state management architecture
- Project management system with CRUD operations
- BOM (Bill of Materials) infrastructure in Money View
- PDF export capabilities

**New Capabilities Required:**
- CAD file parsing and conversion to structured data (Firebase-compatible approach)
- Voice input processing (Web Speech API or Firebase-hosted solution)
- LangChain Deep Agents framework integration (via Cloud Functions)
- LangGraph orchestration for 7-agent pipeline
- RSMeans-compatible cost data (mocked for MVP)
- Monte Carlo simulation for risk analysis

### Technical Constraints

**Firebase Ecosystem First:** All backend functionality should be implemented within the Firebase ecosystem where possible:
- Cloud Functions for agent orchestration and CAD processing
- Firestore for data persistence
- Firebase Storage for CAD file uploads
- Firebase Auth for authentication (existing Google OAuth)
- Avoid introducing unnecessary tech stacks or infrastructure

---

## Success Criteria

### Primary Success Metric: Estimation Accuracy (MAPE)

The core measure of TrueCost's value is how closely estimates match actual project costs, measured using **Mean Absolute Percentage Error (MAPE)**:

```
MAPE = (1/n) × Σ |Actual Cost - Estimated Cost| / Actual Cost × 100%
```

| Metric | Target | Industry Benchmark |
|--------|--------|-------------------|
| **MAPE (Overall)** | < 10% | 15-25% typical for manual estimates |
| **MAPE (Material Costs)** | < 8% | High variance in manual methods |
| **MAPE (Labor Hours)** | < 12% | Often 20%+ due to productivity unknowns |

**Why This Matters:** A 5% estimation error on a $1M project = $50K lost profit. Improving accuracy directly impacts contractor profitability and bid win rates.

### Key Performance Indicators

| KPI | Definition | Target |
|-----|------------|--------|
| **Estimate Accuracy (MAPE)** | % deviation from actual project cost | < 10% |
| **Time to Estimate** | Minutes from input to final estimate | < 5 minutes |
| **CAD Extraction Accuracy** | % of measurements correctly extracted | > 95% |
| **Estimate Completion Rate** | % of started estimates that complete successfully | > 95% |
| **Feedback Completion Rate** | % of estimates with actual cost data submitted | > 30% |
| **User Retention** | Monthly active users returning | > 70% |

### Business Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Estimates Generated** | Monthly estimate volume | Growth indicator |
| **Project Types Coverage** | % of residential project types supported | 100% of MVP scope |
| **Agent Pipeline Success** | % of estimates completing all 7 agents | > 98% |

---

## Product Scope

### MVP - Minimum Viable Product

MVP delivers a **complete Deep Agent estimation pipeline for single-family residential projects with CAD plan analysis**.

#### Core Capabilities

**1. Full 7-Agent Pipeline**
All agents operational from day one:

| Agent | MVP Capability |
|-------|----------------|
| **Clarification Agent** | Natural language project intake via text or voice; structured brief generation; follow-up questions for ambiguous inputs |
| **CAD Analysis Agent** | Parse uploaded CAD files; extract room dimensions, wall lengths, areas; convert to structured JSON data for other agents |
| **Location Intelligence Agent** | Zip-code based labor rates, permit cost lookup, weather/seasonal factors, union vs. non-union market detection |
| **Construction Scope Agent** | Bill of Quantities (BoQ) in CSI MasterFormat for residential projects; quantity takeoff from CAD data + description |
| **Cost Estimation Agent** | Material, labor, equipment costs using mocked RSMeans-schema data; crew composition and productivity factors |
| **Risk Analysis Agent** | Monte Carlo simulation (1000+ iterations), contingency calculation, confidence intervals (P50, P80, P90) |
| **Final Estimator Agent** | Risk-adjusted estimate synthesis, professional PDF report generation, executive summary |

**2. Dual Input System (Text/Voice + CAD Plan)**
- **Required inputs for every estimate:**
  - Project description (via text typing OR voice input)
  - CAD plan file upload (PDF, DWG, or image formats)
- Voice input available in MVP using Web Speech API or Firebase-compatible solution
- CAD parsing extracts measurements that feed into scope and cost agents

**3. Residential Project Coverage**
Support for all single-family home project types:
- **Remodels:** Kitchen, bathroom, basement, whole-home
- **Additions:** Room additions, ADUs, garage conversions
- **New Construction:** Custom home builds
- **Exterior:** Roofing, siding, windows, decks
- **Systems:** HVAC, electrical, plumbing upgrades

**4. Data Strategy (MVP)**

| Data Type | MVP Approach | Future State |
|-----------|--------------|--------------|
| **Cost Data** | Mocked dataset with exact RSMeans schema | Full RSMeans API integration |
| **Labor Rates** | Mocked dataset with exact RSMeans schema | Full RSMeans API integration |
| **Location Data** | Zip-code lookup for region, weather | Full geospatial integration |
| **Permit Costs** | Mocked dataset with exact RSMeans schema | Full RSMeans API integration |
| **CAD Data** | Parsed via Cloud Function, converted to JSON | Enhanced AI-powered extraction |

**5. Professional Output Document**
Full estimate report including:
- Executive Summary - Total cost, timeline, confidence range
- Detailed Cost Breakdown - By CSI division, with material/labor/equipment split
- Bill of Quantities - Line-item quantities and unit costs
- Labor Analysis - Man-hours by trade, crew requirements
- Project Schedule - Gantt-style timeline with critical path highlighted
- Risk Assessment - Key risks, Monte Carlo distribution, recommended contingency
- Assumptions & Exclusions - Transparency on estimate basis
- CAD Plan Reference - Annotated plan showing measured areas

**6. Three-Section UI Structure**
The application maintains three main sections:
- **Input** - Project description (text/voice) + CAD plan upload
- **Plan** - Extracted data review, scope breakdown, agent analysis
- **Final Estimate** - Complete estimate with modification and download

### Growth Features (Post-MVP)

**Enhanced Data Integration:**
- Live RSMeans API integration for real-time, verified cost data
- Home Depot/Lowe's API for real-time material pricing
- Municipal permit databases for accurate permit costs

**Expanded Project Support:**
- Multi-family residential projects
- Light commercial projects
- Specialty trades deep-dive (detailed electrical, plumbing, HVAC)

**Advanced Features:**
- Photo-based estimation (upload site photos for AI analysis)
- Historical project learning (company-specific productivity factors)
- Bid comparison tools (compare against submitted bids)
- BIM file support (3D model extraction)

**Collaboration & Integration:**
- Team features (multi-user estimates, approval workflows)
- QuickBooks integration (export estimates to accounting)
- Buildertrend/CoConstruct integration (sync with project management)

### Vision (Future)

**Platform Evolution:**
- Mobile app for on-site estimation
- Subcontractor marketplace (connect with vetted subs)
- Material procurement integration (order materials directly)
- Insurance and bonding integration
- Lender integration (pre-qualification based on estimates)

**AI Evolution:**
- Augmented reality site measurement
- Predictive analytics (market trends, material price forecasting)
- Automated change order estimation

---

## Innovation & Novel Patterns

### Multi-Agent Collaboration Architecture

TrueCost represents a novel application of the **LangChain Deep Agents** pattern to construction estimation. Rather than a single AI model attempting to handle all aspects of estimation, we deploy specialized agents that mirror the roles in a professional estimating department:

**Innovation Pattern: Expertise Decomposition**
- Each agent is an expert in ONE domain (CAD analysis, location intelligence, cost calculation, risk modeling)
- Agents communicate through structured handoffs (not free-form conversation)
- The pipeline ensures consistent, reproducible results

**Innovation Pattern: CAD-to-Estimate Pipeline**
- Novel application of AI to parse construction CAD files
- Automatic measurement extraction eliminates manual takeoff
- Structured data flows through agent pipeline for accurate costing

**Innovation Pattern: Human-AI Hybrid Workflow**
- Clarification Agent engages in natural conversation with user (text or voice)
- Other agents work autonomously with structured data
- User can review and modify at Plan stage before final estimate
- Final output is human-readable and professionally formatted

**Innovation Pattern: Probabilistic Estimation**
- Industry standard is single-point estimates ("the project will cost $150,000")
- TrueCost provides probability distributions ("80% confidence the project costs between $140,000-$165,000")
- This is a fundamental shift in how contractors think about and communicate estimates

### Validation Approach

**Agent Pipeline Validation:**
- Each agent has defined inputs and outputs with schema validation
- Pipeline includes checkpoints where human can review intermediate results
- Fallback mechanisms if any agent fails (graceful degradation)

**CAD Extraction Validation:**
- Extracted measurements displayed for user verification
- User can correct any misread dimensions
- Corrections feed back to improve future extraction

**Accuracy Validation:**
- Feedback loop captures actual project costs
- Variance analysis categorizes errors (scope change vs. estimation error vs. market shift)
- Continuous calibration improves future estimates

---

## Web Application Specific Requirements

### Application Architecture

**Type:** Single Page Application (SPA)
**Framework:** React 19 with TypeScript
**Build:** Vite for fast development and optimized production builds
**Hosting:** Firebase Hosting with global CDN
**Backend:** Firebase ecosystem (Cloud Functions, Firestore, Storage, Auth)

### Browser Support

| Browser | Version | Support Level |
|---------|---------|---------------|
| Chrome | Latest 2 versions | Full |
| Firefox | Latest 2 versions | Full |
| Safari | Latest 2 versions | Full |
| Edge | Latest 2 versions | Full |
| Mobile Safari | iOS 15+ | Full |
| Chrome Mobile | Android 10+ | Full |

### Real-Time Capabilities

**Agent Progress Streaming:**
- Server-Sent Events or Firestore real-time listeners for agent status
- Progress indicators for each agent in pipeline
- Intermediate results displayed as available

**Estimate Updates:**
- Real-time updates when data changes
- Optimistic UI updates with background sync

### Responsive Design

**Breakpoints:**
- Desktop: 1280px+ (primary experience)
- Tablet: 768px - 1279px (functional, optimized layout)
- Mobile: < 768px (view estimates only, input deferred to larger screens)

**Mobile Considerations:**
- Voice input works well on mobile
- Estimate viewing fully responsive
- CAD upload and complex editing optimized for desktop

### SEO Strategy

**Not Applicable** - TrueCost is a fully authenticated application. All content is behind login and not intended for search engine indexing. Marketing/landing pages (if any) would be separate.

---

## User Experience Principles

### Visual Personality

**Professional, Trustworthy, Intelligent**

TrueCost serves construction professionals who need to trust the estimates they present to clients. The UI should feel:
- **Professional** - Clean, organized, no clutter
- **Trustworthy** - Data-driven, transparent about assumptions
- **Intelligent** - Sophisticated but not overwhelming

**Design Language:**
- Clean typography with clear hierarchy
- Data visualizations for costs and timelines
- Subtle animations for agent progress (not distracting)
- Dark mode support (contractors often work early mornings/late evenings)

*Note: Refer to UX Design Specification once generated for detailed visual guidelines.*

### Application Structure

The application is organized into **three main sections**:

| Section | Purpose |
|---------|---------|
| **Input** | Collect project description (text/voice) and CAD plan upload |
| **Plan** | Review extracted data, clarify scope with agent, view analysis |
| **Final Estimate** | View complete estimate, modify details, download PDF |

### Key Interactions

**1. Project Input (Input Section)**
The Input section collects two required pieces of information:
- **Scope Description** - Via central chatbox (text typing OR voice input)
- **CAD Plan** - File upload (PDF, DWG, or image)

```
User: [Uploads kitchen_plan.pdf]
User: "Kitchen remodel in Denver, about 200 sq ft, mid-range finishes,
       moving the gas line for the stove." (typed or spoken)

Agent: "Got it - I see from the plan this is a 12' x 16' kitchen (192 sq ft).
        A few clarifying questions:
        1. Are you keeping the existing layout or changing it?
        2. New cabinets or refacing existing?
        3. What's the age of the home? (affects permitting)"

User: "Changing layout, all new cabinets, house is from 1985"

Agent: "Perfect. I've captured:
        - Kitchen remodel, 192 sq ft (from plan)
        - Layout change with new cabinet installation
        - Mid-range finishes
        - Gas line relocation
        - Denver, CO location
        - 1985 construction (may need permit updates)

        Ready to generate the plan?"
```

**2. Plan Review (Plan Section)**
After clarification is complete, user proceeds to Plan section:
- View extracted measurements from CAD
- Review scope breakdown by trade/division
- See agent analysis results
- Can go back and forth with agent to clarify or modify
- Once satisfied, proceed to Final Estimate

**3. Final Estimate (Final Estimate Section)**
The complete estimate is presented:
- **Summary card** at top (total cost, timeline, confidence)
- **Expandable sections** for detailed breakdowns
- **Editable fields** - User can modify line items, quantities, rates
- **Download PDF** prominently available
- **Save** actions for managing estimates

### Core User Flows

**Flow 1: New Estimate (Primary Flow)**
```
Dashboard → "New Estimate" → INPUT SECTION:
  └→ Upload CAD plan
  └→ Describe scope (text/voice in chatbox)
  └→ Clarification Agent asks questions
  └→ User answers, refines scope
  └→ User confirms, proceeds to Plan
                              ↓
                         PLAN SECTION:
  └→ View extracted CAD measurements
  └→ Review scope breakdown
  └→ Agent shows analysis
  └→ User can discuss/modify with agent
  └→ User confirms, proceeds to Final Estimate
                              ↓
                    FINAL ESTIMATE SECTION:
  └→ View complete estimate
  └→ Modify any line items if needed
  └→ Download PDF
  └→ Save estimate
```

**Flow 2: Review Past Estimate**
```
Dashboard → Select Estimate → Final Estimate Section →
Download PDF / Modify / Add Feedback
```

**Flow 3: Submit Feedback (Post-Project)**
```
Dashboard → Select Completed Estimate → "Add Actuals" →
Input Actual Costs → See Variance Analysis → Confirm
```

---

## Functional Requirements

### User Account & Access

- **FR1:** Users can sign in using existing Google OAuth authentication (Firebase Auth)
- **FR2:** Users can log in and maintain authenticated sessions across browser sessions
- **FR3:** Users can log out and terminate their session
- **FR4:** Users can view and update their profile information (name, company, default location)

### Project/Estimate Management

- **FR5:** Users can create a new estimate from the dashboard
- **FR6:** Users can view a list of all their estimates with status indicators
- **FR7:** Users can filter and sort estimates by date, status, project type, and cost range
- **FR8:** Users can open an existing estimate to view full details
- **FR9:** Users can delete estimates they no longer need
- **FR10:** Users can duplicate an existing estimate as a starting point for a new one
- **FR11:** System auto-saves estimate progress at each stage (Input, Plan, Final Estimate)

### Input Section - CAD Upload

- **FR12:** Users can upload CAD plan files (PDF, DWG, or image formats)
- **FR13:** System parses uploaded CAD files and extracts dimensional data
- **FR14:** System converts CAD data to structured JSON format for agent consumption
- **FR15:** System displays extracted measurements for user verification
- **FR16:** Users can correct any incorrectly extracted dimensions
- **FR17:** System stores CAD files securely in Firebase Storage

### Input Section - Scope Description (Text & Voice)

- **FR18:** Users can describe their project in natural language via text input in central chatbox
- **FR19:** Users can describe their project using voice input (speech-to-text)
- **FR20:** System provides visual feedback during voice recording
- **FR21:** System transcribes voice input and displays for user confirmation
- **FR22:** Users can edit transcribed voice input before submission

### Input Section - Clarification Agent

- **FR23:** System asks clarifying questions when project description is ambiguous
- **FR24:** Users can answer clarifying questions to refine project scope
- **FR25:** System extracts structured project data from conversation (location, size, type, finishes)
- **FR26:** System correlates text/voice description with CAD-extracted data
- **FR27:** Users can review the extracted project brief before proceeding to Plan
- **FR28:** Users can go back and modify inputs at any time during clarification

### Plan Section - Data Review

- **FR29:** System displays all measurements extracted from CAD plan
- **FR30:** System generates a Bill of Quantities (BoQ) in CSI MasterFormat divisions
- **FR31:** System calculates material quantities based on CAD data and project parameters
- **FR32:** System identifies required trades/labor categories
- **FR33:** Users can view the generated scope breakdown by division
- **FR34:** Users can discuss extracted data with agent and request modifications
- **FR35:** Users can manually adjust quantities or add/remove line items
- **FR36:** Users can proceed to Final Estimate when satisfied with plan

### Location Intelligence

- **FR37:** System retrieves labor rates based on project zip code
- **FR38:** System determines union vs. non-union labor market for location
- **FR39:** System retrieves permit cost estimates for location
- **FR40:** System retrieves weather/seasonal factors that may impact construction
- **FR41:** Users can override auto-detected location parameters if needed

### Cost Estimation

- **FR42:** System calculates material costs using cost database (RSMeans-schema mock data)
- **FR43:** System calculates labor costs using man-hours × labor rates
- **FR44:** System calculates equipment costs where applicable
- **FR45:** System applies location-based cost adjustments
- **FR46:** System calculates overhead and profit margins
- **FR47:** Users can adjust margin percentages in Final Estimate section

### Risk Analysis

- **FR48:** System performs Monte Carlo simulation (1000+ iterations) on cost estimate
- **FR49:** System calculates confidence intervals (P50, P80, P90) for total cost
- **FR50:** System identifies top risk factors affecting estimate uncertainty
- **FR51:** System recommends contingency percentage based on risk analysis
- **FR52:** Users can view probability distribution of estimated costs

### Final Estimate Section

- **FR53:** System displays complete estimate with all cost breakdowns
- **FR54:** Users can modify any line item (quantity, unit cost, description)
- **FR55:** System recalculates totals when user makes modifications
- **FR56:** Users can add notes or comments to specific line items
- **FR57:** Users can view timeline as Gantt chart or task list
- **FR58:** Users can adjust task durations or dependencies

### Output & Reporting

- **FR59:** System generates professional PDF estimate report
- **FR60:** PDF includes executive summary, detailed breakdown, schedule, and risk analysis
- **FR61:** PDF includes annotated CAD plan showing measured areas
- **FR62:** Users can download PDF estimate at any time
- **FR63:** Users can customize which sections appear in PDF
- **FR64:** System generates client-ready estimate (simplified, without internal notes)

### Agent Pipeline Visibility

- **FR65:** Users can view real-time progress of agent pipeline execution
- **FR66:** Users can see which agent is currently processing
- **FR67:** Users can view intermediate outputs from completed agents
- **FR68:** System handles agent failures gracefully with user notification

### Feedback & Learning

- **FR69:** Users can input actual project costs after completion
- **FR70:** System calculates variance between estimated and actual costs
- **FR71:** System categorizes variance (scope change, estimation error, market shift)
- **FR72:** Users can view their historical estimate accuracy metrics
- **FR73:** System uses feedback data to improve future estimates (anonymized aggregation)

### Data Management

- **FR74:** All user data stored securely in Firebase (Firestore)
- **FR75:** CAD files stored securely in Firebase Storage
- **FR76:** Users can export their estimate data (JSON format)
- **FR77:** System maintains estimate version history
- **FR78:** Users can restore previous versions of an estimate

---

## Non-Functional Requirements

### Performance

| Metric | Requirement | Rationale |
|--------|-------------|-----------|
| **Initial Load** | < 3 seconds | Fast access to dashboard |
| **CAD Upload & Parse** | < 30 seconds | Responsive file processing |
| **Voice Transcription** | < 3 seconds | Real-time feel |
| **Time to First Agent** | < 5 seconds after input | Responsive feel |
| **Full Pipeline Completion** | < 5 minutes | Core product promise |
| **PDF Generation** | < 10 seconds | Quick delivery |
| **Dashboard Load** | < 2 seconds | Snappy navigation |
| **Search/Filter** | < 500ms | Interactive filtering |

**Agent Pipeline Performance:**
- Each agent should complete within 30-60 seconds
- Streaming updates every 2-3 seconds during processing
- Timeout handling with graceful degradation

### Security

**Authentication:**
- Firebase Auth with existing Google OAuth implementation
- Session tokens with appropriate expiration
- Secure session handling across devices

**Data Protection:**
- All data encrypted in transit (TLS 1.3)
- Firestore encryption at rest
- Firebase Storage encryption for CAD files
- No sensitive data in client-side logs
- API keys secured in Cloud Functions (never exposed to client)

**Access Control:**
- Users can only access their own estimates and CAD files
- No cross-user data leakage
- Rate limiting on API endpoints

**Cost Data Security:**
- RSMeans data (when integrated) protected per licensing terms
- No raw cost database exposed to clients
- Aggregated outputs only

### Scalability

**MVP Scale Targets:**
- Support 100 concurrent users
- Handle 1,000 estimates per day
- Store 100,000 estimates total
- Handle CAD files up to 50MB

**Architecture for Scale:**
- Stateless Cloud Functions for agent execution and CAD processing
- Firestore auto-scaling for data storage
- Firebase Storage for CAD file storage with CDN
- Firebase Hosting CDN for static assets

### Reliability

| Metric | Target |
|--------|--------|
| **Uptime** | 99.5% (Firebase SLA) |
| **Data Durability** | 99.999% (Firestore) |
| **Pipeline Success Rate** | > 98% |
| **CAD Parse Success Rate** | > 95% |
| **Error Recovery** | Automatic retry with user notification |

### Integration

**Firebase Ecosystem (Core - MVP):**
- Firebase Auth - Existing Google OAuth (reused)
- Cloud Firestore - Data persistence
- Firebase Storage - CAD file and PDF storage
- Cloud Functions - Agent orchestration, CAD processing, LLM calls

**New Integrations (MVP):**
- LangChain / LangGraph - Agent orchestration (via Cloud Functions)
- OpenAI API - LLM backbone for agents (via Cloud Functions)
- Web Speech API - Voice input (browser-native)

**Future Integrations (Post-MVP):**
- RSMeans API - Cost data
- Home Depot API - Real-time pricing
- QuickBooks API - Accounting export
- Buildertrend API - Project management sync

---

## Appendix: CSI MasterFormat Divisions (Residential Focus)

MVP will support these CSI divisions relevant to residential construction:

| Division | Name | Residential Relevance |
|----------|------|----------------------|
| 03 | Concrete | Foundations, flatwork |
| 04 | Masonry | Fireplaces, veneers |
| 05 | Metals | Structural steel, railings |
| 06 | Wood, Plastics, Composites | Framing, trim, cabinets |
| 07 | Thermal & Moisture Protection | Roofing, insulation, siding |
| 08 | Openings | Windows, doors |
| 09 | Finishes | Drywall, paint, flooring, tile |
| 10 | Specialties | Bath accessories, fireplaces |
| 22 | Plumbing | Fixtures, piping |
| 23 | HVAC | Heating, cooling, ventilation |
| 26 | Electrical | Wiring, fixtures, panels |
| 31 | Earthwork | Excavation, grading |
| 32 | Exterior Improvements | Landscaping, driveways |

---

## Appendix: Supported CAD File Formats (MVP)

| Format | Extension | Notes |
|--------|-----------|-------|
| PDF | .pdf | Most common for plan sharing |
| AutoCAD Drawing | .dwg | Native CAD format |
| Image | .png, .jpg, .jpeg | Scanned plans or screenshots |

---

## PRD Summary

**TrueCost** transforms construction estimation from a manual, error-prone process into an AI-powered experience that delivers professional-grade estimates in minutes.

**Scope Summary:**
- 78 Functional Requirements covering the complete estimation workflow
- 7-agent deep pipeline including CAD Analysis Agent
- **CAD plan input + text/voice description** as required inputs
- **Voice input available in MVP** (Web Speech API)
- Three-section UI: Input → Plan → Final Estimate
- Full residential project coverage (remodels, additions, new construction)
- Professional PDF output with risk analysis
- Feedback loop for continuous accuracy improvement

**Key Technical Decisions:**
- Brownfield pivot leveraging CollabCanvas infrastructure (React 19, Firebase)
- **Firebase ecosystem for all backend** (Cloud Functions, Firestore, Storage)
- Existing Google OAuth authentication (reused)
- LangChain Deep Agents with LangGraph orchestration (via Cloud Functions)
- RSMeans-schema mock data for MVP (live integration post-MVP)
- Monte Carlo simulation for probabilistic estimates

**Success Metrics:**
- Primary: MAPE < 10% (estimate accuracy)
- CAD extraction accuracy: > 95%
- Time to estimate: < 5 minutes
- User retention: > 70%

**Next Steps:**
1. `workflow create-design` - UX Design (define Input/Plan/Final Estimate UI patterns)
2. `workflow create-architecture` - Technical architecture (CAD processing, agent design within Firebase)
3. `workflow create-epics-and-stories` - Epic breakdown for implementation

---

_This PRD captures the essence of TrueCost - an AI-powered construction estimation engine that analyzes CAD plans and delivers professional-grade estimates through 7 specialized agents working in concert._

_Created through collaborative discovery between xvanov and AI facilitator._
