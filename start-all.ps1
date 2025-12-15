# TrueCost Local Development - Start All Services
# Usage: .\start-all.ps1
#
# This script launches all 3 required terminals:
# 1. Firebase Emulators
# 2. Python Functions Server
# 3. Vite Frontend Dev Server

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting TrueCost Local Development Environment..." -ForegroundColor Green
Write-Host ""

# Terminal 1: Firebase Emulators
Write-Host "[1/3] Starting Firebase Emulators..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\collabcanvas'; `$env:VITE_USE_FIREBASE_EMULATORS = 'true'; Write-Host 'Firebase Emulators' -ForegroundColor Green; firebase emulators:start"

Start-Sleep -Seconds 3

# Terminal 2: Python Functions
Write-Host "[2/3] Starting Python Functions Server..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\functions'; Write-Host 'Python Functions Server' -ForegroundColor Green; & '.\venv\Scripts\Activate.ps1'; python serve_local.py"

Start-Sleep -Seconds 2

# Terminal 3: Vite Frontend
Write-Host "[3/3] Starting Vite Frontend..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir\collabcanvas'; `$env:VITE_USE_FIREBASE_EMULATORS = 'true'; Write-Host 'Vite Frontend' -ForegroundColor Green; npm run dev"

Write-Host ""
Write-Host "All services starting!" -ForegroundColor Green
Write-Host ""
Write-Host "URLs:" -ForegroundColor Yellow
Write-Host "  Frontend:     http://localhost:5173"
Write-Host "  Emulator UI:  http://localhost:4000"
Write-Host "  Python API:   http://127.0.0.1:5002/health"
Write-Host ""
Write-Host "Press Ctrl+C in each terminal to stop services." -ForegroundColor Gray
