/**
 * Shared client for the local live-logs server (scripts/live-logs-server.js).
 *
 * Everything that talks to the sidecar goes through here so the port and the
 * endpoint shapes live in one place.
 */

const LIVE_SERVER_PORT = 4000;
const LIVE_SERVER_HTTP = `http://localhost:${LIVE_SERVER_PORT}`;
export const LIVE_SERVER_WS = `ws://localhost:${LIVE_SERVER_PORT}`;

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
    const res = await fetch(`${LIVE_SERVER_HTTP}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Current server configuration.
 * @returns {Promise<object|null>} null when the server is unreachable.
 */
export async function fetchLiveConfig(timeoutMs = 1500) {
  try {
    const res = await fetch(`${LIVE_SERVER_HTTP}/config`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** The log folder last saved from this browser, or '' if none. */
export function getSavedLogDir() {
  try { return localStorage.getItem(LOG_DIR_KEY) || ''; } catch { return ''; }
}

/** Remember a log folder locally, without needing the server to be running. */
export function setSavedLogDir(dir) {
  try { localStorage.setItem(LOG_DIR_KEY, dir); } catch { /* ignore */ }
}

/**
 * Point the server at a new Windows log folder (the full directory path).
 * @returns {Promise<{ok: true, config: object} | {ok: false, error: string}>}
 */
export async function saveLogDir(logDir) {
  let res;
  try {
    res = await fetch(`${LIVE_SERVER_HTTP}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logDir }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { ok: false, error: 'Cannot reach the live-logs server. Is it running?' };
  }

  let body = null;
  try { body = await res.json(); } catch { /* fall through to a generic message */ }

  if (!res.ok) {
    return { ok: false, error: body?.error || `Server returned ${res.status}.` };
  }

  setSavedLogDir(logDir);
  return { ok: true, config: body };
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
 * The copy-paste command that downloads and starts the server.
 * @param {string} origin - window.location.origin
 * @param {boolean} windows - build the PowerShell variant instead of bash
 * @param {string} [logDir] - Windows only: bake this folder into the command
 */
export function buildSetupCommand(origin, windows, logDir = '') {
  if (windows) {
    // Install Node first if it's missing, then refresh PATH in this session —
    // the installer only updates the stored environment, so without this the
    // very next `npm` in the same window still fails with CommandNotFound.
    const ensureNode =
      `if (-not (Get-Command node -ErrorAction SilentlyContinue)) { ` +
      `winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements; ` +
      `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') }`;

    // No elevation to run: the build output folder lives under the user's own profile.
    const dirArg = logDir ? ` --dir="${logDir}"` : '';
    return `${ensureNode}; irm ${origin}/live-logs-server.js -OutFile $HOME\\live-logs-server.js; cd $HOME; npm install ws; node $HOME\\live-logs-server.js${dirArg}`;
  }
  return `sudo kill $(sudo lsof -ti:${LIVE_SERVER_PORT}) 2>/dev/null; curl -o ~/live-logs-server.js ${origin}/live-logs-server.js && cd ~ && npm install ws && sudo node ~/live-logs-server.js`;
}
