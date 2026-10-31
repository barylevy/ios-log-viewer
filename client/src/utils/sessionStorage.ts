import type { LogHeaders, LogRecord } from '../domain/logRecord';

const DATABASE_NAME = 'logViewerSession';
const STORE_NAME = 'sessionData';
const RETENTION_MS = 24 * 60 * 60 * 1000;
const PREFERENCE_KEY = 'logViewer_rememberSessions';

export interface ViewerSession {
  files: { id: string; name: string }[];
  activeFileIndex: number;
  showingCombinedView: boolean;
  allFileLogs: Record<string, LogRecord[]>;
  logFileHeaders?: Record<string, LogHeaders>;
}

interface StoredSession extends ViewerSession {
  timestamp: number;
  expiresAt: number;
}

export function isSessionPersistenceEnabled(): boolean {
  try {
    return localStorage.getItem(PREFERENCE_KEY) !== 'false';
  } catch {
    return false;
  }
}

function tabSessionId(): string {
  let id = sessionStorage.getItem('logViewer_tabId');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('logViewer_tabId', id);
  }
  return id;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionFinished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Session transaction aborted.'));
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Sweep every tab's data, including sessions belonging to tabs that have closed. */
async function deleteExpiredSessions(database: IDBDatabase): Promise<void> {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const finished = transactionFinished(transaction);
  const cursor = transaction.objectStore(STORE_NAME).openCursor();
  cursor.onsuccess = () => {
    const entry = cursor.result;
    if (!entry) return;
    const value = entry.value as Partial<StoredSession>;
    if (typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now()) entry.delete();
    entry.continue();
  };
  await finished;
}

export async function saveSession(session: ViewerSession): Promise<void> {
  if (!isSessionPersistenceEnabled()) return;
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    await deleteExpiredSessions(database);
    if (!isSessionPersistenceEnabled()) return;
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const finished = transactionFinished(transaction);
    const timestamp = Date.now();
    transaction
      .objectStore(STORE_NAME)
      .put({ ...session, timestamp, expiresAt: timestamp + RETENTION_MS }, tabSessionId());
    await finished;
  } catch (error) {
    console.warn('Unable to save viewer session:', error);
  } finally {
    database?.close();
  }
}

export async function loadSession(): Promise<ViewerSession | null> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    await deleteExpiredSessions(database);
    if (!isSessionPersistenceEnabled()) return null;
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const finished = transactionFinished(transaction);
    const request = transaction.objectStore(STORE_NAME).get(tabSessionId());
    const data = await new Promise<StoredSession | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await finished;
    if (!data || !Array.isArray(data.files) || !data.allFileLogs || data.expiresAt <= Date.now())
      return null;
    return data;
  } catch (error) {
    console.warn('Unable to restore viewer session:', error);
    return null;
  } finally {
    database?.close();
  }
}

export async function clearSession(allTabs = false): Promise<void> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const finished = transactionFinished(transaction);
    const store = transaction.objectStore(STORE_NAME);
    if (allTabs) store.clear();
    else store.delete(tabSessionId());
    await finished;
  } catch (error) {
    console.warn('Unable to clear viewer sessions:', error);
  } finally {
    database?.close();
  }
}

export async function setSessionPersistenceEnabled(enabled: boolean): Promise<void> {
  localStorage.setItem(PREFERENCE_KEY, String(enabled));
  if (!enabled) await clearSession(true);
}
