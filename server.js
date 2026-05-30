import express from 'express';
import cors from 'cors';
import { spawn, exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import http, { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Configuration
const SENTINEL_ROOT = path.resolve(__dirname, '..');
const CORE_SCRIPT = path.join(SENTINEL_ROOT, 'sentinel-media-sync', 'Sentinel-Core.ps1');
const CONFIG_FILE = path.join(SENTINEL_ROOT, 'sentinel-media-sync', 'Sentinel-Config.yml');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);

// Store active sync process
let syncProcess = null;
let syncInProgress = false;

// Keep recent logs in memory for UI retrieval (capped)
const recentLogs = [];
const MAX_LOGS = 500;

// Track starter processes (detached) if needed
let websiteStarter = null;
let uiStarter = null;

// Helper function to forcefully kill any ghost process occupying our target port on Windows
function killProcessOnPort(port, callback) {
  // Finds the PID listening on the specific port and forces a taskkill tree cleanup (/F /T)
  const cmd = `cmd.exe /c "FOR /F \\"tokens=5\\" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /T /PID %a"`;
  
  exec(cmd, (err) => {
    // If no process is running, taskkill returns an error which we safely ignore
    console.log(`Port cleanup check finished for port: ${port}`);
    callback();
  });
}

// API Routes
app.get('/api/status', (req, res) => {
  // Check website (port 3000) health and report UI server status
  const options = { hostname: '127.0.0.1', port: 3000, path: '/', method: 'GET', timeout: 2000 };
  let sent = false;
  const sendResponse = (websiteUp, rStatusCode = null) => {
    if (sent) return;
    sent = true;
    const responseData = {
      syncing: syncInProgress,
      coreScript: CORE_SCRIPT,
      configFile: CONFIG_FILE,
      rootPath: SENTINEL_ROOT,
      uiUp: true,
      websiteUp: websiteUp
    };
    if (rStatusCode !== null) {
      responseData.websiteStatusCode = rStatusCode;
    }
    res.json(responseData);
  };

  const reqH = http.request(options, (r) => {
    sendResponse(r.statusCode >= 200 && r.statusCode < 400, r.statusCode);
  });
  reqH.on('error', () => {
    sendResponse(false);
  });
  reqH.on('timeout', () => {
    reqH.destroy();
    sendResponse(false);
  });
  reqH.end();
});

app.get('/api/config', (req, res) => {
  try {
    const configContent = readFileSync(CONFIG_FILE, 'utf8');
    const config = YAML.parse(configContent);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const yaml = YAML.stringify(req.body);
    writeFileSync(CONFIG_FILE, yaml, 'utf8');
    res.json({ success: true, message: 'Config saved' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync/start', (req, res) => {
  if (syncInProgress) {
    return res.status(400).json({ error: 'Sync already in progress' });
  }

  syncInProgress = true;
  io.emit('sync:start');

  const psProcess = spawn('powershell.exe', [
    '-ExecutionPolicy', 'Bypass',
    '-File', CORE_SCRIPT
  ], {
    cwd: SENTINEL_ROOT,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  syncProcess = psProcess;

  psProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('STDOUT:', output);
    io.emit('sync:log', { type: 'info', message: output });
    recentLogs.push({ type: 'info', message: output, ts: Date.now() });
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  });

  psProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('STDERR:', output);
    io.emit('sync:log', { type: 'error', message: output });
    recentLogs.push({ type: 'error', message: output, ts: Date.now() });
    if (recentLogs.length > MAX_LOGS) recentLogs.shift();
  });

  psProcess.on('close', (code) => {
    syncInProgress = false;
    syncProcess = null;
    io.emit('sync:complete', { code, success: code === 0 });
  });

  res.json({ success: true, message: 'Sync started' });
});

app.post('/api/sync/stop', (req, res) => {
  if (!syncProcess) {
    return res.status(400).json({ error: 'No sync in progress' });
  }

  syncProcess.kill();
  syncProcess = null;
  syncInProgress = false;
  io.emit('sync:stopped');

  res.json({ success: true, message: 'Sync stopped' });
});

app.get('/api/logs', (req, res) => {
  // Return recent logs (most recent last)
  try {
    res.json({ logs: recentLogs.slice(-200) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/website', (req, res) => {
  const options = { hostname: '127.0.0.1', port: 3000, path: '/', method: 'GET', timeout: 3000 };
  let sent = false;
  const sendResponse = (up, statusCode = null) => {
    if (sent) return;
    sent = true;
    const responseData = { up };
    if (statusCode !== null) {
      responseData.statusCode = statusCode;
    }
    res.json(responseData);
  };

  const reqH = http.request(options, (r) => {
    sendResponse(r.statusCode >= 200 && r.statusCode < 400, r.statusCode);
  });
  reqH.on('error', () => sendResponse(false));
  reqH.on('timeout', () => {
    reqH.destroy();
    sendResponse(false);
  });
  reqH.end();
});

import { existsSync } from 'fs'; // Ensure existsSync is imported at the top

app.post('/api/start/website', (req, res) => {
  const websitePath = path.join(SENTINEL_ROOT, 'website');
  // Path to the local docusaurus executable binary on Windows
  const docusaurusBinCmd = path.join(websitePath, 'node_modules', '.bin', 'docusaurus.cmd');
  
  killProcessOnPort(3000, () => {
    try {
      // 1. ERROR TRAP: Check if Docusaurus binary is missing
      if (!existsSync(docusaurusBinCmd)) {
        console.log('Docusaurus binary not found. Initiating npm install...');
        recentLogs.push({ type: 'warning', message: 'Docusaurus not found. Running npm install in website directory...' });
        
        // Run npm install synchronously to ensure modules exist before proceeding
        exec('npm install', { cwd: websitePath }, (installErr, stdout, stderr) => {
          if (installErr) {
            console.error(`npm install failed: ${installErr}`);
            recentLogs.push({ type: 'error', message: `Dependency installation failed: ${installErr.message}` });
            return res.status(500).json({ error: 'Failed to install website dependencies automatically.' });
          }
          
          recentLogs.push({ type: 'info', message: 'Dependencies installed successfully. Starting Docusaurus...' });
          launchDocusaurusServer(websitePath);
        });
      } else {
        // 2. Clear run: Binary exists, launch immediately
        launchDocusaurusServer(websitePath);
      }

      res.json({ success: true, message: 'Website startup or recovery sequence initiated.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Helper function to keep the launch logic clean and reusable
function launchDocusaurusServer(websitePath) {
  const launchCommand = `Set-Location -Path '${websitePath}'; npm start`;
  const child = spawn('powershell.exe', [
    '-NoProfile', 
    '-ExecutionPolicy', 'Bypass', 
    '-NoExit', 
    '-Command', launchCommand
  ], { 
    cwd: websitePath, 
    detached: true, 
    stdio: 'ignore' 
  });
  
  child.unref();
  websiteStarter = child;
  recentLogs.push({ type: 'info', message: 'Launched website server on port 3000.' });
}

// Stop the Docusaurus website explicitly via process termination
app.post('/api/stop/website', (req, res) => {
  killProcessOnPort(3000, () => {
    recentLogs.push({ type: 'warning', message: 'Explicitly stopped Website server on port 3000.' });
    res.json({ success: true, message: 'Website stopped cleanly.' });
  });
});

// Stop the UI Server explicitly via process termination
app.post('/api/stop/ui', (req, res) => {
  killProcessOnPort(PORT, () => {
    recentLogs.push({ type: 'warning', message: `Explicitly stopped UI server on port ${PORT}.` });
    res.json({ success: true, message: 'UI stopped cleanly.' });
  });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.emit('status', { syncing: syncInProgress });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// CHANGED TO PORT 3001 TO ALIGN WITH PUBLIC HANDSHAKE
const PORT = process.env.PORT || 3005; 
httpServer.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Sentinel UI Server                   ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`║                                        ║`);
  console.log(`║   Website (Docusaurus):                ║`);
  console.log(`║   http://localhost:3000               ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});