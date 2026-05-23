import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

// Store active sync process
let syncProcess = null;
let syncInProgress = false;

// API Routes
app.get('/api/status', (req, res) => {
  res.json({
    syncing: syncInProgress,
    coreScript: CORE_SCRIPT,
    configFile: CONFIG_FILE,
    rootPath: SENTINEL_ROOT
  });
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
  });

  psProcess.stderr.on('data', (data) => {
    const output = data.toString();
    console.log('STDERR:', output);
    io.emit('sync:log', { type: 'error', message: output });
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
  // Placeholder for log retrieval
  res.json({ logs: [] });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.emit('status', { syncing: syncInProgress });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║   Sentinel UI Server                   ║`);
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log(`║                                        ║`);
  console.log(`║   Website (Docusaurus):                ║`);
  console.log(`║   http://localhost:3000               ║`);
  console.log(`╚════════════════════════════════════════╝\n`);
});
