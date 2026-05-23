// WebSocket connection
const socket = io();

// UI State
let appState = {
    syncing: false,
    logs: [],
    config: {},
    expandedSection: 'status'  // Which section is currently expanded
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    renderApp();
    loadStatus();
    loadConfig();
    attachEventListeners();
});

// Socket events
socket.on('status', (data) => {
    appState.syncing = data.syncing;
    updateUI();
});

socket.on('sync:start', () => {
    appState.syncing = true;
    appState.logs = [];
    updateUI();
});

socket.on('sync:log', (data) => {
    appState.logs.push(data);
    updateLogs();
});

socket.on('sync:complete', (data) => {
    appState.syncing = false;
    appState.logs.push({
        type: data.success ? 'info' : 'error',
        message: data.success ? '✓ Sync completed successfully' : `✗ Sync failed (code: ${data.code})`
    });
    updateLogs();
    updateUI();
});

socket.on('sync:stopped', () => {
    appState.syncing = false;
    appState.logs.push({ type: 'warning', message: 'Sync stopped by user' });
    updateLogs();
    updateUI();
});

// API Functions
async function loadStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        appState.syncing = data.syncing;
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
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

async function startSync() {
    try {
        const res = await fetch('/api/sync/start', { method: 'POST' });
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
            const res = await fetch('/api/sync/stop', { method: 'POST' });
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
        }
    } catch (error) {
        alert('Failed to save config: ' + error.message);
    }
}

function openWebsite() {
    window.open('http://localhost:3000', '_blank');
}

// UI Rendering
function renderApp() {
    const root = document.getElementById('root');
    root.innerHTML = `
        <div class="container">
            <div class="header">
                <h1>
                    <span>📡</span>
                    <span>Sentinel Media Sync</span>
                </h1>
                <p>Unified media archive & website generation engine</p>
            </div>

            <div class="content">
                <!-- Status Panel -->
                <div class="status-panel">
                    <div class="status-card ${appState.syncing ? 'active' : 'inactive'}">
                        <h3>Status</h3>
                        <div class="value" style="display: flex; align-items: center; gap: 10px;">
                            <span class="dot ${appState.syncing ? 'active' : 'inactive'}"></span>
                            <span>${appState.syncing ? 'Running' : 'Idle'}</span>
                        </div>
                    </div>
                    <div class="status-card">
                        <h3>Log Entries</h3>
                        <div class="value">${appState.logs.length}</div>
                    </div>
                </div>

                <!-- Controls -->
                <div class="controls">
                    <button class="primary" onclick="startSync()" ${appState.syncing ? 'disabled' : ''}>
                        ▶ Start Sync
                    </button>
                    <button class="danger" onclick="stopSync()" ${!appState.syncing ? 'disabled' : ''}>
                        ⏹ Stop Sync
                    </button>
                    <button class="secondary" onclick="openWebsite()">
                        🌐 Open Website
                    </button>
                </div>

                <!-- Logs Section -->
                <div class="section">
                    <h2>📋 Sync Logs</h2>
                    <div class="logs-container" id="logsContainer">
                        ${appState.logs.length === 0 
                            ? '<div class="log-entry info">Ready to sync...</div>' 
                            : appState.logs.map(log => 
                                `<div class="log-entry ${log.type}">${escapeHtml(log.message)}</div>`
                            ).join('')
                        }
                    </div>
                </div>

                <!-- Configuration Section -->
                <div class="section">
                    <h2>⚙️ Configuration</h2>
                    <div class="config-form" id="configForm">
                        <p style="color: #666; font-size: 0.9em;">Loading configuration...</p>
                    </div>
                    <button class="primary" onclick="saveConfig()" style="margin-top: 15px;">
                        💾 Save Configuration
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

    const startBtn = document.querySelector('button.primary');
    const stopBtn = document.querySelector('button.danger');
    if (startBtn) startBtn.disabled = appState.syncing;
    if (stopBtn) stopBtn.disabled = !appState.syncing;
}

function updateLogs() {
    const container = document.getElementById('logsContainer');
    if (container) {
        container.innerHTML = appState.logs.map(log => 
            `<div class="log-entry ${log.type}">${escapeHtml(log.message)}</div>`
        ).join('');
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
            // Try to parse as JSON first
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
    // Event listeners are inline in HTML (onclick attributes)
}

// Utility functions
function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
