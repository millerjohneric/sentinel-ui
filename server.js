import express from 'express';
import https from 'https';
import http from 'http';
import { Server } from 'socket.io';
import fs, { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec, execFile, spawn } from 'child_process';
import net from 'net';
import { randomBytes, timingSafeEqual } from 'crypto';
import YAML from 'yaml';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dotenvPath = path.join(__dirname, '.env');
dotenv.config({ path: dotenvPath });

const UI_USERNAME = process.env.SENTINEL_UI_USERNAME || 'sentinel-admin';
if (!process.env.SENTINEL_UI_PASSWORD) {
  const generatedPassword = randomBytes(32).toString('base64url');
  const envContents = existsSync(dotenvPath) ? readFileSync(dotenvPath, 'utf8') : '';
  const separator = envContents && !envContents.endsWith('\n') ? '\n' : '';
  const usernameExistsInFile = /^SENTINEL_UI_USERNAME\s*=/m.test(envContents);
  const usernameEntry = usernameExistsInFile ? '' : `SENTINEL_UI_USERNAME=${UI_USERNAME}\n`;
  fs.appendFileSync(dotenvPath, `${separator}${usernameEntry}SENTINEL_UI_PASSWORD=${generatedPassword}\n`, { encoding: 'utf8', mode: 0o600 });
  process.env.SENTINEL_UI_PASSWORD = generatedPassword;
  console.log(`Generated Sentinel UI login. Username: ${UI_USERNAME}. Password is stored in ${dotenvPath}.`);
}
const UI_PASSWORD = process.env.SENTINEL_UI_PASSWORD;

function hasValidUiCredentials(authorization) {
  if (!authorization?.startsWith('Basic ')) return false;
  let username;
  let password;
  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return false;
    username = decoded.slice(0, separatorIndex);
    password = decoded.slice(separatorIndex + 1);
  } catch {
    return false;
  }
  const suppliedUser = Buffer.from(username);
  const expectedUser = Buffer.from(UI_USERNAME);
  const suppliedPassword = Buffer.from(password);
  const expectedPassword = Buffer.from(UI_PASSWORD);
  const userMatches = suppliedUser.length === expectedUser.length && timingSafeEqual(suppliedUser, expectedUser);
  const passwordMatches = suppliedPassword.length === expectedPassword.length && timingSafeEqual(suppliedPassword, expectedPassword);
  return userMatches && passwordMatches;
}

function isLocalDirectConnection(remoteAddress, headers = {}) {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
  const forwardedByProxy = Boolean(headers['x-real-ip'] || headers['x-forwarded-for']);
  return loopback && !forwardedByProxy;
}

const app = express();
const PORT = Number(process.env.PORT || 3006);
const WEBSITE_PORT = Number(process.env.WEBSITE_PORT || 3000);
const SENTINEL_ROOT = path.resolve(__dirname, '..');

const CONFIG_FILE = process.env.CONFIG_FILE || process.env.CONFIG_PATH || path.join(SENTINEL_ROOT, 'sentinel-media-sync', 'Sentinel-Config.yml');

app.use((req, res, next) => {
  if (isLocalDirectConnection(req.socket.remoteAddress, req.headers) || hasValidUiCredentials(req.headers.authorization)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Sentinel UI", charset="UTF-8"');
  return res.status(401).send('Sentinel UI login required.');
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let websiteProcess = null;
let syncProcess = null;
let recentLogs = [];
let isSyncing = false;

const RUN_SENTINEL_SCRIPT = path.join(SENTINEL_ROOT, 'sentinel-media-sync', 'Run-Sentinel.ps1');

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

io.use((socket, next) => {
  if (isLocalDirectConnection(socket.handshake.address, socket.handshake.headers) || hasValidUiCredentials(socket.handshake.headers.authorization)) return next();
  return next(new Error('Unauthorized'));
});

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
    if (webRoot && (webRoot.SitePath || webRoot.Path)) {
      return webRoot.SitePath || webRoot.Path;
    }
  }
  return path.join(SENTINEL_ROOT, 'website');
}

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', (error) => resolve(error.code === 'EADDRINUSE'));
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => resolve(false));
    });
  });
}

function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], (error) => {
      if (error) addLog('warning', `Could not stop process tree ${child.pid}: ${error.message}`);
    });
    return;
  }
  child.kill();
}

function launchDocusaurusServer(websitePath) {
  const isWindows = process.platform === 'win32';
  const docusaurusBin = isWindows
    ? path.join(websitePath, 'node_modules', '.bin', 'docusaurus.cmd')
    : path.join(websitePath, 'node_modules', '.bin', 'docusaurus');

  addLog('info', `Starting Docusaurus server in ${websitePath}...`);

  if (existsSync(docusaurusBin)) {
    websiteProcess = spawn(docusaurusBin, ['start', '--host', '127.0.0.1', '--port', String(WEBSITE_PORT)], {
      cwd: websitePath,
      shell: true,
      env: { ...process.env, PORT: String(WEBSITE_PORT) }
    });
  } else {
    websiteProcess = spawn('npm', ['start', '--', '--host', '127.0.0.1', '--port', String(WEBSITE_PORT)], {
      cwd: websitePath,
      shell: true,
      env: { ...process.env, PORT: String(WEBSITE_PORT) }
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
  websiteProcess.on('error', (error) => {
    addLog('error', `Failed to start Docusaurus: ${error.message}`);
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

  if (websiteProcess && websiteProcess.exitCode === null) {
    return res.status(409).json({ error: 'Website process is already running.' });
  }
  if (await checkPortInUse(WEBSITE_PORT)) {
    return res.status(409).json({ error: `Port ${WEBSITE_PORT} is already in use by a process Sentinel does not own. Stop it manually before starting the website.` });
  }

  const docusaurusBinCmd = path.join(websitePath, 'node_modules', '.bin', 'docusaurus.cmd');
  const docusaurusBinUnix = path.join(websitePath, 'node_modules', '.bin', 'docusaurus');
  if (!existsSync(docusaurusBinCmd) && !existsSync(docusaurusBinUnix)) {
    addLog('warning', `Docusaurus binary not found in ${websitePath}. Running npm install...`);
    exec('npm install', { cwd: websitePath }, (installErr) => {
      if (installErr) {
        addLog('error', `npm install failed in ${websitePath}: ${installErr.message}`);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to install website dependencies.' });
        return;
      }
      addLog('info', 'Dependencies installed successfully. Launching Docusaurus...');
      launchDocusaurusServer(websitePath);
      if (!res.headersSent) res.json({ success: true, message: `Website startup sequence initiated in ${websitePath}.` });
    });
    return;
  }

  launchDocusaurusServer(websitePath);
  return res.json({ success: true, message: `Website startup sequence initiated in ${websitePath}.` });
});

app.post('/api/start/sync', (req, res) => {
    if (isSyncing) {
        return res.status(400).json({ error: 'Sync process is already running.' });
    }
    if (!existsSync(RUN_SENTINEL_SCRIPT)) {
      return res.status(404).json({ error: `Sentinel runner not found: ${RUN_SENTINEL_SCRIPT}` });
    }

    isSyncing = true;
    addLog('info', 'Starting media sync process...');
    io.emit('status', { syncing: isSyncing });

    syncProcess = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', RUN_SENTINEL_SCRIPT
    ], { cwd: SENTINEL_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });

    syncProcess.stdout.on('data', (data) => addLog('info', data.toString().trim()));
    syncProcess.stderr.on('data', (data) => addLog('error', data.toString().trim()));
    syncProcess.on('error', (error) => {
      addLog('error', `Failed to run media sync: ${error.message}`);
      isSyncing = false;
      syncProcess = null;
      io.emit('status', { syncing: false });
    });
    syncProcess.on('close', (code) => {
      syncProcess = null;
      isSyncing = false;
      io.emit('status', { syncing: false });
      addLog(code === 0 ? 'info' : 'error', `Media sync exited with code ${code}.`);

      if (code === 0) {
        const config = parseConfig();
        const website = config?.Locations?.find((loc) =>
          loc.RootType === 'web-root' || (loc.Role === 'Website' && loc.SitePath)
        );
        const websitePath = website?.SitePath || website?.Path || getWebsitePath();
        if (website?.AutoStart === true && existsSync(websitePath)) {
          checkPortInUse(WEBSITE_PORT).then((websiteActive) => {
            if (websiteActive) {
              addLog('info', `Sync complete; website port ${WEBSITE_PORT} is already in use.`);
              return;
            }
            addLog('info', `Sync complete; starting website from ${websitePath} on port ${WEBSITE_PORT}.`);
            launchDocusaurusServer(websitePath);
          }).catch((error) => addLog('error', `Website auto-start check failed: ${error.message}`));
        }
      }
    });

    res.json({ success: true, message: 'Media sync started.' });
});

app.post('/api/stop/sync', (req, res) => {
    if (!isSyncing) {
        return res.status(400).json({ error: 'No sync process is currently running.' });
    }
    addLog('warning', 'Stopping media sync process...');
    if (syncProcess) {
      stopOwnedProcess(syncProcess);
    } else {
      isSyncing = false;
      io.emit('status', { syncing: false });
    }
    res.json({ success: true, message: 'Sync stop requested.' });
});

app.get('/api/status', async (req, res) => {
  const uiActive = await checkPortInUse(PORT);
  const websiteActive = await checkPortInUse(WEBSITE_PORT);

  res.json({
    status: isSyncing ? 'Syncing' : 'Idle',
    syncing: isSyncing,
    uiPort: PORT,
    uiActive,
    websitePort: WEBSITE_PORT,
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
  if (!websiteProcess || websiteProcess.exitCode !== null) {
    return res.status(409).json({ error: 'Sentinel does not own a running website process; no process was stopped.' });
  }
  stopOwnedProcess(websiteProcess);
  return res.json({ success: true, message: `Sentinel website process stopped on port ${WEBSITE_PORT}.` });
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

server.listen(PORT, '127.0.0.1', () => {
  const protocol = existsSync(keyPath) && existsSync(certPath) ? 'https' : 'http';
  console.log(`Sentinel UI Engine running on ${protocol}://localhost:${PORT}`);
  addLog('info', `Sentinel UI Engine running on ${protocol}://localhost:${PORT}`);
});
