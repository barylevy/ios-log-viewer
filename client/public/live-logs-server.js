#!/usr/bin/env node
/**
 * Live Logs Server
 * Reads current Cato client log directories, sends initial content to browser
 * clients via WebSocket, then polls for new content every second.
 *
 * NOTE: Some paths under /private/var/root require root access.
 * Run with:  sudo node scripts/live-logs-server.js
 *
 * The client connects to ws://localhost:3001
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 4000;
const POLL_MS = 1000; // how often to check for new bytes

// ─── Source definitions ───────────────────────────────────────────────────────
// Each entry becomes one tab in the viewer.
// type 'dir'  → read all matching files in the directory, sorted naturally.
// type 'file' → read that single file.
const HOME = os.homedir();
const SOURCES = [
  {
    key: 'app',
    label: 'AppLogs',
    type: 'dir',
    path: path.join(HOME, 'Library/Group Containers/CKGSB8CH43.group/AppLogs'),
    pattern: /\.(log|txt)$/i,
  },
  {
    key: 'ext',
    label: 'Extension',
    type: 'dir',
    path: '/private/var/root/Library/Group Containers/CKGSB8CH43.group/AppExtensionLogs',
    pattern: /\.(log|txt)$/i,
  },
  {
    key: 'dns',
    label: 'DNSRelay',
    type: 'dir',
    path: '/private/var/root/Library/Group Containers/CKGSB8CH43.group/DNSExtensionLogs',
    pattern: /\.(log|txt)$/i,
  },
  {
    key: 'agent',
    label: 'UserAgent',
    type: 'dir',
    path: path.join(HOME, 'Library/Logs/CatoNetworksUserAgent'),
    pattern: /\.(log|txt)$/i,
  },
  {
    key: 'daemon',
    label: 'Daemon',
    type: 'dir',
    path: '/private/var/root/Library/Logs/com.catonetworks.mac.CatoClient.helper',
    pattern: /\.(log|txt)$/i,
  },
  {
    key: 'install',
    label: 'Install',
    type: 'file',
    path: '/var/tmp/catoinstallext.txt',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Natural sort so log.1 < log.2 < log.10 */
function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Read all matching files in a directory, concatenated in natural sort order. */
function readDir(dirPath, pattern) {
  try {
    const names = fs.readdirSync(dirPath)
      .filter(n => !pattern || pattern.test(n))
      .sort(naturalSort);

    let content = '';
    for (const name of names) {
      const full = path.join(dirPath, name);
      try {
        const stat = fs.statSync(full);
        if (!stat.isFile()) continue;
        const text = fs.readFileSync(full, 'utf8');
        content += text;
        if (text.length > 0 && !text.endsWith('\n')) content += '\n';
      } catch { /* skip unreadable files */ }
    }
    return content;
  } catch {
    return '';
  }
}

/** Read a single file, or return '' on error. */
function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function readSource(src) {
  return src.type === 'dir'
    ? readDir(src.path, src.pattern)
    : readFile(src.path);
}

// ─── State ────────────────────────────────────────────────────────────────────
// We track the last known content length per source so we can diff cheaply.
const state = {}; // { [key]: string } — always the full current content

function init() {
  for (const src of SOURCES) {
    state[src.key] = readSource(src);
    if (state[src.key].length > 0) {
      console.log(`  ✓ ${src.label}: ${state[src.key].length} bytes`);
    } else {
      console.log(`  ✗ ${src.label}: not found or empty (${src.path})`);
    }
  }
}

// ─── HTTP + WebSocket server ───────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/sources') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(SOURCES.map(s => ({ key: s.key, label: s.label }))));
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('[live-logs] Client connected');

  // Record where each source stands RIGHT NOW for this client.
  // We only stream bytes written after this connection moment.
  const offsets = {}; // { [sourceKey]: number }
  for (const src of SOURCES) {
    offsets[src.key] = state[src.key].length;
    // Send an empty initial message so the viewer creates the tab
    ws.send(JSON.stringify({
      type: 'initial',
      sourceKey: src.key,
      label: src.label,
      content: '',
    }));
  }

  // Attach offsets to the socket so the polling loop can use them
  ws.clientOffsets = offsets;

  ws.on('error', err => console.error('[live-logs] WS error:', err.message));
  ws.on('close', () => console.log('[live-logs] Client disconnected'));
});

// ─── Polling loop ─────────────────────────────────────────────────────────────
setInterval(() => {
  if (wss.clients.size === 0) return; // No clients — skip work

  for (const src of SOURCES) {
    const prev = state[src.key];
    const curr = readSource(src);

    if (curr === prev) continue; // Nothing changed

    const isAppend = curr.length > prev.length && curr.startsWith(prev);
    state[src.key] = curr;

    wss.clients.forEach(client => {
      if (client.readyState !== WebSocket.OPEN) return;

      const clientOffset = client.clientOffsets[src.key] ?? 0;

      let msg;
      if (isAppend && curr.length > clientOffset) {
        // Send only the bytes this client hasn't seen yet
        const newContent = curr.slice(clientOffset);
        msg = JSON.stringify({ type: 'append', sourceKey: src.key, label: src.label, content: newContent });
        client.clientOffsets[src.key] = curr.length;
      } else if (!isAppend) {
        // File rotated/truncated — reset client offset and send everything from 0
        msg = JSON.stringify({ type: 'reset', sourceKey: src.key, label: src.label, content: curr });
        client.clientOffsets[src.key] = curr.length;
      }

      if (msg) client.send(msg);
    });
  }
}, POLL_MS);

// ─── Start ────────────────────────────────────────────────────────────────────
console.log('[live-logs] Initialising sources...');
init();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n[live-logs] Server ready at ws://localhost:${PORT}`);
  console.log('[live-logs] Press Ctrl-C to stop.\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Check if it's our own server already running on that port
    http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (body.trim() === 'ok') {
          console.log(`\n[live-logs] Server is already running on port ${PORT} — nothing to do.`);
          console.log('[live-logs] Connect the viewer and click Online.\n');
        } else {
          printPortConflict();
        }
        process.exit(0);
      });
    }).on('error', printPortConflict);
  } else {
    console.error('[live-logs] Server error:', err.message);
    process.exit(1);
  }
});

function printPortConflict() {
  console.error(`\n[live-logs] ERROR: Port ${PORT} is already in use by another process.`);
  console.error(`\nTo free it, run:`);
  console.error(`  lsof -ti:${PORT} | xargs kill\n`);
  console.error(`Then start the server again.\n`);
  process.exit(1);
}
