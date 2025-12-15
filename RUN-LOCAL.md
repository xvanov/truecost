# Run TrueCost Locally with Firebase Emulators

## Quick Start (3 Terminals Required)

### Terminal 1: Firebase Emulators
```powershell
cd D:\gauntlet-ai\truecost\collabcanvas
.\start-dev.ps1
```

### Terminal 2: Python Functions (Deep Agents Pipeline)
```powershell
cd D:\gauntlet-ai\truecost\functions
.\venv\Scripts\Activate
python serve_local.py
```

### Terminal 3: Vite Frontend
```powershell
cd D:\gauntlet-ai\truecost\collabcanvas
.\start-vite.ps1
```

---

## URLs When Running

| Service | URL |
|---------|-----|
| Frontend App | http://localhost:5173 |
| Emulator UI | http://localhost:4000 |
| Firestore Emulator | http://127.0.0.1:8081 |
| Python Functions | http://127.0.0.1:5002 |
| Auth Emulator | http://127.0.0.1:9099 |
| Functions Emulator | http://127.0.0.1:5001 |

---

## First Time Setup

### 1. Install Firebase CLI
```powershell
npm install -g firebase-tools
firebase login
```

### 2. Setup Python Environment
```powershell
cd D:\gauntlet-ai\truecost\functions
python -m venv venv
.\venv\Scripts\Activate
pip install -r requirements.txt
```

### 3. Create Environment File
Create `functions/.env` with:
```env
OPENAI_API_KEY=sk-your-openai-key-here
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
USE_FIREBASE_EMULATORS=true
LLM_MODEL=gpt-5.2
```

### 4. Install Frontend Dependencies
```powershell
cd D:\gauntlet-ai\truecost\collabcanvas
npm install
```

---

## Verification

1. **Emulator UI** (http://localhost:4000): All emulators should be green
2. **Python Health Check**: http://127.0.0.1:5002/health should return `{"status": "ok"}`
3. **Frontend**: Browser console should show "Using Firebase Emulators"

---

## Stopping Services

Press `Ctrl+C` in each terminal to stop the services.

---

## Troubleshooting

### Port Already in Use
```powershell
# Find process using port (e.g., 8081)
netstat -ano | findstr :8081

# Kill process by PID
taskkill /PID <PID> /F
```

### Python Virtual Environment Issues
```powershell
# Recreate venv
cd D:\gauntlet-ai\truecost\functions
Remove-Item -Recurse -Force venv
python -m venv venv
.\venv\Scripts\Activate
pip install -r requirements.txt
```

### Firebase Emulator Issues
```powershell
# Clear emulator data and restart
cd D:\gauntlet-ai\truecost\collabcanvas
firebase emulators:start --clear-data
```
