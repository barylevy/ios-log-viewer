/**
 * Remembers the mirrored-logs folder the user picked, so access is granted once.
 *
 * Directory handles are structured-cloneable, so they live in IndexedDB. After a
 * reload the browser keeps the handle but drops the permission; it must be
 * re-requested from a user gesture (the Live button click).
 */

const DB_NAME = 'cato-live-logs';
const STORE = 'handles';
const KEY = 'cato-live-logs-root';

/** The folder the sync script fills; shown in the UI as the suggested pick. */
export const MIRROR_DIR_NAME = '.cato_live_logs';

/** True in Chromium browsers, the only ones that can read a folder directly. */
export function isFsAccessSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** @returns {Promise<FileSystemDirectoryHandle|null>} */
export async function loadSavedHandle() {
  try { return (await withStore('readonly', s => s.get(KEY))) || null; } catch { return null; }
}

export async function saveHandle(handle) {
  try { await withStore('readwrite', s => s.put(handle, KEY)); } catch { /* storage unavailable */ }
}

export async function forgetHandle() {
  try { await withStore('readwrite', s => s.delete(KEY)); } catch { /* ignore */ }
}

/** Ask the user to pick the mirrored folder. Returns null if they cancel. */
export async function pickMirrorFolder() {
  try {
    const handle = await window.showDirectoryPicker({ id: 'cato-live-logs', mode: 'readwrite' });
    if (handle.name !== MIRROR_DIR_NAME) throw new Error(`Choose ${MIRROR_DIR_NAME}.`);
    await saveHandle(handle);
    return handle;
  } catch (e) {
    if (e?.name === 'AbortError') return null;
    throw e;
  }
}

/**
 * Make sure we may read and clear `handle`. Prompting needs a user gesture, so call this
 * straight from a click handler.
 */
export async function ensureMirrorPermission(handle) {
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  } catch {
    return false;
  }
}
