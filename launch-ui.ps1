param(
    [switch]$Dev = $false
)

function Wait-ForUrl {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )

    $PollUrl = $Url -replace 'localhost', '127.0.0.1'
    $uri = [System.Uri]$PollUrl
    $elapsed = 0

    while ($elapsed -lt $TimeoutSeconds) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $asyncResult = $tcp.BeginConnect($uri.Host, $uri.Port, $null, $null)
            $wait = $asyncResult.AsyncWaitHandle.WaitOne(1000, $false)
            if ($wait -and $tcp.Connected) {
                $tcp.Close()
                try {
                    $response = Invoke-WebRequest -Uri $PollUrl -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
                    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                        return $true
                    }
                } catch {
                    if ($_.Exception.Response) { return $true }
                }
            }
            $tcp.Close()
        } catch {
            # Port not open yet
        }

        Start-Sleep -Seconds 1
        $elapsed += 1
    }
    return $false
}

# --- PATH RESOLUTION BLOCK ---
$ConfigPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'sentinel-media-sync\Sentinel-Config.yml'

if (Test-Path $ConfigPath) {
    $ConfigContent = Get-Content $ConfigPath -Raw
    
    if ($ConfigContent -match 'GitHub_Repo:\s+([^\r\n]+)') {
        $GitHubRepoPath = $Matches[1].Trim().Trim(" '`"")
    }
    
    $WebRootEntry = $ConfigContent -split 'Locations:' | Select-Object -Last 1
    if ($WebRootEntry -match 'RootType:\s*web-root[\s\S]*?Path:\s*([^\r\n]+)') {
        $WebsiteStagingPath = $Matches[1].Trim().Trim(" '`"")
    }
} else {
    Write-Error "Configuration profile not found at $ConfigPath"
    return
}

$UIRoot = $PSScriptRoot
$EngineRoot = $GitHubRepoPath

if ($GitHubRepoPath) { $env:ENGINE_ROOT = $GitHubRepoPath }
if ($WebsiteStagingPath) { $env:WEBSITE_STAGING_PATH = $WebsiteStagingPath }
$env:CONFIG_PATH = $ConfigPath
$env:PORT = 3006

if (!(Test-Path (Join-Path $UIRoot 'package.json'))) {
    Write-Host ""
    Write-Host "ERROR: package.json not found in $UIRoot" -ForegroundColor Red
    Write-Host "Current location: $(Get-Location)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Please run this script from the sentinel-ui directory." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host "   Sentinel Media Sync - Web UI Launcher"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "OK: Node.js found" -ForegroundColor Green

if (!(Test-Path (Join-Path $UIRoot 'node_modules'))) {
    Write-Host ""
    Write-Host "INSTALLING: Dependencies..." -ForegroundColor Cyan
    Push-Location $UIRoot
    npm install
    Pop-Location
    Write-Host "OK: Dependencies installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "STARTING: Sentinel UI Server..." -ForegroundColor Cyan
Write-Host "   Admin UI:  http://localhost:3005" -ForegroundColor Green
Write-Host "   Website:   http://localhost:3000" -ForegroundColor Gray
Write-Host ""

Push-Location $UIRoot

$BuildExists = (Test-Path (Join-Path $UIRoot '.next')) -or (Test-Path (Join-Path $UIRoot 'dist')) -or (Test-Path (Join-Path $UIRoot 'build'))

if (!$Dev -and !$BuildExists) {
    Write-Host "NOTICE: No production build found. Defaulting to development mode ('npm run dev')..." -ForegroundColor Yellow
    $Dev = $true
}

$NpmCommand = 'npm run -- -p 3005' 
$NpmCommand = if ($Dev) { 'npm run dev -- -p 3006' } else { 'npm start -- -p 3006' }
$LaunchCommand = "Set-Location -Path '$UIRoot'; $NpmCommand"

$PsExecutable = (Get-Process -Id $PID).Path

Write-Host "STARTING: Sentinel UI process in a separate PowerShell window..." -ForegroundColor Cyan
Start-Process -FilePath $PsExecutable -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', $LaunchCommand -WorkingDirectory $UIRoot -WindowStyle Normal

# --- BROWSER AUTO-LAUNCH LOGIC ---
$UiUrl = 'http://localhost:3005/'
Write-Host "WAITING: Sentinel UI to become available at $UiUrl" -ForegroundColor Gray

if (Wait-ForUrl -Url $UiUrl -TimeoutSeconds 60) {
    Write-Host "OPENING: Browser to $UiUrl" -ForegroundColor Green
    Start-Process $UiUrl
} else {
    Write-Host "WARNING: UI took over 60 seconds to respond. Opening browser anyway..." -ForegroundColor Yellow
    Start-Process $UiUrl
}

$WebsiteUrl = 'http://localhost:3000/'
Write-Host "CHECKING: Website status at $WebsiteUrl" -ForegroundColor Gray

# Quick 5-second check so the script does not hang if Docusaurus isn't started
if (Wait-ForUrl -Url $WebsiteUrl -TimeoutSeconds 5) {
    Write-Host "OPENING: Browser to $WebsiteUrl" -ForegroundColor Green
    Start-Process $WebsiteUrl
} else {
    Write-Host "INFO: Website on port 3000 is not active." -ForegroundColor Yellow
}