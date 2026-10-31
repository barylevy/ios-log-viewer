import type { LiveServerConfig } from '../domain/viewerTypes';

/**
 * Shared client for the local live-logs server (scripts/live-logs-server.js).
 *
 * Everything that talks to the sidecar goes through here so the port and the
 * endpoint shapes live in one place.
 */

const LIVE_SERVER_PORT = 4000;
const LIVE_SERVER_HTTP = `http://localhost:${LIVE_SERVER_PORT}`;
export const LIVE_SERVER_WS = `ws://localhost:${LIVE_SERVER_PORT}`;

const TOKEN_KEY = 'liveLogs_pairingToken';
export function getPairingToken() {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}
export function setPairingToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim());
}
export function liveWebSocketProtocols() {
  return ['cato-logs', getPairingToken()];
}
function authHeaders() {
  return { 'X-Viewer-Token': getPairingToken() };
}

/** localStorage key mirroring the last saved Windows log folder, for input pre-fill. */
const LOG_DIR_KEY = 'liveLogs_logDir';

/** True when the viewer is running on Windows. */
export function isWindows() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (platform) return /win/i.test(platform);
  return /Windows/i.test(navigator.userAgent || '');
}

/** @returns {Promise<boolean>} whether the sidecar is up. */
export async function checkLiveHealth(timeoutMs = 1500) {
  try {
    const res = await fetch(`${LIVE_SERVER_HTTP}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Current server configuration.
 * @returns {Promise<object|null>} null when the server is unreachable.
 */
export async function fetchLiveConfig(timeoutMs = 1500): Promise<LiveServerConfig | null> {
  try {
    const res = await fetch(`${LIVE_SERVER_HTTP}/config`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return readServerConfig(await res.json());
  } catch {
    return null;
  }
}

/** The log folder last saved from this browser, or '' if none. */
export function getSavedLogDir() {
  try {
    return localStorage.getItem(LOG_DIR_KEY) || '';
  } catch {
    return '';
  }
}

/** Remember a log folder locally, without needing the server to be running. */
export function setSavedLogDir(dir: string) {
  try {
    localStorage.setItem(LOG_DIR_KEY, dir);
  } catch {
    /* ignore */
  }
}

/**
 * Point the server at a new Windows log folder (the full directory path).
 * @returns {Promise<{ok: true, config: object} | {ok: false, error: string}>}
 */
export async function saveLogDir(
  logDir: string,
): Promise<{ ok: true; config: LiveServerConfig } | { ok: false; error: string }> {
  let res;
  try {
    res = await fetch(`${LIVE_SERVER_HTTP}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ logDir }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, error: 'Cannot reach the live-logs server. Is it running?' };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* fall through to a generic message */
  }

  if (!res.ok) {
    return { ok: false, error: body?.error || `Server returned ${res.status}.` };
  }

  setSavedLogDir(logDir);
  const config = readServerConfig(body);
  return config ? { ok: true, config } : { ok: false, error: 'Invalid live server response.' };
}

/**
 * Push a locally-saved folder to a server that has just come up without one.
 * Lets the user configure the folder before ever starting the server.
 * @returns {Promise<object|null>} the resulting config, or null if it didn't apply
 */
export async function applySavedLogDir() {
  const dir = getSavedLogDir();
  if (!dir) return null;

  const result = await saveLogDir(dir);
  return result.ok ? result.config : null;
}

/**
 * The copy-paste PowerShell command that downloads and starts the server
 * (Windows only — macOS uses folder mode, see buildMirrorCommand).
 * @param {string} origin - window.location.origin
 * @param {string} [logDir] - bake this folder into the command
 */
export function buildSetupCommand(origin: string, logDir = '') {
  // Install Node first if it's missing, then refresh PATH in this session —
  // the installer only updates the stored environment, so without this the
  // very next `npm` in the same window still fails with CommandNotFound.
  const ensureNode =
    `if (-not (Get-Command node -ErrorAction SilentlyContinue)) { ` +
    `winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements; ` +
    `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }`;

  // No elevation to run: the build output folder lives under the user's own profile.
  const quote = (value: string) => "'" + value.replace(/'/g, "''") + "'";
  const dirArg = logDir ? ` --dir=${quote(logDir)}` : '';
  const pairingArgs = ` --origin=${quote(new URL(origin).origin)} --token=${quote(getPairingToken())}`;
  return `${ensureNode}; irm ${quote(new URL('/live-logs-server.js', origin).href)} -OutFile $HOME\\live-logs-server.js; cd $HOME; npm install ws; node $HOME\\live-logs-server.js${dirArg}${pairingArgs}`;
}

/**
 * macOS command for the no-install option: downloads the mirror script (plain
 * bash, ships with macOS) and runs it as root so it can reach the root-owned
 * logs. The viewer then reads the folder it fills.
 */
export function buildMirrorCommand(origin: string) {
  const url = new URL('/sync-cato-logs.sh', origin).href;
  const quotedUrl = "'" + url.replace(/'/g, "'\\''") + "'";
  return `curl --fail --show-error --location -o ~/sync-cato-logs.sh ${quotedUrl} && sudo bash ~/sync-cato-logs.sh`;
}

function readServerConfig(value: unknown): LiveServerConfig | null {
  if (!value || typeof value !== 'object') return null;
  const config = value as Record<string, unknown>;
  if (
    typeof config.platform !== 'string' ||
    typeof config.configurable !== 'boolean' ||
    typeof config.needsConfig !== 'boolean' ||
    typeof config.matchCount !== 'number' ||
    typeof config.dirExists !== 'boolean' ||
    typeof config.port !== 'number' ||
    !(config.logDir === null || typeof config.logDir === 'string') ||
    !(config.resolvedDir === null || typeof config.resolvedDir === 'string') ||
    !(config.currentFile === null || typeof config.currentFile === 'string') ||
    !config.antiTamper ||
    typeof config.antiTamper !== 'object'
  )
    return null;
  const antiTamper = config.antiTamper as Record<string, unknown>;
  if (
    typeof antiTamper.exists !== 'boolean' ||
    typeof antiTamper.matchCount !== 'number' ||
    !(antiTamper.dir === null || typeof antiTamper.dir === 'string') ||
    !(antiTamper.currentFile === null || typeof antiTamper.currentFile === 'string')
  )
    return null;
  return value as LiveServerConfig;
}
