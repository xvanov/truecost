# TrueCost Architecture

## Executive Summary

TrueCost is an AI-powered construction estimation system built as a brownfield pivot from the existing CollabCanvas application. The architecture employs LangChain Deep Agents (5 specialized agents) orchestrated via Firebase Cloud Functions, with the existing React 19 frontend extended for the three-section estimation workflow (Input → Plan → Final Estimate).

Key architectural decisions:
- **Agent Framework:** LangChain Deep Agents (`deepagents` 0.2.0+) for multi-agent orchestration with built-in planning, file system tools, and subagent spawning
- **LLM:** OpenAI GPT-4.1 (configurable via `LLM_MODEL` env var)
- **Backend:** Firebase ecosystem (Cloud Functions Python 2nd gen, Firestore, Storage)
- **Frontend:** Existing React 19 + TypeScript + Vite + shadcn/ui
- **CAD Processing:** Hybrid ezdxf (DWG) + GPT-4o Vision (PDF/images)

## Project Initialization

This is a **brownfield pivot** - no starter template. Extend existing CollabCanvas codebase:

```bash
# Add Python Cloud Functions
cd functions
pip install -r requirements.txt

# Frontend dependencies (if new packages needed)
cd ..
npm install
```

## Decision Summary

| Category | Decision | Version | Affects | Rationale |
|----------|----------|---------|---------|-----------|
| Agent Orchestration | LangChain Deep Agents | deepagents 0.2.0+ | All agent FRs | Built-in planning tool (`write_todos`), file system tools, subagent spawning (`task`), context management |
| LLM Provider | OpenAI GPT-4.1 (configurable) | gpt-4.1 | All agents | Strong instruction following, 1M context, swappable via env var |
| Agent State | Firestore + Deep Agents Filesystem | Firestore SDK | FR11, FR65-68, FR77 | Firebase-native persistence, real-time UI updates |
| CAD Processing | ezdxf (DWG) + GPT-4o Vision (PDF/images) | ezdxf, gpt-4o | FR12-17 | Programmatic for DWG (100% accuracy), Vision for images |
| Data Architecture | Firestore with flat estimates, subcollections | Firestore | FR5-11, FR69-78 | Efficient queries, real-time updates, scalable |
| API Pattern | Firebase Callable + Firestore Listeners | firebase-functions | FR23-28, FR65-67 | Native auth, instant UI updates, no extra infra |
| Real-time Updates | Firestore subcollections (agentOutputs) | Firestore | FR65-67 | Each agent writes status, frontend listens via onSnapshot |
| Voice Input | Web Speech API + Whisper fallback | Browser native, whisper-1 | FR19-22 | Free for 90%+ users, Whisper fallback for edge cases |
| PDF Generation | WeasyPrint + Jinja2 templates | weasyprint, jinja2 | FR59-64 | CSS-based styling, Python native, professional quality |
| Cost Data | Stub schema - defer to implementation | N/A | FR42-46 | Design with RSMeans docs during implementation |
| Monte Carlo | NumPy with triangular distributions | numpy | FR48-52 | Standard library, 1000 iterations, sensitivity analysis |
| Authentication | Existing Firebase Auth (unchanged) | Firebase Auth | FR1-4 | KISS - no tiers, existing Google OAuth works |
| Caching | Firestore built-in | Firestore | Performance | Defer additional caching if needed |
| Error Recovery | Retry once + manual fallback | N/A | FR68 | Graceful degradation |
| Logging | Cloud Logging + LangSmith | structlog | Observability | Firebase native + Deep Agents integration |

## Project Structure

```
truecost/
│
├── src/                                     # React Frontend (EXISTING - extend)
│   ├── components/
│   │   ├── ui/                              # shadcn/ui components (existing)
│   │   ├── canvas/                          # Canvas components (existing)
│   │   ├── estimate/                        # NEW: TrueCost estimate UI
│   │   │   ├── EstimateWizard.tsx
│   │   │   ├── InputSection/
│   │   │   │   ├── CadUploader.tsx
│   │   │   │   ├── VoiceInput.tsx
│   │   │   │   ├── ChatInterface.tsx
│   │   │   │   └── ProjectBriefPreview.tsx
│   │   │   ├── PlanSection/
│   │   │   │   ├── CadDataReview.tsx
│   │   │   │   ├── ScopeBreakdown.tsx
│   │   │   │   └── AgentAnalysis.tsx
│   │   │   └── FinalEstimateSection/
│   │   │       ├── EstimateSummary.tsx
│   │   │       ├── CostBreakdown.tsx
│   │   │       ├── RiskAnalysis.tsx
│   │   │       └── PdfExport.tsx
│   │   └── pipeline/
│   │       ├── PipelineProgress.tsx
│   │       └── AgentCard.tsx
│   │
│   ├── hooks/
│   │   ├── useEstimate.ts
│   │   ├── usePipelineStatus.ts
│   │   ├── useVoiceInput.ts
│   │   └── useCadUpload.ts
│   │
│   ├── services/
│   │   ├── firebase.ts                      # Existing
│   │   ├── estimateService.ts
│   │   └── pipelineService.ts
│   │
│   ├── stores/
│   │   ├── useProjectStore.ts               # Existing
│   │   └── useEstimateStore.ts
│   │
│   ├── types/
│   │   ├── estimate.ts
│   │   ├── agent.ts
│   │   └── costData.ts
│   │
│   └── pages/
│       ├── Dashboard.tsx                    # Existing - extend
│       ├── Project.tsx                      # Existing
│       └── Estimate.tsx                     # NEW
│
├── functions/                               # Python Cloud Functions (NEW)
│   ├── main.py
│   ├── requirements.txt
│   │
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── orchestrator.py
│   │   ├── clarification_agent.py
│   │   ├── cad_analysis_agent.py
│   │   ├── location_agent.py
│   │   ├── scope_agent.py
│   │   ├── cost_agent.py
│   │   ├── risk_agent.py
│   │   └── final_agent.py
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── firestore_service.py
│   │   ├── storage_service.py
│   │   ├── cad_parser.py
│   │   ├── vision_service.py
│   │   ├── cost_data_service.py             # STUB
│   │   ├── monte_carlo.py
│   │   ├── pdf_generator.py
│   │   └── whisper_service.py
│   │
│   ├── templates/
│   │   ├── estimate_report.html
│   │   └── styles.css
│   │
│   ├── config/
│   │   ├── __init__.py
│   │   ├── settings.py
│   │   └── errors.py
│   │
│   └── tests/
│       ├── unit/
│       └── integration/
│
├── e2e/
│   ├── estimate-flow.spec.ts
│   └── playwright.config.ts
│
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
├── .env.local
└── .env.production
```

## FR to Architecture Mapping

| FR Range | Description | Architecture Components |
|----------|-------------|------------------------|
| FR1-4 | User Account | Existing Firebase Auth, `firestore.rules` |
| FR5-11 | Estimate Management | `estimateService.ts`, `useEstimateStore.ts`, Firestore `/estimates` |
| FR12-17 | CAD Upload | `CadUploader.tsx`, `cad_parser.py`, `vision_service.py` |
| FR18-22 | Voice Input | `useVoiceInput.ts`, `VoiceInput.tsx`, `whisper_service.py` |
| FR23-28 | Clarification Agent | `clarification_agent.py`, `ChatInterface.tsx` |
| FR29-36 | Plan Review | `PlanSection/`, `scope_agent.py` |
| FR37-41 | Location Intelligence | `location_agent.py`, `/costData/locationFactors` |
| FR42-47 | Cost Estimation | `cost_agent.py`, `cost_data_service.py` |
| FR48-52 | Risk Analysis | `risk_agent.py`, `monte_carlo.py`, `RiskAnalysis.tsx` |
| FR53-58 | Final Estimate | `final_agent.py`, `FinalEstimateSection/` |
| FR59-64 | PDF Output | `pdf_generator.py`, `templates/` |
| FR65-68 | Pipeline Visibility | `pipeline/`, `usePipelineStatus.ts`, `/agentOutputs` |
| FR69-73 | Feedback Loop | Firestore `/feedback` |
| FR74-78 | Data Management | Firestore, Firebase Storage |

## Technology Stack Details

### Core Technologies

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | React | 19.x | UI framework (existing) |
| Frontend | TypeScript | 5.x | Type safety (existing) |
| Frontend | Vite | 5.x | Build tool (existing) |
| Frontend | Tailwind CSS | 3.x | Styling (existing) |
| Frontend | shadcn/ui | 3.5.x | Component library (existing) |
| Frontend | Zustand | 4.x | State management (existing) |
| Backend | Python | 3.11+ | Cloud Functions runtime |
| Backend | Deep Agents | 0.2 | Agent orchestration |
| Backend | LangChain | 1.x | LLM integration |
| Backend | NumPy | latest | Monte Carlo simulation |
| Backend | WeasyPrint | latest | PDF generation |
| Backend | ezdxf | latest | DWG/DXF parsing |
| Database | Firestore | - | Document database |
| Storage | Firebase Storage | - | CAD file storage |
| Auth | Firebase Auth | - | Google OAuth (existing) |
| LLM | OpenAI GPT-4.1 | gpt-4.1 | Primary model (configurable) |
| LLM | OpenAI GPT-4o | gpt-4o | Vision for CAD images |
| LLM | OpenAI Whisper | whisper-1 | Voice transcription fallback |

### Integration Points

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React 19)                         │
│              Firebase SDK (Auth, Firestore, Storage)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS Callable + Firestore Listeners
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              PYTHON CLOUD FUNCTIONS (2nd Gen)                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Deep Agents Pipeline                    │    │
│  │  Clarification → CAD → Location → Scope → Cost → Risk → Final │
│  └─────────────────────────────────────────────────────────┘    │
│         │              │              │              │          │
│         ▼              ▼              ▼              ▼          │
│    ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐    │
│    │ OpenAI  │   │ Firestore│   │ Firebase │   │ WeasyPrint│   │
│    │ GPT-4.1 │   │  Writes  │   │ Storage  │   │   PDF    │    │
│    └─────────┘   └──────────┘   └──────────┘   └──────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Novel Pattern Designs

### 1. 7-Agent Deep Pipeline

Sequential pipeline with Firestore updates after each agent:

```python
AGENT_SEQUENCE = [
    ("clarification", ClarificationAgent),   # Project intake via conversation
    ("cad_analysis", CadAnalysisAgent),      # Extract measurements from CAD
    ("location", LocationAgent),              # Zip-code based data
    ("scope", ScopeAgent),                    # BoQ in CSI MasterFormat
    ("cost", CostAgent),                      # Material/labor/equipment costs
    ("risk", RiskAgent),                      # Monte Carlo simulation
    ("final", FinalAgent),                    # Synthesis + report
]

async def run_pipeline(state: PipelineState) -> PipelineState:
    for agent_name, agent_class in AGENT_SEQUENCE:
        await update_agent_status(estimate_id, agent_name, "running")
        output = await agent_class(model=get_llm_model()).run(state)
        state[f"{agent_name}_output"] = output
        await save_agent_output(estimate_id, agent_name, output)
        await update_agent_status(estimate_id, agent_name, "completed")
    return state
```

### 2. CAD-to-Estimate Pipeline

Hybrid extraction based on file type:

```python
async def extract_cad_data(file_url: str, file_type: str) -> ExtractionResult:
    if file_type in ["dwg", "dxf"]:
        # Programmatic extraction - 100% accuracy
        return await extract_with_ezdxf(file_url)
    else:
        # Vision LLM extraction - needs user verification
        return await extract_with_vision(file_url)
```

### 3. Probabilistic Estimation

Monte Carlo simulation with confidence intervals:

```python
def run_monte_carlo(line_items: list, iterations: int = 1000) -> MonteCarloResult:
    results = []
    for _ in range(iterations):
        total = sum(
            np.random.triangular(item.low, item.likely, item.high)
            for item in line_items
        )
        results.append(total)

    return MonteCarloResult(
        p50=np.percentile(results, 50),
        p80=np.percentile(results, 80),
        p90=np.percentile(results, 90),
        recommended_contingency=((p80 - p50) / p50) * 100
    )
```

## Implementation Patterns

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Python functions | snake_case | `start_estimate`, `run_pipeline` |
| Python classes | PascalCase | `ClarificationAgent`, `TrueCostError` |
| Python files | snake_case | `cad_parser.py`, `monte_carlo.py` |
| React components | PascalCase | `CadUploader.tsx`, `EstimateWizard.tsx` |
| React hooks | camelCase with use prefix | `useEstimate`, `usePipelineStatus` |
| Firestore collections | camelCase | `estimates`, `agentOutputs` |
| Firestore fields | camelCase | `estimateId`, `createdAt` |
| Environment variables | SCREAMING_SNAKE | `LLM_MODEL`, `OPENAI_API_KEY` |
| Error codes | SCREAMING_SNAKE | `CAD_PARSE_FAILED`, `AGENT_TIMEOUT` |

### Code Organization

```
# Python: One file per agent, shared services
functions/agents/clarification_agent.py
functions/services/firestore_service.py

# React: Feature folders with barrel exports
src/components/estimate/InputSection/index.ts
src/components/estimate/InputSection/CadUploader.tsx

# Tests: Separate folder mirroring source
functions/tests/unit/test_clarification_agent.py
```

### Error Handling

```python
class TrueCostError(Exception):
    def __init__(self, code: str, message: str, details: dict = None):
        self.code = code
        self.message = message
        self.details = details or {}

# Standard response format
{"success": True, "data": {...}}
{"success": False, "error": {"code": "...", "message": "...", "details": {...}}}
```

### Logging Strategy

```python
import structlog
logger = structlog.get_logger()

logger.info("agent_started", estimate_id=id, agent="clarification")
logger.info("agent_completed", estimate_id=id, agent="clarification", duration_ms=1234)
logger.error("agent_failed", estimate_id=id, agent="clarification", error=str(e))
```

## Data Architecture

### Firestore Schema

```
firestore/
├── users/{userId}
│   ├── profile: { name, company, defaultLocation }
│   └── settings: { ... }
│
├── estimates/{estimateId}
│   ├── userId, projectName, status, createdAt, updatedAt
│   ├── cadFileRef: "gs://bucket/cad/{estimateId}/file.pdf"
│   ├── extractedData: { rooms[], walls[], areas[], scale }
│   ├── projectBrief: { location, type, scope, finishes }
│   ├── billOfQuantities: { divisions[], lineItems[] }
│   ├── costEstimate: { materials, labor, equipment, totals }
│   ├── riskAnalysis: { p50, p80, p90, contingency, topRisks[] }
│   ├── finalEstimate: { summary, timeline, report }
│   ├── pipelineStatus: { currentAgent, completedAgents[], progress }
│   │
│   ├── /agentOutputs/{agentName}
│   │   └── { status, output, summary, confidence, tokensUsed, duration }
│   │
│   ├── /conversations/{messageId}
│   │   └── { role, content, timestamp }
│   │
│   └── /versions/{versionId}
│       └── { snapshot, createdAt, reason }
│
├── feedback/{feedbackId}
│   └── { estimateId, userId, actualCosts, variance, createdAt }
│
└── costData/                          # RSMeans-schema mock (STUB)
    ├── materials/{materialId}
    ├── laborRates/{rateId}
    └── locationFactors/{zipCode}
```

### Status Flows

**Estimate Status:**
```
"draft" → "clarifying" → "processing" → "plan_review" → "final" → "exported"
```

**Agent Status:**
```
"pending" → "running" → "completed"
               ↓
           "failed" → "retrying" → "completed" | "failed"
```

## API Contracts

### Callable Functions

```python
# Start new estimate
@https_fn.on_call()
def start_estimate(req):
    # Input: { projectDescription: str, cadFileUrl: str }
    # Output: { success: bool, data: { estimateId: str, status: str } }

# Send clarification message
@https_fn.on_call()
def send_clarification_message(req):
    # Input: { estimateId: str, message: str }
    # Output: { success: bool, data: { response: str, isComplete: bool } }

# Generate PDF
@https_fn.on_call()
def get_estimate_pdf(req):
    # Input: { estimateId: str, sections?: str[] }
    # Output: { success: bool, data: { pdfUrl: str } }
```

### Response Format

```python
# Success
{ "success": True, "data": { ... } }

# Error
{ "success": False, "error": { "code": "ERROR_CODE", "message": "...", "details": {} } }

# List
{ "success": True, "data": { "items": [...], "total": 42, "hasMore": True } }
```

## Security Architecture

### Authentication
- Firebase Auth with Google OAuth (existing)
- All Cloud Functions validate Firebase ID token
- No custom auth implementation

### Authorization
```javascript
// firestore.rules
match /estimates/{estimateId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

match /estimates/{estimateId}/agentOutputs/{agentId} {
  allow read: if request.auth.uid == get(/databases/$(database)/documents/estimates/$(estimateId)).data.userId;
}
```

### Data Protection
- All data encrypted in transit (TLS 1.3)
- Firestore encryption at rest
- API keys in Cloud Functions environment (never client-side)
- CAD files in private Storage bucket

## Performance Considerations

| Metric | Target | Approach |
|--------|--------|----------|
| Initial Load | < 3s | Existing Vite build optimization |
| CAD Upload + Parse | < 30s | Stream upload, async processing |
| Voice Transcription | < 3s | Web Speech API (instant), Whisper fallback |
| Agent Pipeline | < 5 min total | ~30-60s per agent, parallel where possible |
| PDF Generation | < 10s | WeasyPrint in Cloud Function |
| Real-time Updates | < 100ms | Firestore onSnapshot listeners |

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Firebase Hosting (CDN)                       │
│                    React SPA (Static Files)                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Cloud Functions (2nd Gen - Python)                │
│                    Auto-scaling, Managed                        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Firestore  │      │   Firebase   │      │   OpenAI     │
│   (NoSQL)    │      │   Storage    │      │   API        │
└──────────────┘      └──────────────┘      └──────────────┘
```

## Development Environment

### Prerequisites

- Node.js 20.x+
- Python 3.11+
- Firebase CLI (`npm install -g firebase-tools`)
- Google Cloud SDK (for emulators)

### Setup Commands

```bash
# Clone and install
git clone <repo>
cd truecost

# Frontend dependencies
npm install

# Python Cloud Functions
cd functions
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Environment setup
cp .env.example .env.local
# Edit .env.local with your API keys

# Start emulators
firebase emulators:start

# Start frontend dev server
npm run dev
```

### Environment Variables

```bash
# .env.local
LLM_MODEL=gpt-4.1
LLM_TEMPERATURE=0.1
OPENAI_API_KEY=sk-...
LANGSMITH_API_KEY=ls-...
LOG_LEVEL=INFO
ENABLE_VOICE_INPUT=true
ENABLE_WHISPER_FALLBACK=true
```

## Architecture Decision Records (ADRs)

### ADR-001: LangChain Deep Agents for Agent Orchestration
**Decision:** Use LangChain Deep Agents (`deepagents` library) for agent orchestration
**Context:** Need multi-agent pipeline with structured handoffs, planning, and context management
**Rationale:** 
- Built-in planning tool (`write_todos`) for task decomposition
- Native subagent spawning via `task` tool for context isolation
- File system tools (`ls`, `read_file`, `write_file`, `edit_file`) for context management
- Built on LangGraph with LangChain integration
- Perfect for complex multi-step tasks like cost estimation
**Implementation:** Install `deepagents>=0.2.0`, use `create_deep_agent()` for each agent
**Consequences:** Mixed language codebase (TypeScript frontend, Python backend)

### ADR-002: GPT-4.1 with Env Var Configuration
**Decision:** Default to GPT-4.1, configurable via LLM_MODEL env var
**Context:** Need reliable LLM for estimation logic
**Rationale:** Strong instruction following, 1M token context, easily swappable for testing/cost optimization
**Consequences:** OpenAI API dependency, can switch to Claude if needed

### ADR-003: Hybrid CAD Processing
**Decision:** ezdxf for DWG/DXF, GPT-4o Vision for PDF/images
**Context:** Need to extract measurements from multiple CAD formats
**Rationale:** Programmatic extraction is 100% accurate for vector formats, Vision LLM handles raster/PDF with user verification
**Consequences:** Two code paths, but optimal accuracy for each format

### ADR-004: Firestore for Agent State
**Decision:** Store agent state in Firestore with real-time listeners
**Context:** Need pipeline visibility and persistence
**Rationale:** Firebase-native, existing infrastructure, real-time updates to frontend
**Consequences:** Firestore cost scales with writes, but well within limits

### ADR-005: No Tier System for MVP
**Decision:** All users get full access, no pricing tiers
**Context:** Authentication extension decision
**Rationale:** KISS - focus on core estimation value, defer monetization
**Consequences:** Simpler implementation, revisit when adding paid features

---

_Generated by BMAD Decision Architecture Workflow v1.0_
_Date: 2025-12-09_
_For: xvanov_
