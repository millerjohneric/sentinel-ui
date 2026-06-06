param(
    [switch]$Dev = $false
)

# --- PATH RESOLUTION BLOCK ---
# 1. Resolve configuration source absolute path relative to script directory
$ConfigPath = Join-Path (Split-Path $PSScriptRoot -Parent) "sentinel-media-sync\Sentinel-Config.yml"

if (Test-Path $ConfigPath) {
    # 2. Extract specific path strings using single-quoted regex captures
    $ConfigContent = Get-Content $ConfigPath -Raw
    
    # Extract GitHub Repo / Engine Root
    if ($ConfigContent -match 'GitHub_Repo:\s+([^\r\n]+)') {
        $GitHubRepoPath = $Matches[1].Trim()
    }
    
    # Extract Website Web-Root Target Path
    $WebRootEntry = $ConfigContent -split "Locations:" | Select-Object -Last 1
    if ($WebRootEntry -match 'RootType:\s*web-root[\s\S]*?Path:\s*([^\r\n]+)') {
        $WebsiteStagingPath = $Matches[1].Trim()
    }
} else {
    Write-Error "Configuration profile not found at $ConfigPath"
    return
}

# Assign runtime target paths safely back to launch profile
$UIRoot = $PSScriptRoot
$EngineRoot = $GitHubRepoPath

# Verify we're in the sentinel-ui directory
if (!(Test-Path "$UIRoot/package.json")) {
    Write-Host ""
    Write-Host "ERROR: package.json not found in $UIRoot" -ForegroundColor Red
    Write-Host "Current location: $(Get-Location)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please run this script from: C:\Source\GEEK\Sentinel\sentinel-ui" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "   Sentinel Media Sync - Web UI Launcher"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "OK: Node.js found" -ForegroundColor Green

# Check if node_modules exists
if (!(Test-Path "$UIRoot/node_modules")) {
    Write-Host ""
    Write-Host "INSTALLING: Dependencies..." -ForegroundColor Cyan
    Push-Location $UIRoot
    npm install
    Pop-Location
    Write-Host "OK: Dependencies installed" -ForegroundColor Green
}

# Start the server
Write-Host ""
Write-Host "STARTING: Sentinel UI Server..." -ForegroundColor Cyan
Write-Host "   Admin UI:  http://localhost:3005" -ForegroundColor Green
Write-Host "   Website:   http://localhost:3000" -ForegroundColor Gray
Write-Host ""

Push-Location $UIRoot

# The Express backend handles standard start without passing unsupported flags directly to Node execution
$NpmCommand = if ($Dev) { 'npm run dev' } else { 'npm start' }
$LaunchCommand = "Set-Location -Path '$UIRoot'; $NpmCommand"

Write-Host "STARTING: Sentinel UI process in a separate PowerShell window..." -ForegroundColor Cyan
Start-Process -FilePath "$PSHome\powershell.exe" -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $LaunchCommand -WorkingDirectory $UIRoot -WindowStyle Normal

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $elapsed = 0
    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        } catch {
            Start-Sleep -Seconds 2
            $elapsed += 2
        }
    }
    return $false
}

# FIXED: Route through your Nginx domain setup to satisfy SSL validation
$UiUrl = 'http://localhost:3005/'
Write-Host "WAITING: Sentinel UI to become available at $UiUrl" -ForegroundColor Gray
if (Wait-ForUrl -Url $UiUrl -TimeoutSeconds 30) {
    Write-Host "OPENING: Browser to $UiUrl" -ForegroundColor Green
    Start-Process $UiUrl
} else {
    Write-Host "WARNING: UI did not respond within 30 seconds. Open $UiUrl manually if needed." -ForegroundColor Yellow
}

# Adjusted to target Docusaurus default instance port 3000
$WebsiteUrl = 'http://localhost:3000/'
Write-Host "WAITING: Website to become available at $WebsiteUrl" -ForegroundColor Gray
if (Wait-ForUrl -Url $WebsiteUrl -TimeoutSeconds 120) {
    Write-Host "OPENING: Browser to $WebsiteUrl" -ForegroundColor Green
    Start-Process $WebsiteUrl
} else {
    Write-Host "INFO: Website did not become available within 120 seconds. It may start after sync finishes." -ForegroundColor Yellow
}