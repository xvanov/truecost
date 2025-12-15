# Local Development Setup

## Prerequisites

1. Node.js 20.x+ installed
2. Firebase CLI installed: `npm install -g firebase-tools`
3. Firebase login: `firebase login`

## Running the Application Locally

The application requires two terminals running simultaneously:

### Terminal 1: Firebase Emulators

Run this command from the `collabcanvas/` directory:

```bash
VITE_USE_FIREBASE_EMULATORS=true firebase emulators:start
```

**Or use the helper script:**
- **Windows (PowerShell)**: `.\start-dev.ps1`
- **Linux/Mac**: `chmod +x start-dev.sh && ./start-dev.sh`

This will start:
- Auth Emulator: http://127.0.0.1:9099
- Firestore Emulator: http://127.0.0.1:8081
- Functions Emulator: http://127.0.0.1:5001
- Storage Emulator: http://127.0.0.1:9199
- Database Emulator: http://127.0.0.1:9000
- Emulator UI: http://localhost:4000

### Terminal 2: Vite Dev Server

Run this command from the `collabcanvas/` directory:

```bash
VITE_USE_FIREBASE_EMULATORS=true npm run dev
```

**Or use the helper script:**
- **Windows (PowerShell)**: `.\start-vite.ps1`
- **Linux/Mac**: `chmod +x start-vite.sh && ./start-vite.sh`

This will start the Vite dev server (typically on http://localhost:5173)

## Quick Start (Both Terminals)

### Windows (PowerShell)

**Terminal 1:**
```powershell
cd collabcanvas
$env:VITE_USE_FIREBASE_EMULATORS = "true"
firebase emulators:start
```

**Terminal 2:**
```powershell
cd collabcanvas
$env:VITE_USE_FIREBASE_EMULATORS = "true"
npm run dev
```

### Linux/Mac (Bash)

**Terminal 1:**
```bash
cd collabcanvas
VITE_USE_FIREBASE_EMULATORS=true firebase emulators:start
```

**Terminal 2:**
```bash
cd collabcanvas
VITE_USE_FIREBASE_EMULATORS=true npm run dev
```

## Verification

1. **Firebase Emulators UI**: Open http://localhost:4000
   - You should see all emulators running
   - Auth, Firestore, Functions, Storage, Database should be green

2. **Vite Dev Server**: Open the URL shown in Terminal 2 (usually http://localhost:5173)
   - The app should load
   - Check browser console for "🔧 Using Firebase Emulators" message
   - Check for "✅ Connected to Firebase Emulators" message

## Troubleshooting

### Port Already in Use
If you get port conflicts:
- Check what's using the port: `netstat -ano | findstr :9099` (Windows) or `lsof -i :9099` (Mac/Linux)
- Kill the process or change ports in `firebase.json`

### Environment Variable Not Working
- Make sure you're setting the variable in the same terminal session
- On Windows PowerShell, use `$env:VITE_USE_FIREBASE_EMULATORS = "true"`
- On Windows CMD, use `set VITE_USE_FIREBASE_EMULATORS=true`
- On Linux/Mac, use `VITE_USE_FIREBASE_EMULATORS=true` before the command

### Firebase CLI Not Found
- Install: `npm install -g firebase-tools`
- Verify: `firebase --version`

### Functions Not Loading
- Make sure you're in the `collabcanvas/` directory
- Check that `collabcanvas/functions/` exists and has `package.json`
- Run `cd functions && npm install` if needed

## Stopping the Servers

- **Terminal 1**: Press `Ctrl+C` to stop Firebase emulators
- **Terminal 2**: Press `Ctrl+C` to stop Vite dev server




