# Sentinel Media Sync - Console to UI Migration

## 🎯 What Changed?

| Aspect | Before | After |
|--------|--------|-------|
| **Interface** | PowerShell console | Web browser dashboard |
| **Control** | Command line arguments | GUI buttons & forms |
| **Monitoring** | Console output | Real-time log viewer |
| **Configuration** | Edit YAML file in editor | Web form editor |
| **Visibility** | Text-only logs | Styled & colored logs |
| **Access** | Local command only | Network accessible |

---

## 🚀 Getting Started (Quick Start)

### 1. Install (First Time Only)
```powershell
cd sentinel-ui
npm install
```

### 2. Launch
```powershell
.\launch-ui.ps1
```

### 3. Open Browser
```
http://localhost:3001  ← Sentinel UI (Admin)
http://localhost:3000  ← Website (After sync)
```

---

## 💻 User Interface Overview

```
╔═══════════════════════════════════════════╗
║    📡 Sentinel Media Sync                 ║
║    Unified media archive & website gen    ║
╠═══════════════════════════════════════════╣
║                                           ║
║  Status: [●] Running      Logs: 42        ║
║                                           ║
║  [▶ Start Sync]  [⏹ Stop Sync]          ║
║                                           ║
║  📋 SYNC LOGS                             ║
║  ┌─────────────────────────────────────┐ ║
║  │ ✓ Initialized sync process          │ ║
║  │ ✓ Found 128 recipe images           │ ║
║  │ ✓ Synced photos to archive          │ ║
║  │ ✓ Built Docusaurus website          │ ║
║  │ ✓ Sync completed successfully       │ ║
║  └─────────────────────────────────────┘ ║
║                                           ║
║  ⚙️  CONFIGURATION                        ║
║  ┌─────────────────────────────────────┐ ║
║  │ RecipePath: L:\Recipes\...          │ ║
║  │ OutputPath: C:\Source\GEEK\website\ │ ║
║  │ UseNetworkPath: true                │ ║
║  └─────────────────────────────────────┘ ║
║  [💾 Save Configuration]                 ║
║                                           ║
╚═══════════════════════════════════════════╝
```

---

## 🎮 Controls

### Sync Management
- **▶ Start Sync** — Begin media synchronization process
- **⏹ Stop Sync** — Immediately halt running sync
- **Live Logs** — Watch progress in real-time

### Configuration
- **Edit Settings** — Modify paths, options, schedules
- **Save Config** — Persist changes to YAML file
- **Reset** — Revert unsaved changes

---

## 📂 Project Structure

```
sentinel-ui/
├── server.js              ← Backend API server
├── public/
│   ├── index.html        ← Dashboard layout
│   ├── app.js            ← Frontend logic
│   └── styles.css        ← UI styling
├── package.json          ← Dependencies
├── launch-ui.ps1         ← Quick launcher
├── SETUP_GUIDE.md        ← Detailed setup
└── README.md             ← Overview
```

---

## 🔧 Common Tasks

### Change Server Port
```powershell
$env:PORT=8080
npm start
```

### Access from Another Computer
1. Find your IP: `ipconfig | findstr IPv4`
2. Access: `http://<YOUR-IP>:3000`

### Enable Auto-Reload (Development)
```powershell
npm run dev
```

### View Real-Time Logs (Terminal)
The server logs appear in your PowerShell window while running.

### Check if Node is Installed
```powershell
node --version    # Should show v18.0.0 or higher
npm --version     # Should show 9.0.0 or higher
```

---

## 📊 Features

✅ **Dashboard Status** — Real-time sync state  
✅ **Live Log Stream** — WebSocket-powered updates  
✅ **One-Click Control** — Start/stop with buttons  
✅ **Config Management** — Edit settings in browser  
✅ **Responsive Design** — Works on mobile/tablet  
✅ **No Build Step** — Just `npm install` and run  

---

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Port already in use" | Change PORT env var or restart |
| "Node not found" | Install from nodejs.org |
| "Module not found" | Run `npm install` |
| "Script won't execute" | `Set-ExecutionPolicy RemoteSigned` |
| "Can't connect to 3000" | Check if server is running |

---

## 📞 Support

**Documentation**: See `SETUP_GUIDE.md` for detailed instructions

**API Reference**: See `server.js` for available endpoints

**Engine Docs**: See `../sentinel-media-sync/README.md` for Sentinel engine

---

## ⚡ Pro Tips

💡 **Bookmark the dashboard** — Add `http://localhost:3000` to favorites  
💡 **Auto-start on boot** — Add `launch-ui.ps1` to Windows Task Scheduler  
💡 **Monitor from phone** — Access from same WiFi network  
💡 **Check logs** — Browser DevTools (F12) shows WebSocket traffic  
💡 **Keep running** — Server doesn't need to restart after syncs

---

**Sentinel v20.154** | UI Launch: `.\launch-ui.ps1`
