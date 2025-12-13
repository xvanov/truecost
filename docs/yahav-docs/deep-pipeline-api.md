# Deep Pipeline API (TrueCost)

API surface for orchestrating the Deep Agent Pipeline (Location → Scope → Cost → Risk → Timeline → Final) plus per-agent A2A endpoints. All endpoints require Firebase Authentication (ID token).

## Base
- Emulator: `http://127.0.0.1:5001/<project-id>/<region>/`
- Prod: Cloud Functions HTTPS base (per Firebase config)
- Content-Type: `application/json`

## Pipeline Entry Points

### `start_deep_pipeline` (POST)
Starts the full pipeline asynchronously.

**Body**
```json
{
  "estimateId": "string",          // existing estimate doc ID
  "clarificationOutput": { ... }   // v3.0.0 payload from Dev 3
}
```

**Success**
```json
{ "success": true, "data": { "estimateId": "abc123", "status": "processing" } }
```

**Errors**
- `VALIDATION_ERROR` — clarificationOutput missing/invalid
- `AGENT_ERROR` — orchestration failure
- `AUTH_REQUIRED` — missing/invalid token

**Notes**
- Returns immediately; pipeline progress is tracked in Firestore at `estimates/{id}.pipelineStatus`.

### `get_pipeline_status` (GET)
Retrieves current pipeline status.

**Query**: `estimateId`

**Success**
```json
{
  "success": true,
  "data": {
    "status": "processing" | "final" | "failed",
    "currentAgent": "scope",
    "progress": 42,
    "completedAgents": ["location"]
  }
}
```

### `delete_estimate` (POST/DELETE)
Deletes an estimate and subcollections (`agentOutputs`, `conversations`, `versions`).

**Body**
```json
{ "estimateId": "abc123" }
```

**Success**
```json
{ "success": true, "data": { "estimateId": "abc123", "deleted": true } }
```

**Errors**
- `AUTH_REQUIRED`
- `FORBIDDEN` — non-owner

## A2A Agent Endpoints (JSON-RPC 2.0)
All under Cloud Functions HTTPS; one per agent and role (primary/scorer/critic). `estimateId` is used as `thread_id`.

### Naming
- Primary: `a2a_{agent}` e.g., `a2a_location`
- Scorer: `a2a_{agent}_scorer`
- Critic: `a2a_{agent}_critic`

### Request Shape
```json
{
  "jsonrpc": "2.0",
  "id": "task-123",
  "method": "run",
  "params": {
    "estimate_id": "abc123",
    "input_data": { ... },   // agent-specific input
    "feedback": { ... }      // optional critic feedback for retries
  }
}
```

### Response Shape
```json
{
  "jsonrpc": "2.0",
  "id": "task-123",
  "result": {
    "status": "completed",
    "output": { ... },          // agent-specific output
    "summary": "short headline",
    "confidence": 0.9,
    "tokens_used": 1234,
    "duration_ms": 2500
  }
}
```

## Firestore Contracts (snapshot)
- `estimates/{estimateId}`: owner-only access
  - `pipelineStatus`: `{ currentAgent, completedAgents[], progress }`
  - `locationOutput`, `scopeOutput`, `costOutput`, `riskOutput`, `timelineOutput`, `finalOutput`
  - Subcollections:
    - `agentOutputs/{agent}`: `{ status, output, summary, confidence, tokensUsed, duration }`
    - `conversations/{messageId}`: chat history for the estimate
    - `versions/{versionId}`: snapshot history

## Auth
- Firebase ID token required for all endpoints.
- Firestore rules enforce owner-only access to `estimates` and subcollections; agentOutputs writable only while status is in mutable phases (draft/clarifying/processing/plan_review).

## Error Codes
- `AUTH_REQUIRED`
- `VALIDATION_ERROR`
- `AGENT_ERROR`
- `PIPELINE_ERROR`
- `FORBIDDEN`
- `NOT_FOUND`

## Operational Notes
- Use emulator for local QA (ports per firebase.json).
- Long-running pipeline (5–15 min); rely on Firestore listeners for progress instead of polling HTTP.



