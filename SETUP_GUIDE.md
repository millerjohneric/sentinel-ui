# Sentinel UI - Setup Guide

## Overview

Sentinel now has a **web-based user interface** that replaces the console-based experience. Instead of running PowerShell scripts manually, you can:

- ✅ Start/stop syncs with one click
- ✅ Monitor sync progress in real-time
- ✅ Edit configuration through a web form
- ✅ View logs streaming live
- ✅ Access from any browser (including mobile)

## Prerequisites

- **Windows, macOS, or Linux** (anywhere Node.js runs)
- **Node.js v18+** (download from https://nodejs.org/)
- **Git** (optional, for version control)

## Quick Start (5 minutes)

### 1. Install Dependencies

```powershell
cd sentinel-ui
npm install
```

This installs Express, Socket.IO, and other required packages.

### 2. Launch the UI

**Option A: PowerShell Script (Easiest)**
```powershell
.\launch-ui.ps1
```

**Option B: Direct npm command**
```powershell
npm start
```

**Option C: Development mode (auto-reload on code changes)**
```powershell
npm run dev
```

### 3. Open in Browser

Navigate to: **http://localhost:3001**

> **Port Assignment**:
> - **3001** = Sentinel UI (this admin dashboard)
> - **3000** = Docusaurus Website (if running after sync)

You should see the Sentinel dashboard with:
- 📊 Status indicator (Running / Idle)
- 🎮 Start/Stop buttons
- 📋 Live sync logs
- ⚙️ Configuration editor

## Using the UI

### Starting a Sync

1. Click **"▶ Start Sync"** button
2. The status will change to "Running"
3. Logs will stream in real-time
4. The sync will continue until complete

### Stopping a Sync

1. Click **"⏹ Stop Sync"** button
2. The process will terminate immediately
3. Status returns to "Idle"

### Editing Configuration

1. Scroll to **Configuration** section
2. Modify settings (paths, options, etc.)
3. Click **"💾 Save Configuration"**
4. Settings are written to `Sentinel-Config.yml`

### Viewing Logs

Logs appear automatically as the sync runs. You can:
- Scroll through log history
- Different colors for info/warning/error
- Auto-scrolls to latest entry

## Architecture

```
Frontend (Browser)
    ↓ WebSocket (real-time updates)
    ↓ HTTP REST API
Backend (Node.js/Express)
    ↓ Spawns PowerShell process
    ↓ Streams output
Sentinel-Core.ps1
```

### Backend Server

**File**: `server.js`

Responsibilities:
- Hosts the web interface
- Spawns PowerShell scripts
- Manages real-time log streaming
- Handles configuration read/write
- REST API endpoints

**API Endpoints**:
```
GET  /api/status      — Get current sync status
GET  /api/config      — Get current configuration
POST /api/config      — Save updated configuration
POST /api/sync/start  — Start a sync process
POST /api/sync/stop   — Stop current sync process
GET  /api/logs        — Get historical logs (TODO)
```

### Frontend UI

**File**: `public/app.js`

Implements:
- Real-time dashboard
- WebSocket connection handling
- Button event listeners
- Log display with auto-scroll
- Configuration form management
- No build step required (vanilla JS)

## Troubleshooting

### Problem: "Node.js is not installed"

**Solution**: Download from https://nodejs.org/ and run the installer. Then restart your terminal.

**Verify installation**:
```powershell
node --version
npm --version
```

### Problem: "Port 3001 is already in use"

**Solution**: Use a different port via environment variable:

```powershell
$env:PORT=3002
npm start
```

**Note**: Port 3000 is reserved for the Docusaurus website. If both ports are in use:

```powershell
# Find all Node.js processes
netstat -ano | findstr node.exe
```

### Problem: "Cannot find module 'express'"

**Solution**: Install dependencies:
```powershell
npm install
```

### Problem: Sync won't start or stops immediately

**Issues to check**:
1. Does `Sentinel-Core.ps1` exist at the path in `server.js`?
2. Do you have PowerShell execution policies set correctly?
3. Check browser console (F12) and terminal for error messages

**Fix**:
```powershell
# Allow local script execution
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Problem: Configuration won't save

**Solution**:
1. Check file permissions on `Sentinel-Config.yml`
2. Ensure the YAML is valid (quotes, indentation)
3. Check server logs for error messages

### Problem: Website won't start on port 3000 (port conflict)

**Cause**: Port 3000 is in use (Sentinel UI uses 3001, but the website also defaults to 3000).

**Solution**: Start the website on a different port:

```powershell
cd website
PORT=3002 npm start
# Or specify port in docusaurus.config.js
```

**Port Reference**:
- **3001** = Sentinel UI (admin control panel)
- **3000** = Docusaurus Website (default)
- **3002+** = Alternative ports if needed

Both Sentinel UI and the website can run simultaneously—they just can't share the same port.

## Next Steps

### Enhance the UI

The current UI is functional and can be extended with:

1. **Statistics Dashboard**
   - Files synced count
   - Sync duration
   - Archive size
   - Success/failure rates

2. **Scheduling**
   - Set up automatic syncs on intervals
   - Cron expression builder
   - Pause/resume scheduled syncs

3. **Media Browser**
   - Browse archives by date
   - Search photos by tags
   - Gallery preview

4. **Notifications**
   - Email alerts on sync complete/failure
   - Desktop notifications
   - Webhook integrations

5. **Data Persistence**
   - Store logs to database
   - Historical charts
   - Export reports

### Integration with Console Script

The PowerShell script (`Sentinel-Core.ps1`) continues to work as before. You can:
- Run it from command line directly
- Run it via Task Scheduler
- Run it via the UI

The UI is purely optional—it's a convenience wrapper around the existing engine.

## Development

### Running in Development Mode

```powershell
npm run dev
```

This enables:
- Auto-reload when you edit `server.js`
- Verbose logging
- Easier debugging

### Project Structure

```
sentinel-ui/
├── server.js              ← Express server + WebSocket
├── public/
│   ├── index.html        ← HTML template
│   ├── app.js            ← Client-side JavaScript
│   ├── styles.css        ← UI styling
├── package.json          ← Dependencies
├── launch-ui.ps1         ← PowerShell launcher
├── launch-ui.bat         ← Batch launcher (Windows)
├── launch-ui.sh          ← Bash launcher (macOS/Linux)
├── .gitignore
├── .env.example
└── README.md
```

### Modifying the UI

All frontend code is in `public/`:
- `index.html` — Structure
- `app.js` — Logic
- `styles.css` — Styling

No build step is required. Just refresh your browser to see changes.

### Modifying the API

API handlers are in `server.js`. Common additions:
- New GET/POST endpoints
- WebSocket events
- Database integrations
- External API calls

## Deployment

### Local Network

To access from other machines on your network:

1. Find your computer's IP:
   ```powershell
   ipconfig | findstr "IPv4"
   ```

2. Access from another machine:
   ```
   http://<YOUR_IP>:3000
   ```

### Production Deployment

Options:
- **Azure App Service** — Cloud hosting for Node.js
- **IIS with iisnode** — Windows server hosting
- **Docker** — Containerized deployment
- **PM2** — Process manager for reliability

## Reverting to Console

If you prefer the original console-based approach, you can still run:

```powershell
powershell -ExecutionPolicy Bypass -File sentinel-media-sync/Sentinel-Core.ps1
```

The UI and console interfaces coexist—use whichever you prefer.

## Support & Issues

For issues specific to:
- **Sentinel engine**: See `sentinel-media-sync/README.md`
- **UI functionality**: Edit `server.js` and `public/app.js`
- **Node.js/npm**: https://nodejs.org/help

---

**Sentinel v20.154** | UI v1.0.0
