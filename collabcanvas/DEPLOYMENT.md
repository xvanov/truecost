# CollabCanvas - Production Deployment Guide

## PR #10: Deployment (Firebase Hosting)

This guide covers deploying CollabCanvas to Firebase Hosting for production use.

### Prerequisites

1. **Firebase CLI installed**: `npm install -g firebase-tools`
2. **Firebase project created** (can use existing `collabcanvas-dev` or create new production project)
3. **Firebase services enabled**: Auth, Firestore, Realtime Database

### Step 1: Set Up Production Environment Variables

Create a `.env.production` file in the project root with your Firebase configuration:

```bash
# Production Firebase Configuration
VITE_FIREBASE_API_KEY=your-production-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-production-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-production-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-production-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-production-messaging-sender-id
VITE_FIREBASE_APP_ID=your-production-app-id

# Use real Firebase (not emulators) in production
VITE_USE_FIREBASE_EMULATORS=false
```

**To get these values:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings (gear icon)
4. Scroll down to "Your apps" section
5. Click on your web app or create one if needed
6. Copy the config values

### Step 2: Configure Firebase Project

Update `.firebaserc` if using a different project for production:

```json
{
  "projects": {
    "default": "your-production-project-id"
  }
}
```

### Step 3: Build Production Bundle

```bash
# Install dependencies (if not already done)
npm install

# Build optimized production bundle
npm run build
```

This creates a `dist/` folder with optimized assets.

### Step 4: Deploy to Firebase Hosting

```bash
# Login to Firebase (if not already logged in)
firebase login

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Step 5: Verify Deployment

After deployment, Firebase will provide a URL like:
`https://your-project-id.web.app`

**Test the following:**
1. ✅ Authentication flow works
2. ✅ Shape creation and movement sync in real-time
3. ✅ Cursors and presence update correctly
4. ✅ Shape locking works across users
5. ✅ Performance targets met: 60 FPS, < 100ms shape sync, < 50ms cursor updates

### Step 6: Configure Custom Domain (Optional)

1. In Firebase Console → Hosting
2. Click "Add custom domain"
3. Follow the verification steps
4. Update DNS records as instructed

### Step 7: Configure Cloud Functions Secrets

All API keys for Cloud Functions are stored in Firebase Secrets Manager:

```bash
# Set required secrets
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set SERP_API_KEY

# Verify secrets are configured
firebase functions:secrets:list

# Deploy functions with secrets
firebase deploy --only functions
```

See [docs/firebase-configuration.md](docs/firebase-configuration.md) for detailed documentation.

### Production Checklist

- [ ] Firebase project created and configured
- [ ] Environment variables set in `.env.production`
- [ ] **Secrets configured in Firebase Secrets Manager**
- [ ] Firebase services enabled (Auth, Firestore, RTDB)
- [ ] Security rules deployed (`firebase deploy --only firestore:rules,database:rules`)
- [ ] Cloud Functions deployed (`firebase deploy --only functions`)
- [ ] Production build successful (`npm run build`)
- [ ] Deployment successful (`firebase deploy --only hosting`)
- [ ] Authentication works on production URL
- [ ] Real-time features work across multiple browsers
- [ ] Performance targets met

### Troubleshooting

**Build fails:**
- Check that all dependencies are installed: `npm install`
- Verify TypeScript compilation: `npx tsc --noEmit`

**Deployment fails:**
- Ensure you're logged in: `firebase login`
- Check project configuration: `firebase projects:list`
- Verify hosting is enabled: `firebase hosting:channel:list`

**App doesn't work after deployment:**
- Check browser console for errors
- Verify environment variables are correct
- Ensure Firebase services are enabled in production project
- Check that security rules are deployed

**Authentication issues:**
- Add production domain to authorized domains in Firebase Console
- Go to Authentication → Settings → Authorized domains
- Add your production domain (e.g., `your-project.web.app`)

### Performance Monitoring

After deployment, monitor:
- **FPS Counter**: Should maintain 60 FPS during interactions
- **Network Tab**: Shape updates should sync in < 100ms
- **Console Logs**: Check for any errors or warnings

### Security Notes

- Never commit `.env.production` to version control
- Ensure security rules are properly deployed
- Monitor Firebase usage and costs
- Set up proper error monitoring

### Next Steps

Once deployed successfully:
- Share the production URL with users
- Monitor performance and usage
- Set up analytics if needed
- Plan for Phase 2 features (additional shapes, deletion, etc.)

---

## Manual Steps Required

**You need to do these steps manually:**

1. **Create production Firebase project** (or use existing `collabcanvas-dev`)
2. **Get Firebase configuration values** from Firebase Console
3. **Create `.env.production` file** with your config
4. **Run deployment commands**:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```
5. **Test the deployed application** across multiple browsers

**I can help with:**
- ✅ Firebase configuration files are already set up
- ✅ Build scripts are ready
- ✅ Hosting configuration is complete
- ✅ This deployment guide

The app is ready to deploy! 🚀
