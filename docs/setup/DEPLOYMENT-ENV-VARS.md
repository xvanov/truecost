# Deployment Environment Variables Guide

## Overview

Environment configuration is split into two categories:

1. **Frontend (Vite)** - Set in `.env.production` file (baked into build)
2. **Backend Secrets (Cloud Functions)** - Stored in **Firebase Secrets Manager**

---

## 1. Frontend Environment Variables

### Location: `.env.production` file in `collabcanvas/` directory

Create or update `.env.production` with your Firebase config:

```bash
# Production Firebase Configuration (public config - safe to commit)
VITE_FIREBASE_API_KEY=your-production-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-production-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-production-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-production-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-production-messaging-sender-id
VITE_FIREBASE_APP_ID=your-production-app-id
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com

# IMPORTANT: Set to false for production
VITE_USE_FIREBASE_EMULATORS=false

# Google Maps (restricted API key - safe for frontend)
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### How to Get Firebase Config Values:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click the gear icon → **Project Settings**
4. Scroll down to **"Your apps"** section
5. Click on your web app (or create one if needed)
6. Copy the config values from the `firebaseConfig` object

---

## 2. Backend Secrets (Cloud Functions)

### Location: Firebase Secrets Manager (NOT .env files)

All API keys and credentials for Cloud Functions are stored in Firebase Secrets Manager. This is the **single source of truth** for both Node.js and Python functions.

### Required Secrets

| Secret Name | Used By | How to Get |
|-------------|---------|------------|
| `OPENAI_API_KEY` | AI functions, estimation pipeline | [OpenAI Platform](https://platform.openai.com/api-keys) |
| `SERP_API_KEY` | Pricing functions (Home Depot prices) | [SerpAPI Dashboard](https://serpapi.com/dashboard) |
| `BLS_API_KEY` | Labor statistics data | [BLS API Registration](https://data.bls.gov/registrationEngine/) |
| `AWS_ACCESS_KEY_ID` | SageMaker integration | AWS Console |
| `AWS_SECRET_ACCESS_KEY` | SageMaker integration | AWS Console |

### How to Set Secrets

```bash
# Set a secret (you'll be prompted for the value)
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set SERP_API_KEY
firebase functions:secrets:set BLS_API_KEY

# View a secret value (be careful - logs to console!)
firebase functions:secrets:access OPENAI_API_KEY

# List all configured secrets
firebase functions:secrets:list

# Delete a secret
firebase functions:secrets:destroy OPENAI_API_KEY
```

### Important Notes

- **Emulator mode**: Node.js functions pull secrets from Firebase Secrets Manager even in emulator mode
- **Python functions**: For local development, set secrets as environment variables before running `serve_local.py`
- **Never store secrets in .env files** - They should only contain non-secret configuration

---

## 3. Deployment Steps

### Step 1: Set Frontend Variables

```bash
cd collabcanvas
# Create/update .env.production file with Firebase config (see above)
```

### Step 2: Set Backend Secrets

```bash
# Set all required secrets
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set SERP_API_KEY

# Verify
firebase functions:secrets:list
```

### Step 3: Build and Deploy

```bash
# Build frontend with production env vars
npm run build

# Deploy security rules
firebase deploy --only firestore:rules,database:rules

# Deploy Cloud Functions (will use configured secrets)
cd functions && npm run build && cd ..
firebase deploy --only functions

# Deploy frontend
firebase deploy --only hosting
```

---

## Quick Checklist

### Frontend (`.env.production`):
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_DATABASE_URL`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_USE_FIREBASE_EMULATORS=false`
- [ ] `VITE_GOOGLE_MAPS_API_KEY`

### Backend (Firebase Secrets Manager):
- [ ] `OPENAI_API_KEY` - Run: `firebase functions:secrets:set OPENAI_API_KEY`
- [ ] `SERP_API_KEY` - Run: `firebase functions:secrets:set SERP_API_KEY`
- [ ] `BLS_API_KEY` (optional) - Run: `firebase functions:secrets:set BLS_API_KEY`

---

## Verification

After deployment, verify:

1. **Frontend**: Check browser console - should see Firebase initialized (no emulator warnings)
2. **Functions**: Check Functions logs in Firebase Console for successful secret loading
3. **Test API calls**: Verify AI and pricing features work correctly

---

## Troubleshooting

### Functions can't access secrets

```bash
# Check if secrets are set
firebase functions:secrets:list

# If missing, set them
firebase functions:secrets:set OPENAI_API_KEY

# Redeploy functions
firebase deploy --only functions
```

### 401 Unauthorized from OpenAI

The API key is invalid. Update it:

```bash
# Check current value
firebase functions:secrets:access OPENAI_API_KEY

# If invalid, set new value
firebase functions:secrets:set OPENAI_API_KEY
```

### Python functions can't find secrets

For local development, set as environment variables:

```bash
export OPENAI_API_KEY='sk-proj-...'
python serve_local.py
```

---

## Security Notes

- **Never commit** `.env.production` to git (should be in `.gitignore`)
- **Never store** API keys in `.env` files
- **Use Firebase Secrets Manager** for all sensitive credentials
- **Rotate keys** immediately if accidentally exposed
- **`VITE_*` variables** are public - never use for secrets

---

## Further Documentation

See [collabcanvas/docs/firebase-configuration.md](../../collabcanvas/docs/firebase-configuration.md) for comprehensive documentation on:
- Architecture overview
- Secrets management details
- Local development setup
- Troubleshooting guide
