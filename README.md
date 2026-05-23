# Sentinel UI

A modern web-based user interface for the **Sentinel Media Sync** engine.

## What's Changed

**Before**: Console-based PowerShell script
**After**: Interactive web dashboard with real-time status monitoring, log streaming, and configuration management

## Features

✅ **Real-time Sync Status** — Visual indicator shows when sync is running  
✅ **Live Log Streaming** — Watch sync progress in real-time via WebSocket  
✅ **One-Click Controls** — Start/Stop sync with simple buttons  
✅ **Configuration Editor** — Manage settings directly from the UI  
✅ **Responsive Design** — Works on desktop and mobile devices  
✅ **No Installation** — Just npm install and run

## Quick Start

### Installation

```powershell
cd sentinel-ui
npm install
```

### Running the Server

```powershell
npm start
```

The UI will be available at **http://localhost:3001**

> **Port Assignment**:
> - **3001** = Sentinel UI (admin control panel)
> - **3000** = Docusaurus Website (generated after sync)
>
> Both can run simultaneously without conflict.

### Development Mode (with auto-reload)

```powershell
npm run dev
```

## Architecture

```
sentinel-ui/
├── server.js              ← Express backend + WebSocket server
├── public/
│   ├── index.html        ← Main UI page
│   ├── app.js            ← Frontend app logic
│   └── styles.css        ← UI styling
├── package.json
└── README.md
```

## How It Works

1. **Backend (Node.js/Express)**
   - Spawns the PowerShell `Sentinel-Core.ps1` script
   - Streams stdout/stderr to connected clients
   - Manages configuration via YAML files
   - Provides REST API for status and control

2. **Frontend (Vanilla JavaScript)**
   - Real-time updates via Socket.IO WebSocket
   - Clean, responsive dashboard UI
   - Configuration form with live editing
   - No build step required

3. **Communication**
   - WebSocket for live logs and status
   - REST API for start/stop/config operations

## Environment Variables

Create a `.env` file if you need to customize:

```env
PORT=3000
SENTINEL_ROOT=C:\Source\GEEK\Sentinel
```

## Troubleshooting

### "PowerShell script not found"
Make sure the path to `Sentinel-Core.ps1` is correct in `server.js`

### "Cannot connect to localhost:3000"
Ensure the server is running: `npm start`

### Config won't save
Check file permissions on `Sentinel-Config.yml`

## Next Steps

- Add more detailed statistics (file counts, sync duration)
- Store logs persistently
- Add scheduling for automated syncs
- Create Windows system tray integration
- Mobile app with React Native

---

For help with the Sentinel engine itself, see [sentinel-media-sync/README.md](../sentinel-media-sync/README.md)
