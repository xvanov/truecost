# PowerShell script to start Firebase Emulators
# Usage: .\start-dev.ps1

Write-Host "🚀 Starting Firebase Emulators..." -ForegroundColor Green
$env:VITE_USE_FIREBASE_EMULATORS = "true"
firebase emulators:start




