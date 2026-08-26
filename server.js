import express from 'express';
import https from 'https';
import http from 'http';
import { Server } from 'socket.io';
import fs, { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;
const SENTINEL_ROOT = path.resolve(__dirname, '..');

const CONFIG_FILE = process.env.CONFIG_FILE || path.join(SENTINEL_ROOT, 'sentinel-media-sync', 'Sentinel-Config.yml');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let websiteProcess = null;
let syncProcess = null;
let recentLogs = [];
let isSyncing = false;

// Create HTTP/HTTPS server and attach Socket.io
const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');

let server;
if (existsSync(keyPath) && existsSync(certPath)) {
  const sslOptions = {
    key: readFileSync(keyPath),
    cert: readFileSync(certPath)
  };
  server = https.createServer(sslOptions, app);
} else {
  server = http.createServer(app);
}

const io = new Server(server);

io.on('connection', (socket) => {
  // Send current status immediately upon client connection
  socket.emit('status', { syncing: isSyncing });
});

function addLog(type, message) {
  const timestamp = new Date().toISOString();
  recentLogs.push({ timestamp, type, message });
  if (recentLogs.length > 200) {
    recentLogs.shift();
  }
  // Broadcast log to all connected WebSocket clients
  io.emit('sync:log', { type, message });
}

function parseConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const content = readFileSync(CONFIG_FILE, 'utf8');
    if (YAML) {
      return YAML.parse ? YAML.parse(content) : YAML.load(content);
    }
  } catch (err) {
    console.error('Error parsing Sentinel-Config.yml:', err.message);
  }
  return null;
}

function getWebsitePath() {
  if (process.env.WEBSITE_STAGING_PATH) {
    return process.env.WEBSITE_STAGING_PATH;
  }
  const config = parseConfig();
  if (config && Array.isArray(config.Locations)) {
    const webRoot = config.Locations.find(loc => loc.RootType === 'web-root' || loc.Role === 'Website');
    if (webRoot && webRoot.Path) {
      return webRoot.Path;
    }
  }
  return path.join(SENTINEL_ROOT, 'website');
}

function killProcessOnPort(port, callback) {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    const cmd = `for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`;
    exec(cmd, () => {
      if (callback) callback();
    });
  } else {
    exec(`fuser -k ${port}/tcp`, () => {
      if (callback) callback();
    });
  }
}

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? `netstat -aon | findstr :${port} | findstr LISTENING`
      : `lsof -i:${port} -sTCP:LISTEN`;

    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function launchDocusaurusServer(websitePath) {
  const isWindows = process.platform === 'win32';
  const docusaurusBin = isWindows
    ? path.join(websitePath, 'node_modules', '.bin', 'docusaurus.cmd')
    : path.join(websitePath, 'node_modules', '.bin', 'docusaurus');

  addLog('info', `Starting Docusaurus server in ${websitePath}...`);

  if (existsSync(docusaurusBin)) {
    websiteProcess = spawn(docusaurusBin, ['start', '--port', '3000'], {
      cwd: websitePath,
      shell: true,
      env: { ...process.env, PORT: '3000' }
    });
  } else {
    websiteProcess = spawn('npm', ['start', '--', '--port', '3000'], {
      cwd: websitePath,
      shell: true,
      env: { ...process.env, PORT: '3000' }
    });
  }

  websiteProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('info', `[Website] ${msg}`);
  });

  websiteProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) addLog('warning', `[Website] ${msg}`);
  });

  websiteProcess.on('close', (code) => {
    addLog('info', `Website process exited with code ${code}`);
    websiteProcess = null;
  });
}
app.post('/api/start/website', async (req, res) => {
  const websitePath = getWebsitePath();
  addLog('info', `Requested website start for target directory: ${websitePath}`);

  if (!existsSync(websitePath)) {
    addLog('error', `Website directory does not exist: ${websitePath}`);
    return res.status(404).json({ error: `Website directory does not exist: ${websitePath}` });
  }

  killProcessOnPort(3000, () => {
    try {
      const docusaurusBinCmd = path.join(websitePath, 'node_modules', '.bin', 'docusaurus.cmd');
      const docusaurusBinUnix = path.join(websitePath, 'node_modules', '.bin', 'docusaurus');

      if (!existsSync(docusaurusBinCmd) && !existsSync(docusaurusBinUnix)) {
        addLog('warning', `Docusaurus binary not found in ${websitePath}. Running npm install...`);

        exec('npm install', { cwd: websitePath }, (installErr) => {
          if (installErr) {
            addLog('error', `npm install failed in ${websitePath}: ${installErr.message}`);
            return res.status(500).json({ error: 'Failed to install website dependencies.' });
          }
          addLog('info', 'Dependencies installed successfully. Launching Docusaurus...');
          launchDocusaurusServer(websitePath);
        });
      } else {
        launchDocusaurusServer(websitePath);
      }

      res.json({ success: true, message: `Website startup sequence initiated in ${websitePath}.` });
    } catch (error) {
      addLog('error', `Failed to start website: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  });
});

app.post('/api/start/sync', (req, res) => {
    if (isSyncing) {
        return res.status(400).json({ error: 'Sync process is already running.' });
    }
    isSyncing = true;
    addLog('info', 'Starting media sync process...');
    // TODO: Add your sync child_process spawn logic here
    io.emit('status', { syncing: isSyncing });
    res.json({ success: true, message: 'Sync started successfully.' });
});

app.post('/api/stop/sync', (req, res) => {
    if (!isSyncing) {
        return res.status(400).json({ error: 'No sync process is currently running.' });
    }
    isSyncing = false;
    addLog('warning', 'Stopping media sync process...');
    // TODO: Add your sync kill logic here
    io.emit('status', { syncing: isSyncing });
    res.json({ success: true, message: 'Sync stopped successfully.' });
});

app.get('/api/status', async (req, res) => {
  const uiActive = await checkPortInUse(PORT);
  const websiteActive = await checkPortInUse(3000);

  res.json({
    status: isSyncing ? 'Syncing' : 'Idle',
    syncing: isSyncing,
    uiPort: PORT,
    uiActive,
    websitePort: 3000,
    websiteActive,
    logCount: recentLogs.length,
    websitePath: getWebsitePath()
  });
});

app.get('/api/config', (req, res) => {
  const config = parseConfig();
  if (config) {
    res.json(config);
  } else {
    res.status(404).json({ error: 'Configuration file not found or empty.' });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const newConfig = req.body;
    const yamlStr = YAML.stringify(newConfig);
    fs.writeFileSync(CONFIG_FILE, yamlStr, 'utf8');
    addLog('info', 'Configuration updated successfully via UI.');
    res.json({ success: true });
  } catch (err) {
    addLog('error', `Failed to save configuration: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', (req, res) => {
  res.json({ logs: recentLogs });
});

app.post('/api/stop/website', (req, res) => {
  addLog('info', 'Requested website stop.');
  killProcessOnPort(3000, () => {
    if (websiteProcess) {
      try {
        websiteProcess.kill();
      } catch (e) {}
      websiteProcess = null;
    }
    addLog('info', 'Website process stopped.');
    res.json({ success: true, message: 'Website server stopped on port 3000.' });
  });
});

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Sentinel Media Sync UI</title></head>
        <body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: #f8fafc;">
          <h1>Sentinel Media Sync - UI Engine</h1>
          <p>Status: Active on Port ${PORT}</p>
        </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  const protocol = existsSync(keyPath) && existsSync(certPath) ? 'https' : 'http';
  console.log(`Sentinel UI Engine running on ${protocol}://localhost:${PORT}`);
  addLog('info', `Sentinel UI Engine running on ${protocol}://localhost:${PORT}`);
});