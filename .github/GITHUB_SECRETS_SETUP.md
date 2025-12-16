# GitHub Secrets Setup for CollabCanvas Deployment

> **Note**: This document covers **GitHub Secrets** for CI/CD builds (frontend `VITE_*` variables).
> For **Firebase Secrets** (API keys for Cloud Functions like `OPENAI_API_KEY`), see [collabcanvas/docs/firebase-configuration.md](../collabcanvas/docs/firebase-configuration.md).

## Problem Solved

The GitHub Actions deployment was failing because the build process didn't have access to Firebase environment variables, resulting in a blank page after deployment.

## Solution

Modified the GitHub Actions workflows to pass Firebase configuration as environment variables during the build process.

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

### How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** (in the repository menu)
3. Click **Secrets and variables** → **Actions**
4. Click **New repository secret** for each secret below

### Required Secrets

Add these secrets with the exact names and values:

| Secret Name | Value |
|-------------|-------|
| `FIREBASE_API_KEY` | `FIREBASE_API_KEY` |
| `FIREBASE_AUTH_DOMAIN` | `FIREBASE_AUTH_DOMAIN` |
| `FIREBASE_DATABASE_URL` | `FIREBASE_DATABASE_URL` |
| `FIREBASE_PROJECT_ID` | `FIREBASE_PROJECT_ID` |
| `FIREBASE_STORAGE_BUCKET` | `FIREBASE_STORAGE_BUCKET` |
| `FIREBASE_MESSAGING_SENDER_ID` | `FIREBASE_MESSAGING_SENDER_ID` |
| `FIREBASE_APP_ID` | `FIREBASE_APP_ID` |

### Already Configured Secrets

These secrets should already exist (from Firebase service account setup):
- `FIREBASE_SERVICE_ACCOUNT_COLLABCANVAS_DEV`
- `GITHUB_TOKEN` (automatically provided by GitHub)

## What Was Changed

### 1. Updated Main Deployment Workflow

**File:** `.github/workflows/firebase-hosting-merge.yml`

Added environment variables to the build step:

```yaml
- name: Build production bundle
  run: npm run build
  working-directory: collabcanvas
  env:
    VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
    VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
    VITE_FIREBASE_DATABASE_URL: ${{ secrets.FIREBASE_DATABASE_URL }}
    VITE_FIREBASE_PROJECT_ID: ${{ secrets.FIREBASE_PROJECT_ID }}
    VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.FIREBASE_STORAGE_BUCKET }}
    VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
    VITE_FIREBASE_APP_ID: ${{ secrets.FIREBASE_APP_ID }}
    VITE_USE_FIREBASE_EMULATORS: false
```

### 2. Updated PR Preview Workflow

**File:** `.github/workflows/firebase-hosting-pull-request.yml`

Added the same environment variables to the build step for PR previews.

## How It Works

1. **Build Process**: When GitHub Actions runs `npm run build`, Vite now has access to all the Firebase environment variables
2. **Environment Variables**: The `env:` section passes GitHub secrets as environment variables to the build process
3. **Production Mode**: `VITE_USE_FIREBASE_EMULATORS: false` ensures the app connects to real Firebase services, not emulators
4. **Vite Processing**: Vite automatically includes these environment variables in the built JavaScript bundle

## Testing the Fix

After adding the secrets:

1. **Push to main branch** - This will trigger the main deployment workflow
2. **Create a PR** - This will trigger the preview deployment workflow
3. **Check the deployed site** - The page should no longer be blank and Firebase should initialize properly

## Verification Steps

Once deployed, verify these features work:

- [ ] Page loads without being blank
- [ ] Authentication works (login/logout)
- [ ] Shape creation and movement sync in real-time
- [ ] Cursors and presence update correctly
- [ ] Shape locking works across users
- [ ] Console shows no Firebase initialization errors

## Troubleshooting

### If deployment still fails:

1. **Check GitHub Actions logs** for any build errors
2. **Verify all secrets are added** with correct names and values
3. **Check Firebase Console** to ensure services are enabled
4. **Verify Firebase project ID** matches your actual project

### If page is still blank:

1. **Check browser console** for JavaScript errors
2. **Verify Firebase configuration** is being loaded correctly
3. **Check network tab** for failed Firebase API calls
4. **Ensure Firebase services** are enabled in the Firebase Console

## Security Notes

- ✅ Secrets are encrypted and only accessible during GitHub Actions runs
- ✅ Secrets are not visible in logs or build outputs
- ✅ Each secret is scoped to this repository only
- ✅ Firebase API keys are safe to use in client-side code (they're designed for this)

## Next Steps

After adding the secrets and verifying deployment works:

1. **Monitor performance** - Ensure 60 FPS target is maintained
2. **Test real-time features** - Verify multi-user collaboration works
3. **Check error monitoring** - Set up proper error tracking if needed
4. **Optimize bundle size** - Monitor build output size

---

**Status:** Ready for deployment once secrets are added to GitHub repository settings.
