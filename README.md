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

Direct localhost access does not prompt for a login. The UI also creates a random password for requests arriving through Nginx and stores it in the ignored local `.env` file. For public HTTPS access, use the values of `SENTINEL_UI_USERNAME` (default `sentinel-admin`) and `SENTINEL_UI_PASSWORD` from that file when the browser prompts for HTTP Basic Authentication.

The UI backend will be available locally at **http://localhost:3006**. Through Nginx, the secure public address is **https://millerjohneric.asuscomm.com:3005**.

> **Port Assignment**:
> - **3005 HTTPS** = Sentinel UI through Nginx (proxied to backend port 3006)
> - **3006 HTTP** = Sentinel UI backend on localhost
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
   - Spawns `sentinel-media-sync/Run-Sentinel.ps1`
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
PORT=3006
WEBSITE_PORT=3000
SENTINEL_ROOT=C:\Source\GEEK\Sentinel
```

## Troubleshooting

### "Sentinel runner not found"
Confirm `sentinel-media-sync/Run-Sentinel.ps1` exists beside the `sentinel-ui` folder.

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
