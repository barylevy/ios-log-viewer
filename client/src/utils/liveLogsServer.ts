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
 * Windows one-time install, pasted into PowerShell: downloads the installer,
 * which installs Node.js if missing, sets the server up under
 * %LOCALAPPDATA%\CatoLogViewerLiveLogs, pairs it with this viewer's origin and
 * token, and starts it now and at every sign-in. No administrator rights.
 * @param {string} origin - window.location.origin
 * @param {string} [logDir] - bake this folder into the install
 */
export function buildSetupCommand(origin: string, logDir = '') {
  const quote = (value: string) => "'" + value.replace(/'/g, "''") + "'";
  const installer = new URL('/cato-live-logs-win-install.ps1', origin).href;
  const dirArg = logDir ? ` -LogDir ${quote(logDir)}` : '';
  return (
    `irm ${quote(installer)} -OutFile "$env:TEMP\\cato-live-logs-install.ps1"; ` +
    `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\\cato-live-logs-install.ps1" install ` +
    `-Origin ${quote(new URL(origin).origin)} -Token ${quote(getPairingToken())}${dirArg}`
  );
}

/** Runs the uninstall script the installer keeps in the install folder. */
export const WIN_UNINSTALL_COMMAND =
  'powershell -NoProfile -ExecutionPolicy Bypass -File "$env:LOCALAPPDATA\\CatoLogViewerLiveLogs\\uninstall.ps1"';

const MAC_SETUP_DIR = '~/.cato-live-logs-setup';

/**
 * macOS one-time install: downloads the installer and the Perl server (both
 * plain text, run with tools that ship with macOS) and registers the server as
 * a LaunchDaemon paired with this viewer's origin and token. After that the
 * Live Log button connects with no folder or terminal.
 */
export function buildMacInstallCommand(origin: string) {
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  const installer = new URL('/cato-live-logs-mac-install.sh', origin).href;
  const server = new URL('/cato-live-logs-mac-server.pl', origin).href;
  return (
    `mkdir -p ${MAC_SETUP_DIR} && curl --fail --show-error --location ` +
    `-o ${MAC_SETUP_DIR}/install.sh ${quote(installer)} -o ${MAC_SETUP_DIR}/server.pl ${quote(server)} && ` +
    `sudo bash ${MAC_SETUP_DIR}/install.sh install --origin=${quote(new URL(origin).origin)} ` +
    `--token=${quote(getPairingToken())}`
  );
}

/** The installer keeps a copy of itself here, so removal doesn't need the setup folder. */
export const MAC_UNINSTALL_COMMAND = `sudo bash '/Library/Application Support/CatoLogViewerLiveLogs/install.sh' uninstall`;

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
