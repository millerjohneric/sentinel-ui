// WebSocket connection
const socket = io();

// UI State
let appState = {
    syncing: false,
    logs: [],
    config: {},
    expandedSection: 'status'
};
appState.uiUp = false;
appState.websiteUp = false;
appState.statusCheckedAt = null;
let autoPollTimer = null;

function getPollIntervalSeconds() {
    if (!appState.config) return 30;
    const keys = Object.keys(appState.config);
    for (const k of keys) {
        if (k.toLowerCase().includes('poll') && k.toLowerCase().includes('port')) {
            const v = appState.config[k];
            const n = Number(v);
            if (!isNaN(n) && n > 0) return n;
        }
        if (k.toLowerCase().includes('poll') && k.toLowerCase().includes('seconds')) {
            const v = appState.config[k];
            const n = Number(v);
            if (!isNaN(n) && n > 0) return n;
        }
    }
    return appState.config.portPollIntervalSeconds || appState.config.portPollSeconds || 30;
}

function setupAutoPoll() {
    if (autoPollTimer) { clearInterval(autoPollTimer); autoPollTimer = null; }
    const interval = getPollIntervalSeconds();
    if (!interval || interval <= 0) return;
    
    const shouldOnlyWhileSync = !!appState.config.autoPollWhileSync;
    const startNow = !shouldOnlyWhileSync || (shouldOnlyWhileSync && appState.syncing);
    if (!startNow) return;

    autoPollTimer = setInterval(async () => {
        try {
            const statusRes = await fetch('/api/status');
            if (statusRes.ok) {
                const s = await statusRes.json();
                appState.syncing = s.syncing;
                appState.uiUp = !!s.uiActive;
                appState.websiteUp = !!s.websiteActive;
                appState.statusCheckedAt = Date.now();
            }
            updateUI();
        } catch (e) {
            console.error('Auto-poll error', e);
        }
    }, Math.max(5, interval) * 1000);
}

function startPollingIfAllowed() {
    if (autoPollTimer) return;
    const shouldOnlyWhileSync = !!appState.config.autoPollWhileSync;
    if (shouldOnlyWhileSync && !appState.syncing) return;
    setupAutoPoll();
}

function stopPollingIfNeeded() {
    const shouldOnlyWhileSync = !!appState.config.autoPollWhileSync;
    if (autoPollTimer && shouldOnlyWhileSync && !appState.syncing) {
        clearInterval(autoPollTimer);
        autoPollTimer = null;
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // 1. Render immediate structure so the user sees something
    renderApp();
    
    // 2. Fire these off without awaiting them (non-blocking)
    loadStatus();
    loadConfig();
    
    // 3. Attach listeners immediately
    attachEventListeners();
    setInterval(() => {
        const heartbeatText = document.getElementById('heartbeatText');
        if (heartbeatText) heartbeatText.textContent = getHeartbeatText();
    }, 1000);
});

// Socket events
socket.on('status', (data) => {
    appState.syncing = data.syncing;
    appState.statusCheckedAt = Date.now();
    updateUI();
});

socket.on('sync:start', () => {
    appState.syncing = true;
    appState.logs = [];
    renderApp();
    updateUI();
    startPollingIfAllowed();
});

socket.on('sync:log', (data) => {
    appState.logs.push(data);
    updateLogs();
});

socket.on('sync:complete', (data) => {
    appState.syncing = false;
    appState.logs.push({
        type: data.success ? 'info' : 'error',
        message: data.success ? '[OK] Sync completed successfully' : `[ERROR] Sync failed (code: ${data.code})`
    });
    updateLogs();
    updateUI();
    stopPollingIfNeeded();
});

socket.on('sync:stopped', () => {
    appState.syncing = false;
    appState.logs.push({ type: 'warning', message: 'Sync stopped by user' });
    updateLogs();
    updateUI();
    stopPollingIfNeeded();
});

// API Functions
async function loadStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        appState.syncing = data.syncing;
        appState.uiUp = !!data.uiActive;
        appState.websiteUp = !!data.websiteActive;
        appState.statusCheckedAt = Date.now();
        updateUI();
    } catch (error) {
        console.error('Failed to load status:', error);
    }
}

async function loadConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            appState.config = await res.json();
            updateConfig();
            
            const pollToggle = document.getElementById('pollWhileSyncToggle');
            if (pollToggle) {
                pollToggle.checked = !!appState.config.autoPollWhileSync;
            }
            
            setupAutoPoll();
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

async function startSync() {
    try {
        const res = await fetch('/api/start/sync', { method: 'POST' }); // Must be /api/start/sync
        if (!res.ok) {
            const error = await res.json();
            alert('Error: ' + error.error);
        }
    } catch (error) {
        alert('Failed to start sync: ' + error.message);
    }
}

async function stopSync() {
    if (confirm('Stop the current sync process?')) {
        try {
            const res = await fetch('/api/stop/sync', { method: 'POST' });
            if (!res.ok) {
                const error = await res.json();
                alert('Error: ' + error.error);
            }
        } catch (error) {
            alert('Failed to stop sync: ' + error.message);
        }
    }
}

async function saveConfig() {
    try {
        const res = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appState.config)
        });
        if (res.ok) {
            alert('Configuration saved successfully!');
            setupAutoPoll();
        }
    } catch (error) {
        alert('Failed to save config: ' + error.message);
    }
}

async function toggleService(action, service) {
    const logName = 'Website (3000)';
    try {
        const res = await fetch(`/api/${action}/${service}`, { method: 'POST' });
        if (res.ok) {
            appState.logs.push({ type: 'info', message: `Requested ${service} ${action} (${logName})` });
            updateLogs();
        } else {
            const err = await res.json();
            appState.logs.push({ type: 'error', message: `Failed to ${action} ${service}: ` + (err.error || res.status) });
            updateLogs();
        }
    } catch (e) {
        appState.logs.push({ type: 'error', message: `Error altering ${service} status: ` + e.message });
        updateLogs();
    }
    await loadStatus();
}

// UI Rendering
function renderApp() {
    const root = document.getElementById('root');
    if (!root) return;
    const localBrowser = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const localUiLink = localBrowser
        ? '<a href="http://127.0.0.1:3006" target="_blank" style="text-decoration: none; font-weight: bold; color: #007acc;">Local UI</a> | '
        : '';
    const siteLink = localBrowser
        ? 'http://127.0.0.1:3000/docs/culinary-cuisine'
        : 'https://millerjohneric.asuscomm.com/docs/culinary-cuisine';
    
    root.innerHTML = `
        <div class="container">
            <div class="header">
                <h1>
                    <span>Sentinel Media Sync</span>
                </h1>
                <p>Unified media archive & website generation engine</p>
            </div>

            <div class="content">
                <div class="ports-focus-section" style="margin-bottom: 20px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                    <h2 style="margin-top: 0; margin-bottom: 15px; font-size: 1.3em; display: flex; align-items: center; gap: 8px;">Ports & Access Links</h2>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.02); padding: 12px 16px; border-radius: 6px; border-left: 4px solid #007acc;">
                            <span id="uiPortIndicator" class="status-indicator ${appState.uiUp ? 'running' : 'idle'}" style="padding: 6px 12px; font-weight: bold; border-radius: 4px; display: flex; align-items: center; gap: 8px;"> 
                                <span id="uiDot" class="dot ${appState.uiUp ? 'active' : 'inactive'}"></span> UI:3006
                            </span>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <span style="margin-left: 15px; font-size: 0.95em;">
                                    ${localUiLink}
                                    <a href="https://millerjohneric.asuscomm.com:3005" target="_blank" style="text-decoration: none; font-weight: bold; color: #28a745;">External UI</a>
                                </span>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.02); padding: 12px 16px; border-radius: 6px; border-left: 4px solid #28a745;">
                            <span id="websitePortIndicator" class="status-indicator ${appState.websiteUp ? 'running' : 'idle'}" style="padding: 6px 12px; font-weight: bold; border-radius: 4px; display: flex; align-items: center; gap: 8px;"> 
                                <span id="websiteDot" class="dot ${appState.websiteUp ? 'active' : appState.syncing ? 'waiting' : 'inactive'}"></span>
                                <span id="websiteStatusText">${appState.websiteUp ? 'Website: Online' : appState.syncing ? 'Website: Waiting for sync' : 'Website: Offline'}</span>
                            </span>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <button class="primary" id="miniStartWebsiteBtn" onclick="toggleService('start', 'website')" style="padding: 6px 12px; font-size: 0.95em; border-radius: 4px;" ${appState.websiteUp ? 'disabled' : ''}>Start</button>
                                <button class="danger" id="miniStopWebsiteBtn" onclick="toggleService('stop', 'website')" style="padding: 6px 12px; font-size: 0.95em; border-radius: 4px;" ${!appState.websiteUp ? 'disabled' : ''}>Stop</button>
                                <span style="margin-left: 15px; font-size: 0.95em;">
                                    <a href="${siteLink}" target="_blank" style="text-decoration: none; font-weight: bold; color: #007acc;">Open Site</a>
                                    | <a href="https://millerjohneric.asuscomm.com/docs" target="_blank" style="text-decoration: none; font-weight: bold; color: #28a745;">External Site</a>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="status-panel" style="margin-bottom: 20px;">
                    <div class="status-card ${appState.syncing ? 'active' : 'inactive'}">
                        <h3>Status</h3>
                        <div class="value" style="display: flex; align-items: center; gap: 10px;">
                            <span class="dot ${appState.syncing ? 'active' : 'inactive'}"></span>
                            <span>${appState.syncing ? 'Running' : 'Idle'}</span>
                        </div>
                        <div class="heartbeat-line"><span class="heartbeat-dot" aria-hidden="true"></span><span id="heartbeatText">${getHeartbeatText()}</span></div>
                    </div>
                    <div class="status-card">
                        <h3>Log Entries</h3>
                        <div class="value">${appState.logs.length}</div>
                    </div>
                </div>

                <div class="controls" style="margin-bottom: 20px;">
                    <button class="primary" id="startSyncBtn" onclick="startSync()" ${appState.syncing ? 'disabled' : ''}>
                        Start Sync
                    </button>
                    <button class="danger" id="stopSyncBtn" onclick="stopSync()" ${!appState.syncing ? 'disabled' : ''}>
                        Stop Sync
                    </button>
                    <button class="secondary" id="refreshStatusBtn">
                        Refresh Status
                    </button>
                    <label style="display:flex;align-items:center;gap:8px;" title="When enabled, port polling runs only while a sync is active">
                        <input type="checkbox" id="pollWhileSyncToggle"> Poll Only While Sync
                    </label>
                    <label style="display:flex;align-items:center;gap:8px; margin-left:12px;" title="Seconds between port/status polls">
                        <span>Poll Interval (s):</span>
                        <input type="number" id="pollIntervalInput" min="5" style="width:70px; margin-left:8px;" value="${appState.config.portPollIntervalSeconds || appState.config.portPollSeconds || 30}">
                    </label>
                </div>

                <div class="section">
                    <h2>Sync Logs</h2>
                    <div class="logs-container" id="logsContainer">
                        ${appState.logs.length === 0 
                            ? '<div class="log-entry info">Ready to sync...</div>' 
                            : appState.logs.map(log => `<div class="log-entry ${log.type}">${escapeHtml(log.message)}</div>`).join('')
                        }
                    </div>
                </div>

                <div class="section">
                    <h2>Configuration</h2>
                    <div class="config-form" id="configForm">
                        <p style="color: #666; font-size: 0.9em;">Loading configuration...</p>
                    </div>
                    <button class="primary" onclick="saveConfig()" style="margin-top: 15px;">
                        Save Configuration
                    </button>
                </div>
            </div>

            <div class="footer">
                <p>Sentinel v20.154 | Media Sync Engine for Source Studio</p>
            </div>
        </div>
    `;
}

function updateUI() {
    const statusCard = document.querySelector('.status-card.active, .status-card.inactive');
    if (statusCard) {
        statusCard.classList.toggle('active', appState.syncing);
        statusCard.classList.toggle('inactive', !appState.syncing);
        const value = statusCard.querySelector('.value');
        if (value) {
            value.innerHTML = appState.syncing 
                ? '<span class="dot active"></span><span>Running</span>'
                : '<span class="dot inactive"></span><span>Idle</span>';
        }
    }

    const startBtn = document.getElementById('startSyncBtn');
    const stopBtn = document.getElementById('stopSyncBtn');
    if (startBtn) startBtn.disabled = appState.syncing;
    if (stopBtn) stopBtn.disabled = !appState.syncing;

    const uiIndicator = document.getElementById('uiPortIndicator');
    const uiDot = document.getElementById('uiDot');
    const websiteIndicator = document.getElementById('websitePortIndicator');
    const websiteDot = document.getElementById('websiteDot');
    
    if (uiIndicator && uiDot) {
        uiIndicator.classList.toggle('running', appState.uiUp);
        uiIndicator.classList.toggle('idle', !appState.uiUp);
        uiDot.classList.toggle('active', appState.uiUp);
        uiDot.classList.toggle('inactive', !appState.uiUp);
    }
    if (websiteIndicator && websiteDot) {
        websiteIndicator.classList.toggle('running', appState.websiteUp);
        websiteIndicator.classList.toggle('idle', !appState.websiteUp);
        websiteDot.classList.toggle('active', appState.websiteUp);
        websiteDot.classList.toggle('inactive', !appState.websiteUp);
        websiteDot.classList.toggle('waiting', !appState.websiteUp && appState.syncing);
        const websiteText = document.getElementById('websiteStatusText');
        if (websiteText) websiteText.textContent = appState.websiteUp ? 'Website: Online' : appState.syncing ? 'Website: Waiting for sync' : 'Website: Offline';
    }
    const heartbeatText = document.getElementById('heartbeatText');
    if (heartbeatText) heartbeatText.textContent = getHeartbeatText();

    const miniStartWeb = document.getElementById('miniStartWebsiteBtn');
    const miniStopWeb = document.getElementById('miniStopWebsiteBtn');

    if (miniStartWeb) miniStartWeb.disabled = appState.websiteUp;
    if (miniStopWeb) miniStopWeb.disabled = !appState.websiteUp;
}

function getHeartbeatText() {
    if (!appState.statusCheckedAt) return 'Waiting for first status check';
    const seconds = Math.max(0, Math.floor((Date.now() - appState.statusCheckedAt) / 1000));
    return seconds < 2 ? 'Status checked just now' : `Status checked ${seconds}s ago`;
}

function updateLogs() {
    const container = document.getElementById('logsContainer');
    if (container) {
        container.innerHTML = appState.logs.map(log => `<div class="log-entry ${log.type}">${escapeHtml(log.message)}</div>`).join('');
        container.scrollTop = container.scrollHeight;
    }
}

function updateConfig() {
    const form = document.getElementById('configForm');
    if (form && appState.config) {
        let html = '';
        for (const [key, value] of Object.entries(appState.config)) {
            const displayKey = key.replace(/([A-Z])/g, ' $1').trim();
            const valueStr = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            html += `
                <div class="form-group">
                    <label for="config_${key}">${displayKey}</label>
                    <textarea id="config_${key}" onchange="updateConfigValue('${key}')">${valueStr}</textarea>
                </div>
            `;
        }
        form.innerHTML = html;
    }
}

function updateConfigValue(key) {
    const element = document.getElementById(`config_${key}`);
    if (element) {
        try {
            const value = element.value;
            try {
                appState.config[key] = JSON.parse(value);
            } catch {
                appState.config[key] = value;
            }
        } catch (error) {
            console.error('Error updating config:', error);
        }
    }
}

function attachEventListeners() {
    const refreshBtn = document.getElementById('refreshStatusBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Refreshing...';
            try {
                await loadStatus();
                const logsRes = await fetch('/api/logs');
                if (logsRes.ok) {
                    const data = await logsRes.json();
                    appState.logs = data.logs || appState.logs;
                    updateLogs();
                }
                
                // Add explicit feedback on manual refresh click
                appState.logs.push({ 
                    type: appState.websiteUp ? 'info' : appState.syncing ? 'info' : 'warning',
                    message: appState.websiteUp ? 'Website is online (port 3000)' : appState.syncing ? 'Sync is still running; the website will start after it completes successfully.' : 'Website is offline (port 3000)'
                });
                updateLogs();
            } catch (e) {
                console.error('Refresh failed', e);
            }
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Status';
        });
    }

    const pollToggle = document.getElementById('pollWhileSyncToggle');
    if (pollToggle) {
        pollToggle.addEventListener('change', () => {
            appState.config.autoPollWhileSync = !!pollToggle.checked;
            for (const key of Object.keys(appState.config)) {
                const el = document.getElementById(`config_${key}`);
                if (el) {
                    el.value = typeof appState.config[key] === 'object' ? JSON.stringify(appState.config[key], null, 2) : String(appState.config[key]);
                }
            }
            saveConfig();
        });
    }

    const pollInput = document.getElementById('pollIntervalInput');
    if (pollInput) {
        pollInput.addEventListener('change', () => {
            const v = Number(pollInput.value);
            if (!isNaN(v) && v > 0) {
                appState.config.portPollIntervalSeconds = Math.max(5, Math.floor(v));
                for (const key of Object.keys(appState.config)) {
                    const el = document.getElementById(`config_${key}`);
                    if (el) {
                        el.value = typeof appState.config[key] === 'object' ? JSON.stringify(appState.config[key], null, 2) : String(appState.config[key]);
                    }
                }
                saveConfig();
                setupAutoPoll();
            }
        });
    }
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
