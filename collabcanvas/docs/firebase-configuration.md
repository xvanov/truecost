# Firebase Configuration & Secrets Management

This document explains how Firebase, environment variables, and secrets are configured in the TrueCost application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FIREBASE SECRETS MANAGER                      │
│                    (Single Source of Truth)                      │
│                                                                  │
│  OPENAI_API_KEY, SERP_API_KEY, AWS_ACCESS_KEY_ID,               │
│  AWS_SECRET_ACCESS_KEY, SAGEMAKER_ENDPOINT_NAME, AWS_REGION      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   Node.js Functions │         │   Python Functions  │
│   (collabcanvas/    │         │   (gauntletai/      │
│    functions/)      │         │    functions/)      │
│                     │         │                     │
│  secrets: [...]     │         │  config/secrets.py  │
│  in function config │         │  (Secret Manager    │
│                     │         │   SDK)              │
└─────────────────────┘         └─────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      .ENV FILES                                  │
│                 (Non-secrets only)                               │
│                                                                  │
│  - Emulator hosts/ports (FIRESTORE_EMULATOR_HOST)               │
│  - Feature flags (USE_FIREBASE_EMULATORS)                       │
│  - URLs (A2A_BASE_URL, VITE_FIREBASE_FUNCTIONS_URL)             │
│  - Non-sensitive config (LLM_MODEL, LOG_LEVEL)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Secrets Management

### Single Source of Truth: Firebase Secrets Manager

All API keys and credentials are stored in Firebase Secrets Manager. This applies to both:
- **Production deployments** (Cloud Functions)
- **Local emulator** (when functions declare `secrets: [...]`)

### Currently Configured Secrets

| Secret Name | Used By | How to Set |
|-------------|---------|------------|
| `OPENAI_API_KEY` | All AI functions (Node.js + Python) | `firebase functions:secrets:set OPENAI_API_KEY` |
| `SERP_API_KEY` | getHomeDepotPrice, comparePrices | `firebase functions:secrets:set SERP_API_KEY` |
| `BLS_API_KEY` | Bureau of Labor Statistics data | `firebase functions:secrets:set BLS_API_KEY` |
| `AWS_ACCESS_KEY_ID` | sagemakerInvoke | `firebase functions:secrets:set AWS_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | sagemakerInvoke | `firebase functions:secrets:set AWS_SECRET_ACCESS_KEY` |
| `SAGEMAKER_ENDPOINT_NAME` | sagemakerInvoke | `firebase functions:secrets:set SAGEMAKER_ENDPOINT_NAME` |
| `AWS_REGION` | sagemakerInvoke | `firebase functions:secrets:set AWS_REGION` |

### Managing Secrets

```bash
# Set a secret (you'll be prompted to enter the value)
firebase functions:secrets:set OPENAI_API_KEY

# View secret value (be careful - logs to console!)
firebase functions:secrets:access OPENAI_API_KEY

# List all secrets
firebase functions:secrets:list

# Destroy a secret
firebase functions:secrets:destroy OPENAI_API_KEY
```

## How Secrets Work

### Node.js Functions

Functions declare required secrets in their config:

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

**IMPORTANT**: When `secrets: [...]` is declared:
- **Production**: Firebase injects the secret from Secret Manager
- **Emulator**: Firebase ALSO pulls from Secret Manager (not from `.env.local`!)

### Python Functions

Python functions use the unified `config/secrets.py` module:

```python
# gauntletai/functions/config/secrets.py
from config.secrets import get_openai_api_key

api_key = get_openai_api_key()
```

This module:
- **Production**: Uses Google Cloud Secret Manager SDK
- **Emulator**: Falls back to environment variables

### Function to Secret Mapping

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
| `start_deep_pipeline` | OPENAI_API_KEY | main.py (Python) |
| All Python agents | OPENAI_API_KEY | main.py (Python) |

## Environment Variables (.env Files)

### What Goes in .env Files

Only **non-secret configuration**:
- Emulator hosts and ports
- Feature flags
- URLs for local development
- LLM model settings (non-secret)

### File Locations

| File | Purpose | Contains Secrets? |
|------|---------|-------------------|
| `collabcanvas/.env` | Frontend config (VITE_* vars) | NO |
| `collabcanvas/.env.production` | Production frontend overrides | NO |
| `collabcanvas/functions/.env` | Node.js functions notes | NO |
| `gauntletai/functions/.env` | Python functions config | NO |

### Frontend Environment Variables

```bash
# collabcanvas/.env

# Firebase Configuration (public, safe to commit)
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_PROJECT_ID=collabcanvas-dev
# ... other VITE_FIREBASE_* vars

# Emulator Configuration
VITE_USE_FIREBASE_EMULATORS=false  # Set to 'true' for local development

# Functions URL (for Python serve_local.py)
VITE_FIREBASE_FUNCTIONS_URL=http://localhost:5003/collabcanvas-dev/us-central1

# Google Maps (restricted API key, safe for frontend)
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
```

## Local Development

### Starting the Development Environment

**Terminal 1: Python Functions** (with secrets)
```bash
cd gauntletai/functions
source venv/bin/activate
export OPENAI_API_KEY='sk-proj-...'  # Get from Firebase Secrets or your OpenAI account
python serve_local.py
```

**Terminal 2: Firebase Emulators** (Node.js functions use Firebase Secrets automatically)
```bash
cd collabcanvas
firebase emulators:start
```

**Terminal 3: Frontend**
```bash
cd collabcanvas
VITE_USE_FIREBASE_EMULATORS=true npm run dev
```

### Getting Secrets for Local Development

For Python functions, you need to set secrets as environment variables. You can get the current values from Firebase:

```bash
# Get the current OPENAI_API_KEY value
firebase functions:secrets:access OPENAI_API_KEY

# Then export it
export OPENAI_API_KEY='<value from above>'
```

Node.js functions automatically get secrets from Firebase Secrets Manager even in emulator mode.

## Common Issues & Solutions

### Issue: 401 Unauthorized from OpenAI

**Cause**: Invalid or missing OPENAI_API_KEY

**Solution**:
1. Check the secret value: `firebase functions:secrets:access OPENAI_API_KEY`
2. Test if it's valid:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://api.openai.com/v1/models \
     -H "Authorization: Bearer <your-key>"
   ```
3. If invalid, update it: `firebase functions:secrets:set OPENAI_API_KEY`

### Issue: Python function can't find OPENAI_API_KEY

**Cause**: Environment variable not set for local development

**Solution**: Set the secret before running serve_local.py:
```bash
export OPENAI_API_KEY='sk-proj-...'
python serve_local.py
```

### Issue: CORS Error When Calling Function

**Possible Causes**:
1. Function not deployed (404 triggers CORS error)
2. Function crashed during initialization (secret not available)
3. Wrong URL (emulator vs production mismatch)

**Solution**:
```bash
# Check if function is deployed
firebase functions:list

# Check if secrets are set
firebase functions:secrets:list

# Redeploy if needed
firebase deploy --only functions:functionName
```

## Security Guidelines

### Never Store Secrets in:
- `.env` files (even gitignored ones)
- Source code
- Git history
- Frontend JavaScript (anything with VITE_* prefix is public!)

### Always Use:
- Firebase Secrets Manager for API keys and credentials
- Environment variables for non-secret configuration only
- `.env.example` files for documentation (with placeholder values)

### Environment Variable Naming

| Prefix | Purpose | Exposed to Browser? |
|--------|---------|---------------------|
| `VITE_*` | Frontend variables | YES (public) |
| No prefix | Backend/functions variables | NO |

## Deployment Checklist

Before deploying:

1. **Verify secrets are set**:
   ```bash
   firebase functions:secrets:list
   ```

2. **Build and deploy functions**:
   ```bash
   cd collabcanvas/functions && npm run build
   firebase deploy --only functions
   ```

3. **Deploy frontend**:
   ```bash
   cd collabcanvas && npm run build
   firebase deploy --only hosting
   ```

4. **Verify deployment**:
   ```bash
   firebase functions:list
   ```

## File Reference

| Path | Purpose |
|------|---------|
| `collabcanvas/.env` | Frontend config (VITE_* only) |
| `collabcanvas/.env.production` | Frontend production overrides |
| `collabcanvas/src/services/firebase.ts` | Firebase client initialization |
| `collabcanvas/functions/.env` | Node.js functions notes (no secrets) |
| `collabcanvas/functions/.env.example` | Template showing secret setup |
| `collabcanvas/functions/src/*.ts` | Cloud function implementations |
| `collabcanvas/firebase.json` | Firebase project config |
| `gauntletai/functions/.env` | Python functions config (no secrets) |
| `gauntletai/functions/.env.example` | Template showing secret setup |
| `gauntletai/functions/config/secrets.py` | Unified secret access module |
| `gauntletai/functions/config/settings.py` | Non-secret settings |
| `gauntletai/functions/serve_local.py` | Local Python server |
| `gauntletai/functions/main.py` | Python Cloud Functions |
