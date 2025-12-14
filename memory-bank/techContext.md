# TrueCost - Technical Context

## Technology Stack

### Frontend (Existing CollabCanvas - Extend)

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool |
| Tailwind CSS | 3.x | Styling |
| shadcn/ui | 3.5.x | Component library |
| Zustand | 4.x | State management |

### Backend (New Python Cloud Functions)

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Cloud Functions runtime (local dev validated on Python 3.12 as well) |
| LangChain | 1.x | LLM integration & tool framework |
| Deep Agents | 0.2.0+ | Agent orchestration with planning, file system, subagents |
| LangGraph | 0.2.0+ | Graph execution (used by Deep Agents) |
| **A2A Protocol** | - | Inter-agent communication (JSON-RPC 2.0) |
| httpx | 0.25.0+ | Async HTTP client for A2A |
| NumPy | latest | Monte Carlo simulation |
| WeasyPrint | latest | PDF generation |
| ezdxf | latest | DWG/DXF parsing |
| structlog | latest | Structured logging |

### Firebase Ecosystem

| Service | Purpose |
|---------|---------|
| Firebase Auth | Google OAuth (existing) |
| Cloud Firestore | Document database |
| Firebase Storage | CAD file storage |
| Cloud Functions | Agent orchestration |
| Firebase Hosting | Static assets (CDN) |

### LLM Integration

| Model | Purpose |
|-------|---------|
| OpenAI GPT-4.1 | Primary agent model (configurable via `LLM_MODEL`) |
| OpenAI GPT-4o | Vision for CAD images |
| OpenAI Whisper | Voice transcription fallback |

## Project Structure

```
truecost/
├── collabcanvas/              # Existing frontend + TypeScript Cloud Functions
│   ├── src/                   # React frontend (extend for TrueCost UI)
│   ├── functions/             # Existing TypeScript Cloud Functions
│   │   └── src/               # aiCommand, pricing, estimatePipelineOrchestrator, etc.
│   ├── firebase.json
│   └── firestore.rules
│
├── functions/                 # NEW: Python Cloud Functions for Deep Agents
│   ├── main.py                # Entry points + A2A endpoints
│   ├── requirements.txt
│   ├── pipeline_dashboard.html # Local/makeshift HTML dashboard for pipeline runs
│   ├── agents/
│   │   ├── base_agent.py           # A2A-compatible base class
│   │   ├── agent_cards.py          # A2A Agent Cards registry
│   │   ├── orchestrator.py         # A2A pipeline orchestration
│   │   ├── clarification_agent.py  # Dev 3 owns
│   │   ├── cad_analysis_agent.py   # Dev 3 owns
│   │   ├── location_agent.py       # Dev 2 owns
│   │   ├── scope_agent.py          # Dev 2 owns
│   │   ├── cost_agent.py           # Dev 2 owns
│   │   ├── risk_agent.py           # Dev 2 owns
│   │   └── final_agent.py          # Dev 2 owns
│   ├── services/
│   │   ├── firestore_service.py
│   │   ├── storage_service.py
│   │   ├── a2a_client.py           # A2A protocol client
│   │   ├── cad_parser.py           # Dev 3 owns
│   │   ├── vision_service.py       # Dev 3 owns
│   │   ├── cost_data_service.py    # Dev 4 owns
│   │   ├── monte_carlo.py          # Dev 4 owns
│   │   ├── pdf_generator.py        # Dev 4 owns
│   │   └── whisper_service.py      # Dev 3 owns
│   ├── templates/
│   │   ├── estimate_report.html
│   │   └── styles.css
│   └── config/
│       ├── settings.py
│       └── errors.py
│
└── docs/                      # Documentation
```

## Post-Merge Integration (Epic 6) - Key Runtime Links

### Pipeline Trigger + Progress

- **Trigger (frontend → TS callable)**: `collabcanvas/src/services/pipelineService.ts` → callable `triggerEstimatePipeline`
- **TS callable orchestrator**: `collabcanvas/functions/src/estimatePipelineOrchestrator.ts`
  - Writes `/projects/{projectId}/pipeline/status` and `/projects/{projectId}/pipeline/context`
  - Calls Python `start_deep_pipeline` and passes `projectId`
- **Python pipeline UI sync**: `functions/services/firestore_service.py::sync_to_project_pipeline()`
  - Writes progress back to `/projects/{projectId}/pipeline/status`

### PDF Export (Epic 4)

- Frontend wrapper: `collabcanvas/src/services/pdfService.ts` → callable `generate_pdf`

### User-Selected Cost Defaults (Scope Definition → Pipeline Input)

The UI can provide cost defaults in the ClarificationOutput JSON (used by Python pipeline):

- `projectBrief.costPreferences.overheadPct`
- `projectBrief.costPreferences.profitPct`
- `projectBrief.costPreferences.contingencyPct`
- `projectBrief.costPreferences.wasteFactor`

## Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4.1              # Configurable
LLM_TEMPERATURE=0.1

# Optional (recommended)
# Monte Carlo iterations used by the Risk Agent. Higher = smoother percentiles but slower.
MONTE_CARLO_ITERATIONS=10000

# Optional
LANGSMITH_API_KEY=ls-...       # For observability
LOG_LEVEL=INFO
ENABLE_VOICE_INPUT=true
ENABLE_WHISPER_FALLBACK=true
```

## Development Setup

```bash
# Frontend dependencies (existing)
cd collabcanvas
npm install

# Python Cloud Functions (new)
cd functions
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start emulators
firebase emulators:start

# Optional: open the local dashboard
# functions/pipeline_dashboard.html (served by any static server)

# Start frontend dev server
cd collabcanvas
npm run dev
```

## Firebase Configuration

- **Emulator Ports**:
  - Auth: 9099
  - Functions: 5001
  - Firestore: 8081
  - Storage: 9199
  - UI: 4000

- **Existing TypeScript Functions**: Located in `collabcanvas/functions/` (aiCommand, pricing, etc.)
- **New Python Functions**: Will be in `functions/` at project root

## Dependencies to Add (Epic 2)

```txt
# requirements.txt for functions/
firebase-admin>=6.0.0
firebase-functions>=0.4.0
openai>=1.0.0
langchain>=0.1.0
langchain-openai>=0.1.0
langgraph>=0.2.0
deepagents>=0.2.0
httpx>=0.25.0            # A2A protocol HTTP client
numpy>=1.24.0
structlog>=23.0.0
pydantic>=2.0.0
python-dotenv>=1.0.0
pytest>=7.0.0
pytest-asyncio>=0.21.0
```

## Technical Constraints

1. **Firebase Ecosystem First**: All backend in Firebase where possible
2. **No New Infrastructure**: Avoid unnecessary tech stacks
3. **Python 2nd Gen Functions**: For agent orchestration (longer timeouts)
4. **Firestore Real-time**: Use onSnapshot for UI updates
5. **API Keys in Functions**: Never expose to client

