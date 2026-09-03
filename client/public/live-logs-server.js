#!/usr/bin/env node
/**
 * Live Logs Server
 * Reads current Cato client log locations, sends the recent tail on connect,
 * then polls for new content every second and streams it to browser clients
 * over WebSocket.
 *
 * macOS — reads the fixed Cato log directories. Some paths under
 *         /private/var/root require root access:
 *           sudo node scripts/live-logs-server.js
 *
 * Windows — tails the most recently modified cato_vpn_*.log inside the log
 *         directory. Give the full path; nothing is appended to it:
 *           node live-logs-server.js --dir="C:\\Program Files (x86)\\Cato Networks\\Cato Client"
 *           set CATO_LOG_DIR=C:\\Program Files (x86)\\Cato Networks\\Cato Client
 *           the viewer's Settings ▸ Live Logs Settings dialog (persisted)
 *
 * The client connects to ws://localhost:4000
 *
 * NOTE: this file is downloaded standalone by the in-app setup command, so it
 * must stay dependency-free apart from `ws`. It is also mirrored to
 * client/public/live-logs-server.js by scripts/sync-public.js — run that after
 * editing (client `predev`/`prebuild` do it automatically).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { StringDecoder } = require('string_decoder');

const PORT = 4000;
const POLL_MS = 1000; // how often to check for new bytes

const IS_WIN = process.platform === 'win32';

// ─── Source definitions ───────────────────────────────────────────────────────
// Each entry becomes one tab in the viewer.
// type 'dir'    → read all matching files in the directory, sorted naturally.
// type 'file'   → read that single file.
// type 'latest' → tail the most recently modified matching file in a directory.
const HOME = os.homedir();

/**
 * The first candidate directory that exists, else candidates[0] so callers
 * still have a path to report. Used where a folder's exact name isn't certain.
 */
function firstExistingDir(candidates) {
  for (const dir of candidates) {
    try { if (fs.statSync(dir).isDirectory()) return dir; } catch { /* try next */ }
  }
  return candidates[0];
}

// Anti-tamper isn't a directory of its own: it's AntiTamperLogs.log sitting
// inside the ROOT container's AppLogs folder. Note that's a different folder
// from the `app` source above, which reads the USER container's AppLogs.
// The pattern keeps this tab to anti-tamper files and tolerates rotation
// (AntiTamperLogs.1.log and friends).
const MAC_ANTITAMPER_PATTERN = /^AntiTamperLogs.*\.(log|txt)$/i;
const MAC_ANTITAMPER_DIRS = [
  '/private/var/root/Library/Group Containers/CKGSB8CH43.group/AppLogs',        // confirmed
  '/private/var/root/Library/Group Containers/CKGSB8CH43.group/AntiTamperLogs',
  path.join(HOME, 'Library/Group Containers/CKGSB8CH43.group/AppLogs'),
];

/**
 * The first candidate that actually holds a matching file — so a container that
 * exists but has no anti-tamper log doesn't shadow one that does. Falls back to
 * the first existing directory, then to candidates[0] so /config can still say
 * where we looked.
 */
function firstDirWithMatch(candidates, pattern) {
  let firstExisting = null;

  for (const dir of candidates) {
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch { continue; }

    if (!firstExisting) firstExisting = dir;
    if (listMatchingFiles(dir, pattern).length) return dir;
  }

  return firstExisting || candidates[0];
}

const MAC_SOURCES = [
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
    key: 'antitamper',
    label: 'AntiTamper',
    type: 'dir',
    path: firstDirWithMatch(MAC_ANTITAMPER_DIRS, MAC_ANTITAMPER_PATTERN),
    pattern: MAC_ANTITAMPER_PATTERN,
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

// ─── Windows paths ────────────────────────────────────────────────────────────
// The user gives the full directory holding the logs — the installed client's
//   C:\Program Files (x86)\Cato Networks\Cato Client
// or a dev build output folder such as
//   C:\Users\you\ws\endpoint\endpoint\sdp\win\Product\Debug\x64
const WIN_LOG_PATTERN = /^cato_vpn_.*\.log$/i;

// Anti-tamper logs live in their own subfolder of the configured directory.
// A support bundle confirms the folder is "AntiTamperLogs"; the bare
// "AntiTamper" spelling is accepted as a fallback. Filenames aren't assumed —
// we tail the newest log/txt in there.
const WIN_ANTITAMPER_SUBDIRS = ['AntiTamperLogs', 'AntiTamper'];
const WIN_ANTITAMPER_PATTERN = /\.(log|txt)$/i;

/**
 * The anti-tamper folder under `dir`: the first candidate that exists, else the
 * preferred name so /config can report where we looked.
 */
function resolveAntiTamperDir(dir) {
  if (!dir) return null;
  return firstExistingDir(WIN_ANTITAMPER_SUBDIRS.map(name => path.join(dir, name)));
}

// Placeholder for the standard installed-client log directory, once confirmed.
// Used only as a fallback — an explicitly configured directory always wins.
const INSTALLED_CLIENT_DIRS = [];

const CONFIG_FILE = path.join(HOME, '.cato-live-logs.json');

/**
 * Clean up a user-supplied log directory: trim whitespace and any trailing
 * separators. The path is used exactly as given — nothing is appended.
 * @returns {string|null} the directory, or null when the input is empty
 */
function normalizeLogDir(dir) {
  if (!dir) return null;
  const trimmed = String(dir).trim().replace(/[\\/]+$/, '');
  return trimmed || null;
}

/** All regular files in `dir` matching `pattern`, with stat info. */
function listMatchingFiles(dir, pattern) {
  if (!dir) return [];
  let names;
  try { names = fs.readdirSync(dir); } catch { return []; }

  const out = [];
  for (const name of names) {
    if (pattern && !pattern.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (!stat.isFile()) continue;
      out.push({ name, path: full, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch { /* skip unreadable files */ }
  }
  return out;
}

/** The most recently modified matching file, or null. */
function pickLatestFile(dir, pattern) {
  let best = null;
  for (const f of listMatchingFiles(dir, pattern)) {
    if (!best || f.mtimeMs > best.mtimeMs) best = f;
  }
  return best;
}

// ─── Windows configuration ────────────────────────────────────────────────────

function readStoredConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

function writeStoredConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Read --dir=<path> or --dir <path> from argv.
 * `--root` is accepted as a legacy spelling — it used to mean a parent folder
 * that a fixed sub-path was appended to, and now means the directory itself.
 */
function dirFromArgv(argv) {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    for (const flag of ['--dir', '--root']) {
      if (args[i].startsWith(`${flag}=`)) return args[i].slice(flag.length + 1);
      if (args[i] === flag && args[i + 1]) return args[i + 1];
    }
  }
  return null;
}

/** First existing directory from INSTALLED_CLIENT_DIRS, if any. */
function findInstalledClientDir() {
  for (const dir of INSTALLED_CLIENT_DIRS) {
    try { if (fs.statSync(dir).isDirectory()) return dir; } catch { /* keep looking */ }
  }
  return null;
}

let winLogDir = dirFromArgv(process.argv)
  || process.env.CATO_LOG_DIR
  || process.env.CATO_LOG_ROOT
  || readStoredConfig().logDir
  || null;

/** The Windows sources for a given log directory. */
function winSourcesFor(dir) {
  if (!dir) return [];
  return [
    { key: 'vpn', label: 'CatoVPN', type: 'latest', path: dir, pattern: WIN_LOG_PATTERN },
    {
      key: 'antitamper',
      label: 'AntiTamper',
      type: 'latest',
      path: resolveAntiTamperDir(dir),
      pattern: WIN_ANTITAMPER_PATTERN,
    },
  ];
}

function buildWindowsSources() {
  return winSourcesFor(normalizeLogDir(winLogDir) || findInstalledClientDir());
}

let SOURCES = IS_WIN ? buildWindowsSources() : MAC_SOURCES;

/**
 * Report a directory source for /config: where we're looking, whether it's
 * there, and what's inside. Makes "is it watching the right folder?" answerable
 * without reading the server's stdout.
 */
function describeDir(dir, pattern) {
  let exists = false;
  try { exists = !!dir && fs.statSync(dir).isDirectory(); } catch { exists = false; }

  const matches = exists ? listMatchingFiles(dir, pattern) : [];
  const latest = matches.reduce((best, f) => (!best || f.mtimeMs > best.mtimeMs ? f : best), null);

  return {
    dir,
    exists,
    currentFile: latest ? latest.name : null,
    matchCount: matches.length,
  };
}

/** Snapshot of the current configuration, served at GET /config. */
function configInfo() {
  if (!IS_WIN) {
    return {
      platform: process.platform,
      // Nothing to configure: the macOS sources are fixed system paths.
      configurable: false,
      needsConfig: false,
      logDir: null,
      resolvedDir: null,
      dirExists: true,
      currentFile: null,
      matchCount: 0,
      // Reported on macOS too: this folder's name has been ambiguous and it
      // lives under /private/var/root, so it's worth surfacing what resolved.
      antiTamper: describeDir(
        MAC_SOURCES.find(s => s.key === 'antitamper')?.path || null,
        MAC_ANTITAMPER_PATTERN,
      ),
      port: PORT,
    };
  }

  const resolvedDir = normalizeLogDir(winLogDir) || findInstalledClientDir();
  let dirExists = false;
  try { dirExists = !!resolvedDir && fs.statSync(resolvedDir).isDirectory(); } catch { dirExists = false; }

  const matches = dirExists ? listMatchingFiles(resolvedDir, WIN_LOG_PATTERN) : [];
  const latest = matches.reduce((best, f) => (!best || f.mtimeMs > best.mtimeMs ? f : best), null);

  // The anti-tamper subfolder is optional — its absence is reported, not an error.
  const antiTamper = describeDir(resolveAntiTamperDir(resolvedDir), WIN_ANTITAMPER_PATTERN);

  return {
    platform: process.platform,
    configurable: true,
    needsConfig: !dirExists,
    logDir: resolvedDir,
    resolvedDir,
    dirExists,
    currentFile: latest ? latest.name : null,
    matchCount: matches.length,
    antiTamper,
    port: PORT,
  };
}

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

// How much existing text a newly connected client receives, so the viewer has
// something to show immediately instead of waiting for the next write. The
// client trims this to the current day; this cap just keeps the connect
// message bounded when a source holds months of history.
const INITIAL_TAIL_LINES = 5000;

/**
 * The last `n` lines of `text`, found by scanning back from the end so a
 * multi-megabyte buffer isn't split into an array just to take its tail.
 */
function tailLines(text, n) {
  if (!text) return '';

  let idx = text.length;
  for (let i = 0; i < n; i++) {
    const prev = text.lastIndexOf('\n', idx - 1);
    if (prev === -1) return text; // fewer than n lines — send it all
    idx = prev;
  }
  return text.slice(idx + 1);
}

/** Read a single file, or return '' on error. */
function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
}

/** Read `length` bytes from `filePath` starting at byte offset `start`. */
function readRange(filePath, start, length) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const n = fs.readSync(fd, buf, read, length - read, start + read);
      if (n <= 0) break;
      read += n;
    }
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

// Per-'latest'-source tail bookkeeping: which file we're on and how many bytes
// of it we've consumed. Lets us read only the new bytes instead of re-reading a
// growing dev log every second.
const tails = {};    // { [key]: { filePath, size } | null }
const decoders = {}; // { [key]: StringDecoder } — keeps multi-byte chars intact across reads

/**
 * Tail the most recently modified matching file.
 * `forceReset` is true when we switched files or the file was truncated, which
 * makes the polling loop resend everything instead of diffing.
 */
function readLatest(src) {
  const key = src.key;
  const latest = pickLatestFile(src.path, src.pattern);
  const prev = tails[key];

  if (!latest) {
    tails[key] = null;
    decoders[key] = null;
    return { content: '', forceReset: !!prev };
  }

  const sameFile = prev && prev.filePath === latest.path;

  if (sameFile && latest.size === prev.size) {
    return { content: state[key] || '', forceReset: false };
  }

  if (sameFile && latest.size > prev.size) {
    const buf = readRange(latest.path, prev.size, latest.size - prev.size);
    tails[key] = { filePath: latest.path, size: prev.size + buf.length };
    return { content: (state[key] || '') + decoders[key].write(buf), forceReset: false };
  }

  // New file, or the current one was truncated/rotated in place — start over.
  let buf;
  try { buf = fs.readFileSync(latest.path); } catch { return { content: state[key] || '', forceReset: false }; }
  decoders[key] = new StringDecoder('utf8');
  tails[key] = { filePath: latest.path, size: buf.length };
  return { content: decoders[key].write(buf), forceReset: true };
}

/** @returns {{content: string, forceReset: boolean}} */
function readSource(src) {
  if (src.type === 'latest') return readLatest(src);
  if (src.type === 'dir') return { content: readDir(src.path, src.pattern), forceReset: false };
  return { content: readFile(src.path), forceReset: false };
}

// ─── State ────────────────────────────────────────────────────────────────────
// We track the last known content length per source so we can diff cheaply.
const state = {}; // { [key]: string } — always the full current content

function init() {
  if (IS_WIN && SOURCES.length === 0) {
    const info = configInfo();
    console.log(`  ✗ No log folder configured.`);
    console.log(`    Set one with --dir="<full path to the log folder>", the CATO_LOG_DIR env var,`);
    console.log(`    or the viewer's Settings ▸ Live Logs Settings dialog.`);
    if (info.logDir) console.log(`    Configured folder "${info.logDir}" does not exist.`);
    return;
  }

  for (const src of SOURCES) {
    state[src.key] = readSource(src).content;

    if (src.type === 'latest') {
      const tail = tails[src.key];
      if (tail) {
        console.log(`  ✓ ${src.label}: ${path.basename(tail.filePath)} (${state[src.key].length} bytes)`);
        console.log(`    watching ${src.path}`);
      } else {
        console.log(`  ✗ ${src.label}: no ${src.pattern} file found in ${src.path}`);
      }
    } else if (state[src.key].length > 0) {
      console.log(`  ✓ ${src.label}: ${state[src.key].length} bytes`);
    } else {
      console.log(`  ✗ ${src.label}: not found or empty (${src.path})`);
    }
  }
}

// ─── HTTP + WebSocket server ───────────────────────────────────────────────────
function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Collect a JSON request body (capped, so a stray large POST can't blow up). */
function readJsonBody(req, cb) {
  let body = '';
  let tooLarge = false;
  req.on('data', chunk => {
    if (tooLarge) return;
    body += chunk;
    if (body.length > 64 * 1024) { tooLarge = true; }
  });
  req.on('end', () => {
    if (tooLarge) return cb(new Error('Request body too large'));
    try { cb(null, body ? JSON.parse(body) : {}); } catch { cb(new Error('Invalid JSON body')); }
  });
  req.on('error', err => cb(err));
}

function handleRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const route = (req.url || '').split('?')[0];

  if (route === '/sources') {
    return sendJson(res, 200, SOURCES.map(s => ({ key: s.key, label: s.label })));
  }

  if (route === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  if (route === '/config' && req.method === 'GET') {
    return sendJson(res, 200, configInfo());
  }

  if (route === '/config' && req.method === 'POST') {
    if (!IS_WIN) {
      return sendJson(res, 400, { error: 'Folder configuration only applies to Windows.' });
    }
    return readJsonBody(req, (err, body) => {
      if (err) return sendJson(res, 400, { error: err.message });

      // `root` is the legacy field name; both carry the full directory now.
      const raw = typeof body.logDir === 'string' ? body.logDir
        : typeof body.root === 'string' ? body.root
        : '';
      const dir = normalizeLogDir(raw);
      if (!dir) return sendJson(res, 400, { error: 'Please enter the log folder path.' });

      let exists = false;
      try { exists = fs.statSync(dir).isDirectory(); } catch { exists = false; }
      if (!exists) {
        return sendJson(res, 400, { error: `Folder not found: ${dir}` });
      }

      applyWinLogDir(dir);
      return sendJson(res, 200, configInfo());
    });
  }

  res.writeHead(404); res.end('Not found');
}

// Assigned in start(). Requiring this file (tests) leaves them null so no
// listener is opened and no polling timer is scheduled.
let WebSocket = null;
let server = null;
let wss = null;

/** Point every connected client at the newly configured folder. */
function applyWinLogDir(dir) {
  winLogDir = dir;
  try {
    writeStoredConfig({ ...readStoredConfig(), logDir: dir });
  } catch (e) {
    console.error('[live-logs] Could not persist config:', e.message);
  }

  for (const key of Object.keys(state)) delete state[key];
  for (const key of Object.keys(tails)) delete tails[key];

  SOURCES = buildWindowsSources();
  console.log(`\n[live-logs] Log folder changed to: ${dir}`);
  init();

  // Clear each client's tab and stream from the new file's end onwards, which
  // matches what happens on a fresh connection.
  if (!wss) return;
  for (const src of SOURCES) {
    const msg = JSON.stringify({
      type: 'reset',
      sourceKey: src.key,
      label: src.label,
      content: tailLines(state[src.key], INITIAL_TAIL_LINES),
    });
    wss.clients.forEach(client => {
      if (client.readyState !== WebSocket.OPEN) return;
      client.clientOffsets[src.key] = state[src.key].length;
      client.send(msg);
    });
  }
}

function handleConnection(ws) {
  console.log('[live-logs] Client connected');

  // Offsets mark where each source stands RIGHT NOW, so the polling loop only
  // streams bytes written after this moment. The initial message carries the
  // recent tail of what's already there so the viewer isn't blank until the
  // next write — the client drops anything older than today.
  const offsets = {}; // { [sourceKey]: number }
  for (const src of SOURCES) {
    offsets[src.key] = state[src.key].length;
    ws.send(JSON.stringify({
      type: 'initial',
      sourceKey: src.key,
      label: src.label,
      content: tailLines(state[src.key], INITIAL_TAIL_LINES),
    }));
  }

  // Attach offsets to the socket so the polling loop can use them
  ws.clientOffsets = offsets;

  ws.on('error', err => console.error('[live-logs] WS error:', err.message));
  ws.on('close', () => console.log('[live-logs] Client disconnected'));
}

// ─── Polling loop ─────────────────────────────────────────────────────────────
function poll() {
  if (wss.clients.size === 0) return; // No clients — skip work

  for (const src of SOURCES) {
    const prev = state[src.key];
    const { content: curr, forceReset } = readSource(src);

    if (curr === prev && !forceReset) continue; // Nothing changed

    // forceReset means we switched to a different file — never treat that as an
    // append, even if the new content happens to start with the old.
    const isAppend = !forceReset && curr.length > prev.length && curr.startsWith(prev);
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
}

// ─── Start ────────────────────────────────────────────────────────────────────
function start() {
  WebSocket = require('ws');

  console.log('[live-logs] Initialising sources...');
  init();

  server = http.createServer(handleRequest);
  wss = new WebSocket.Server({ server });
  wss.on('connection', handleConnection);
  setInterval(poll, POLL_MS);

  // ws forwards the HTTP server's 'error' to the WebSocketServer too, so both
  // need a listener — otherwise a listen failure throws before we can print
  // anything useful.
  let handledError = false;
  const onServerError = (err) => {
    if (handledError) return;
    handledError = true;

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
  };
  server.on('error', onServerError);
  wss.on('error', onServerError);

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n[live-logs] Server ready at ws://localhost:${PORT}`);
    console.log('[live-logs] Press Ctrl-C to stop.\n');
  });
}

function printPortConflict() {
  console.error(`\n[live-logs] ERROR: Port ${PORT} is already in use by another process.`);
  console.error(`\nTo free it, run:`);
  if (IS_WIN) {
    console.error(`  netstat -ano | findstr :${PORT}`);
    console.error(`  taskkill /PID <pid> /F\n`);
  } else {
    console.error(`  lsof -ti:${PORT} | xargs kill\n`);
  }
  console.error(`Then start the server again.\n`);
  process.exit(1);
}

// Only start listening when run directly — `require`ing this file (tests) just
// exposes the pure path helpers below.
if (require.main === module) start();

module.exports = {
  WIN_LOG_PATTERN,
  WIN_ANTITAMPER_SUBDIRS,
  WIN_ANTITAMPER_PATTERN,
  firstExistingDir,
  firstDirWithMatch,
  MAC_ANTITAMPER_PATTERN,
  resolveAntiTamperDir,
  winSourcesFor,
  normalizeLogDir,
  listMatchingFiles,
  pickLatestFile,
  dirFromArgv,
};
