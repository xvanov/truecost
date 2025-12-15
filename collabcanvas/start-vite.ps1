# PowerShell script to start Vite Dev Server
# Usage: .\start-vite.ps1

Write-Host "🚀 Starting Vite Dev Server..." -ForegroundColor Green
$env:VITE_USE_FIREBASE_EMULATORS = "true"
npm run dev




