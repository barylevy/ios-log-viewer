/**
 * Pure helpers for reading live logs straight from a folder (no local server).
 * Kept free of browser APIs so the incremental-read logic can be unit tested.
 */

/** Files the viewer treats as logs inside each mirrored source folder. */
export const LOG_FILE_PATTERN = /\.(log|txt)$/i;

/** Recent lines sent on connect — same cap as the live-logs server. */
export const INITIAL_TAIL_LINES = 5000;

/** Upper bound on bytes read when (re)building a source, however many files it holds. */
export const MAX_INITIAL_BYTES = 8 * 1024 * 1024;

/**
 * Sources mirrored by scripts/sync-cato-logs.sh. `key` is also the subfolder name
 * inside the chosen folder, and matches the keys the server uses on macOS.
 */
export const FS_SOURCES = [
  { key: 'app', label: 'AppLogs' },
  { key: 'ext', label: 'Extension' },
  { key: 'dns', label: 'DNSRelay' },
  { key: 'antitamper', label: 'AntiTamper' },
  { key: 'agent', label: 'UserAgent' },
  { key: 'daemon', label: 'Daemon' },
  { key: 'install', label: 'Install' },
];

/** Natural sort so log.1 < log.2 < log.10. */
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Decide how to bring a source up to date.
 *
 * @param {{name:string,size:number}[]|null} prev  what was read last time (null = never)
 * @param {{name:string,size:number}[]} curr       files now, naturally sorted
 * @returns {{kind:'none'} | {kind:'reset'} | {kind:'append', name:string, offset:number}}
 *
 * Only a growing last file is an append — that is how a live log behaves.
 * Anything else (new/removed/rotated file, a file that shrank, or an earlier
 * file that changed) means the concatenated text is no longer a prefix of what
 * we hold, so the caller must re-read.
 */
export function planRead(prev, curr) {
  if (!prev) return { kind: 'reset' };
  if (prev.length !== curr.length) return { kind: 'reset' };

  for (let i = 0; i < curr.length; i++) {
    if (prev[i].name !== curr[i].name) return { kind: 'reset' };
    const isLast = i === curr.length - 1;
    if (!isLast && prev[i].size !== curr[i].size) return { kind: 'reset' };
  }

  if (!curr.length) return { kind: 'none' };

  const last = curr.length - 1;
  if (curr[last].size < prev[last].size) return { kind: 'reset' };
  if (curr[last].size === prev[last].size) return { kind: 'none' };
  return { kind: 'append', name: curr[last].name, offset: prev[last].size };
}

/**
 * The last `n` lines of `text`, found by scanning back from the end so a large
 * buffer isn't split into an array just to take its tail.
 */
export function tailLines(text, n) {
  if (!text) return '';

  let idx = text.length;
  for (let i = 0; i < n; i++) {
    const prev = text.lastIndexOf('\n', idx - 1);
    if (prev === -1) return text; // fewer than n lines — send it all
    idx = prev;
  }
  return text.slice(idx + 1);
}
