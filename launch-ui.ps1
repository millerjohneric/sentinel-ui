# Launch Sentinel UI
#
# This script sets up and starts the web interface for Sentinel Media Sync

param(
    [switch]$Dev = $false
)

$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$UIRoot = $ScriptPath

Write-Host ."`n╔════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Sentinel Media Sync - Web UI Launcher║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Check if Node.js is installed
$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host "`nPlease install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Node.js found: $($node.Version)" -ForegroundColor Green

# Check if node_modules exists
if (!(Test-Path "$UIRoot/node_modules")) {
    Write-Host "`n[INSTALLING] Installing dependencies..." -ForegroundColor Cyan
    Push-Location $UIRoot
    npm install
    Pop-Location
    Write-Host "[OK] Dependencies installed" -ForegroundColor Green
}

# Start the server
Write-Host "`n[STARTING] Starting Sentinel UI Server..." -ForegroundColor Cyan
Write-Host "   Admin UI:  http://localhost:3001" -ForegroundColor Green
Write-Host "   Website:   http://localhost:3000 (after sync)" -ForegroundColor Gray
Write-Host "`n" -ForegroundColor Gray

Push-Location $UIRoot

if ($Dev) {
    Write-Host "[DEV MODE] Development mode (auto-reload enabled)" -ForegroundColor Yellow
    npm run dev
} else {
    npm start
}
