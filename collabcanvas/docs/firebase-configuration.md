# Firebase Configuration & Secrets Management

This document explains how Firebase, environment variables, and secrets are configured in the TrueCost application. Understanding this architecture is crucial for debugging CORS errors, authentication issues, and deployment problems.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/Vite)                         │
│                                                                         │
│  src/services/firebase.ts                                               │
│  ├── Reads VITE_* env vars from .env                                    │
│  ├── Connects to emulators OR production based on flags                 │
│  └── Exports: auth, firestore, rtdb, functions, storage                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│   EMULATOR MODE             │     │   PRODUCTION MODE           │
│   (localhost)               │     │   (Firebase Cloud)          │
├─────────────────────────────┤     ├─────────────────────────────┤
│ Auth:      localhost:9099   │     │ Auth:      Firebase Auth    │
│ Firestore: localhost:8081   │     │ Firestore: Cloud Firestore  │
│ RTDB:      localhost:9000   │     │ RTDB:      Cloud RTDB       │
│ Functions: localhost:5001   │     │ Functions: Cloud Functions  │
│ Storage:   localhost:9199   │     │ Storage:   Cloud Storage    │
└─────────────────────────────┘     └─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     CLOUD FUNCTIONS (Node.js)                           │
│                     collabcanvas/functions/                             │
│                                                                         │
│  Emulator: Reads from .env.local (secrets) + .env (non-secrets)         │
│  Production: Uses Firebase Secrets (injected as process.env)            │
│                                                                         │
│  Functions: clarificationAgent, comparePrices, aiCommand,               │
│             materialEstimateCommand, getHomeDepotPrice, etc.            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     PYTHON FUNCTIONS (Flask)                            │
│                     gauntletai/functions/                               │
│                                                                         │
│  Local: serve_local.py on port 5003 (separate from Firebase emulator)   │
│  Production: Deployed to Cloud Functions (python312 runtime)            │
│                                                                         │
│  Functions: start_deep_pipeline, generate_pdf, a2a_* agents             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Environment Variables

### Frontend (.env files in collabcanvas/)

| File | Purpose | Committed to Git? |
|------|---------|-------------------|
| `.env` | Default config, used in development | Yes |
| `.env.production` | Production overrides | Yes |
| `.env.local` | Local overrides (not used currently) | No |

**Frontend Environment Variables:**

```bash
# Firebase Project Configuration (required)
VITE_FIREBASE_API_KEY=AIzaSy...          # Firebase API key (public, safe to commit)
VITE_FIREBASE_AUTH_DOMAIN=project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=collabcanvas-dev
VITE_FIREBASE_STORAGE_BUCKET=project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123

# Emulator Configuration
VITE_USE_FIREBASE_EMULATORS=false        # Master switch for ALL emulators
VITE_USE_AUTH_EMULATOR=<not set>         # Override: set to 'false' to disable
VITE_USE_FUNCTIONS_EMULATOR=<not set>    # Override: set to 'false' to disable
VITE_USE_FIRESTORE_EMULATOR=<not set>    # Override: set to 'false' to disable

# Python Functions URL (for deep pipeline)
VITE_PYTHON_FUNCTIONS_URL=http://127.0.0.1:5003/collabcanvas-dev/us-central1

# Google Maps (for address autocomplete)
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
```

**Emulator Flag Logic (src/services/firebase.ts):**

```typescript
// Master switch enables all emulators
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true';

// Individual flags can DISABLE specific emulators (default: enabled if master is on)
const useAuthEmulator = import.meta.env.VITE_USE_AUTH_EMULATOR !== 'false' && useEmulators;
const useFunctionsEmulator = import.meta.env.VITE_USE_FUNCTIONS_EMULATOR !== 'false' && useEmulators;
const useFirestoreEmulator = import.meta.env.VITE_USE_FIRESTORE_EMULATOR !== 'false' && useEmulators;
```

### Node.js Functions (.env files in collabcanvas/functions/)

| File | Purpose | Committed to Git? |
|------|---------|-------------------|
| `.env` | Non-secret config (deployed with functions) | No (.gitignore) |
| `.env.local` | Secret values for emulator | No (.gitignore) |

**Functions Environment Variables:**

```bash
# .env (non-secrets, but still gitignored for safety)
SERP_API_KEY=...           # SerpAPI for pricing (also in .env.local)
UNWRANGLE_API_KEY=...      # Unwrangle API
BLS_API_KEY=...            # Bureau of Labor Statistics

# .env.local (secrets for local development)
OPENAI_API_KEY=sk-proj-... # OpenAI API key
SERP_API_KEY=...           # Duplicate here for emulator
```

**Important:** Firebase Functions emulator automatically loads `.env.local` first, then `.env`. In production, secrets are injected via Firebase Secrets.

### Python Functions (.env in gauntletai/functions/)

```bash
# .env
OPENAI_API_KEY=sk-proj-...
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081  # Set by serve_local.py
```

## Firebase Secrets (Production)

Firebase Secrets are used for sensitive values in deployed Cloud Functions. They are NOT stored in code or .env files.

### Currently Configured Secrets

| Secret Name | Used By | How to Set |
|-------------|---------|------------|
| `OPENAI_API_KEY` | All AI functions | `firebase functions:secrets:set OPENAI_API_KEY` |
| `SERP_API_KEY` | getHomeDepotPrice, comparePrices | `firebase functions:secrets:set SERP_API_KEY` |
| `AWS_ACCESS_KEY_ID` | sagemakerInvoke | `firebase functions:secrets:set AWS_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | sagemakerInvoke | `firebase functions:secrets:set AWS_SECRET_ACCESS_KEY` |
| `SAGEMAKER_ENDPOINT_NAME` | sagemakerInvoke | `firebase functions:secrets:set SAGEMAKER_ENDPOINT_NAME` |
| `AWS_REGION` | sagemakerInvoke | `firebase functions:secrets:set AWS_REGION` |

### Managing Secrets

```bash
# Set a secret
firebase functions:secrets:set OPENAI_API_KEY --project collabcanvas-dev

# View secret value (be careful!)
firebase functions:secrets:access OPENAI_API_KEY --project collabcanvas-dev

# List all secrets
firebase functions:secrets:list --project collabcanvas-dev

# Destroy a secret
firebase functions:secrets:destroy OPENAI_API_KEY --project collabcanvas-dev
```

### How Secrets Work in Functions

Each function declares which secrets it needs:

```typescript
// collabcanvas/functions/src/clarificationAgent.ts
export const clarificationAgent = onCall({
  cors: true,
  secrets: ['OPENAI_API_KEY'],  // <-- Declares required secret
  timeoutSeconds: 60,
}, async (request) => {
  // Secret is available as process.env.OPENAI_API_KEY
  const apiKey = process.env.OPENAI_API_KEY;
});
```

**In Emulator:** Value comes from `functions/.env.local`
**In Production:** Value is injected by Firebase from Secret Manager

## Cloud Functions Configuration

### Function → Secret Mapping

| Function | Secrets | File |
|----------|---------|------|
| `aiCommand` | OPENAI_API_KEY | aiCommand.ts |
| `clarificationAgent` | OPENAI_API_KEY | clarificationAgent.ts |
| `materialEstimateCommand` | OPENAI_API_KEY | materialEstimateCommand.ts |
| `annotationCheckAgent` | OPENAI_API_KEY | annotationCheckAgent.ts |
| `estimationPipeline` | OPENAI_API_KEY | estimationPipeline.ts |
| `getHomeDepotPrice` | SERP_API_KEY | pricing.ts |
| `comparePrices` | OPENAI_API_KEY, SERP_API_KEY | priceComparison.ts |
| `sagemakerInvoke` | AWS_* (4 secrets) | sagemakerInvoke.ts |
| `triggerEstimatePipeline` | (none) | estimatePipelineOrchestrator.ts |
| `updatePipelineStage` | (none) | estimatePipelineOrchestrator.ts |

### CORS Configuration

All functions use `cors: true` which allows requests from any origin. This is handled by Firebase Functions v2 automatically for `onCall` functions.

```typescript
export const myFunction = onCall({
  cors: true,  // Allows all origins
  // ...
}, async (request) => { ... });
```

**CORS Errors Usually Mean:**
1. Function is not deployed (404 → CORS error)
2. Function crashed during initialization (secret not available)
3. Wrong URL (emulator vs production mismatch)

## Common Issues & Solutions

### Issue: CORS Error When Calling Function

**Symptoms:**
```
Access to fetch at 'https://...cloudfunctions.net/functionName' blocked by CORS policy
```

**Causes & Solutions:**

1. **Function not deployed:**
   ```bash
   firebase functions:list --project collabcanvas-dev
   # If function not listed, deploy it:
   firebase deploy --only functions:functionName
   ```

2. **Secret not configured:**
   ```bash
   # Check if secret exists
   firebase functions:secrets:access OPENAI_API_KEY --project collabcanvas-dev
   # If error, set it:
   firebase functions:secrets:set OPENAI_API_KEY
   ```

3. **Emulator mismatch:**
   - Frontend using emulator but functions not running
   - Check `VITE_USE_FIREBASE_EMULATORS` matches your setup

### Issue: "Secret environment variable overlaps non secret"

**Cause:** Same variable in both `.env` and `secrets: [...]` declaration

**Solution:** Remove the variable from `.env`, keep only in `.env.local` for emulator

### Issue: Firestore Internal Assertion Error

**Symptoms:**
```
FIRESTORE (12.4.0) INTERNAL ASSERTION FAILED: Unexpected state
```

**Cause:** Hot Module Replacement (HMR) trying to connect emulator twice

**Solution:** The code has a guard (`window.__FIREBASE_EMULATORS_CONNECTED__`). Do a full page refresh if it occurs.

### Issue: Python Functions Not Responding

**Cause:** `serve_local.py` not running

**Solution:**
```bash
cd gauntletai/functions
source venv/bin/activate
python serve_local.py  # Must be running on port 5003
```

## Security Guidelines

### Never Log Secrets

```typescript
// BAD - leaks partial key
console.log(`Using API key: ${apiKey.substring(0, 10)}...`);

// GOOD - only indicates presence
console.log(`API key configured: ${apiKey ? 'YES' : 'NO'}`);
```

### Gitignore Patterns

Ensure these are in `.gitignore`:

```
# collabcanvas/functions/.gitignore
.env
.env.local
*.local

# collabcanvas/.gitignore (root)
.env.local
```

### Environment Variable Naming

- `VITE_*` - Frontend variables (exposed to browser, use only for public config)
- `OPENAI_API_KEY`, `SERP_API_KEY`, etc. - Backend secrets (never prefix with VITE_)

## Deployment Checklist

Before deploying functions:

1. **Verify secrets are set:**
   ```bash
   firebase functions:secrets:list --project collabcanvas-dev
   ```

2. **Build functions:**
   ```bash
   cd collabcanvas/functions && npm run build
   ```

3. **Deploy:**
   ```bash
   firebase deploy --only functions
   ```

4. **Verify deployment:**
   ```bash
   firebase functions:list --project collabcanvas-dev
   ```

5. **Test a function:**
   ```bash
   # From browser console or app
   # Should not get CORS error
   ```

## File Reference

| Path | Purpose |
|------|---------|
| `collabcanvas/.env` | Frontend config |
| `collabcanvas/.env.production` | Frontend production overrides |
| `collabcanvas/src/services/firebase.ts` | Firebase client initialization |
| `collabcanvas/functions/.env` | Functions non-secret config |
| `collabcanvas/functions/.env.local` | Functions secrets (emulator) |
| `collabcanvas/functions/src/*.ts` | Cloud function implementations |
| `collabcanvas/firebase.json` | Firebase project config, emulator ports |
| `gauntletai/functions/.env` | Python functions config |
| `gauntletai/functions/serve_local.py` | Local Python server |
| `gauntletai/functions/main.py` | Python Cloud Functions |
