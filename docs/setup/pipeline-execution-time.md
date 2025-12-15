# Pipeline Execution Time & Long-Running Operations

## Execution Time Breakdown

Yes, the deep agent pipeline can take **5-15 minutes** to complete. Here's why:

### Time Breakdown (Estimated)

```
Total Pipeline: ~10 minutes (5-15 minute range)

┌─────────────────────────────────────────────────────────┐
│ Location Agent: ~1-2 minutes                            │
│  - LLM calls for analysis: 30-60s                       │
│  - Planning tool usage: 10-20s                          │
│  - Tool calls (cost data): 5-10s                        │
│  - Firestore operations: 2-5s                           │
│  - Validation: 20-30s                                    │
│  - Potential retry: +1-2 minutes                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Scope Agent: ~2-3 minutes                               │
│  - LLM calls for BoQ enrichment: 60-90s                  │
│  - Planning tool (CSI divisions): 20-30s                │
│  - Multiple tool calls: 30-60s                           │
│  - File system operations: 10-20s                        │
│  - Validation: 30-45s                                    │
│  - Potential retry: +2-3 minutes                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Cost Agent: ~2-3 minutes                                │
│  - LLM calls for cost calculations: 60-90s               │
│  - Planning tool: 20-30s                                 │
│  - Cost calculations: 30-60s                             │
│  - File system operations: 10-20s                        │
│  - Validation: 30-45s                                    │
│  - Potential retry: +2-3 minutes                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Risk Agent: ~2-3 minutes                                │
│  - Monte Carlo simulation: 30-60s                        │
│  - LLM calls for risk analysis: 60-90s                  │
│  - Planning tool: 20-30s                                 │
│  - Validation: 30-45s                                    │
│  - Potential retry: +2-3 minutes                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Final Agent: ~1-2 minutes                               │
│  - LLM calls for synthesis: 60-90s                      │
│  - Timeline generation: 20-30s                           │
│  - File system operations: 10-20s                        │
│  - Validation: 20-30s                                    │
│  - Potential retry: +1-2 minutes                         │
└─────────────────────────────────────────────────────────┘
```

### Factors Contributing to Execution Time

1. **LLM API Calls** (largest factor)
   - Each agent makes multiple LLM calls
   - Planning tool: 1-2 calls
   - Main processing: 2-5 calls
   - Tool calls: 1-3 calls each
   - Each call: 5-15 seconds
   - **Total per agent: 30-120 seconds**

2. **Validation** (after each agent)
   - Validator agent runs: 20-45 seconds
   - If retry needed: +1-3 minutes

3. **Tool Calls**
   - Cost data service calls: 1-5 seconds each
   - Firestore operations: 0.5-2 seconds each
   - File system operations: 0.1-1 second each

4. **Sequential Execution**
   - Agents run one at a time (by design)
   - Each waits for previous to complete
   - Total: Sum of all agent times

## Architecture for Long-Running Operations

### 1. Cloud Functions 2nd Gen (Required)

**Why**: Standard Cloud Functions have 9-minute timeout. 2nd gen supports up to 60 minutes.

```python
# functions/main.py
from firebase_functions import https_fn, options

@https_fn.on_call(
    timeout_sec=540,  # 9 minutes (max for 1st gen)
    memory=options.MemoryOption.MB_512
)
def start_deep_pipeline_1st_gen(req):
    """1st gen - 9 minute limit (not enough!)"""
    pass

# Use 2nd gen for longer timeouts
from firebase_functions.v2 import https

@https.on_call(
    timeout_sec=3600,  # 60 minutes (2nd gen)
    memory=1024  # 1GB
)
def start_deep_pipeline(req):
    """2nd gen - supports up to 60 minutes"""
    pass
```

### 2. Async/Fire-and-Forget Pattern

**Critical**: Don't wait for pipeline to complete in the Cloud Function!

```python
# ❌ BAD - Blocks for 10 minutes
@https.on_call()
def start_deep_pipeline(req):
    result = await orchestrator.run_pipeline(...)  # Waits 10 minutes!
    return {"success": True, "data": result}

# ✅ GOOD - Starts pipeline, returns immediately
@https.on_call()
def start_deep_pipeline(req):
    # Start pipeline asynchronously
    asyncio.create_task(orchestrator.run_pipeline(...))
    
    # Return immediately
    return {
        "success": True,
        "data": {
            "estimateId": estimate_id,
            "status": "processing",
            "message": "Pipeline started. Check status via get_pipeline_status."
        }
    }
```

### 3. Progress Tracking via Firestore

**Frontend listens to Firestore for real-time updates:**

```python
# Orchestrator updates Firestore as it progresses
async def run_pipeline(self, estimate_id: str, clarification_output: dict):
    # Update status every step
    await self.firestore.update_estimate(estimate_id, {
        "pipelineStatus": {
            "currentAgent": "location",
            "progress": 0,
            "status": "processing"
        }
    })
    
    # After each agent
    await self.firestore.update_estimate(estimate_id, {
        "pipelineStatus": {
            "currentAgent": "scope",
            "progress": 20,  # 20% complete
            "completedAgents": ["location"]
        }
    })
```

```typescript
// Frontend listens for updates
useEffect(() => {
  const unsubscribe = onSnapshot(
    doc(db, 'estimates', estimateId),
    (snapshot) => {
      const data = snapshot.data();
      setProgress(data?.pipelineStatus?.progress || 0);
      setCurrentAgent(data?.pipelineStatus?.currentAgent);
      setStatus(data?.status);
    }
  );
  
  return () => unsubscribe();
}, [estimateId]);
```

## Optimization Strategies

### 1. Parallel Validation (Future)

Currently: Agent → Validate → Next Agent

Future optimization: Validate while next agent starts (if safe)

```python
# Future: Parallel validation
agent_result = await agent.run(...)
next_agent_task = asyncio.create_task(next_agent.run(...))  # Start early
validation_result = await validator.validate(...)  # Validate in parallel

if not validation_result.passed:
    # Cancel next agent, retry current
    next_agent_task.cancel()
    agent_result = await agent.run(..., feedback=...)
```

### 2. Caching

```python
# Cache location factors by zip code
@lru_cache(maxsize=1000)
def get_location_factors_cached(zip_code: str):
    return get_location_factors(zip_code)
```

### 3. Batch Operations

```python
# Batch Firestore writes
batch = firestore.batch()
for update in updates:
    batch.update(ref, update)
await batch.commit()  # Single write operation
```

### 4. Optimize LLM Calls

```python
# Use streaming for faster perceived response
# Use lower temperature for faster generation
# Use smaller models for simple tasks
```

## Frontend Handling

### Progress UI Component

```typescript
// components/pipeline/PipelineProgress.tsx
export function PipelineProgress({ estimateId }: { estimateId: string }) {
  const [progress, setProgress] = useState(0);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [status, setStatus] = useState<'processing' | 'complete' | 'failed'>('processing');
  
  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'estimates', estimateId),
      (snapshot) => {
        const data = snapshot.data();
        setProgress(data?.pipelineStatus?.progress || 0);
        setCurrentAgent(data?.pipelineStatus?.currentAgent);
        setStatus(data?.status);
      }
    );
    
    return () => unsubscribe();
  }, [estimateId]);
  
  return (
    <div>
      <ProgressBar value={progress} />
      <p>Current: {currentAgent}</p>
      <p>Status: {status}</p>
      {status === 'processing' && (
        <p>Estimated time remaining: {estimateTimeRemaining(progress)}</p>
      )}
    </div>
  );
}
```

### User Experience

1. **Start Pipeline**: User clicks "Generate Estimate"
2. **Immediate Feedback**: "Pipeline started, this may take 5-15 minutes"
3. **Progress Updates**: Real-time progress bar via Firestore listener
4. **Agent Status**: Show which agent is currently running
5. **Completion**: Auto-navigate to results when complete

## Time Estimates by Complexity

### Simple Project (Kitchen Remodel)
- **Location**: 1 minute
- **Scope**: 1.5 minutes
- **Cost**: 2 minutes
- **Risk**: 1.5 minutes
- **Final**: 1 minute
- **Total**: ~7 minutes

### Complex Project (Full House Renovation)
- **Location**: 2 minutes
- **Scope**: 3 minutes (many CSI divisions)
- **Cost**: 3 minutes (many line items)
- **Risk**: 3 minutes (complex simulation)
- **Final**: 2 minutes
- **Total**: ~13 minutes

### With Retries
- Add 1-3 minutes per retry
- Maximum: ~20 minutes (if multiple agents need retries)

## Monitoring & Alerts

```python
# Log execution time
import time

start_time = time.time()
result = await agent.run(...)
duration = time.time() - start_time

logger.info("agent_completed", {
    "agent": "location",
    "duration_seconds": duration,
    "estimate_id": estimate_id
})

# Alert if taking too long
if duration > 300:  # 5 minutes
    logger.warning("agent_slow", {
        "agent": "location",
        "duration": duration
    })
```

## Summary

**Yes, 10 minutes is correct!**

- **5-15 minutes** typical execution time
- **Cloud Functions 2nd gen** required (60-minute timeout)
- **Async/fire-and-forget** pattern (don't block)
- **Firestore listeners** for real-time progress
- **Progress UI** shows current agent and percentage
- **Optimization** possible but not critical for MVP

The key is:
1. ✅ Start pipeline asynchronously
2. ✅ Return immediately to user
3. ✅ Frontend listens to Firestore for updates
4. ✅ Show progress in real-time
5. ✅ Auto-update when complete




