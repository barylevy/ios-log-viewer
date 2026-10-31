import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  loadSession,
  saveSession,
  setSessionPersistenceEnabled,
  type ViewerSession,
} from '../utils/sessionStorage';

const session: ViewerSession = {
  files: [{ id: 'a', name: 'a.log' }],
  activeFileIndex: 0,
  showingCombinedView: false,
  allFileLogs: { a: [] },
};

async function accessStore(operation: (store: IDBObjectStore) => void): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('logViewerSession', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sessionData', 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      operation(transaction.objectStore('sessionData'));
    });
  } finally {
    database.close();
  }
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await clearSession(true);
});
afterEach(async () => {
  await clearSession(true);
});

describe('session persistence', () => {
  it('round-trips logs after the write transaction commits', async () => {
    await saveSession(session);
    expect(await loadSession()).toMatchObject(session);
  });
  it('deletes expired records from closed tabs too', async () => {
    await accessStore((store) =>
      store.put({ ...session, expiresAt: Date.now() - 1 }, 'closed-tab'),
    );
    await loadSession();
    let closedTab: unknown;
    await accessStore((store) => {
      const request = store.get('closed-tab');
      request.onsuccess = () => {
        closedTab = request.result;
      };
    });
    expect(closedTab).toBeUndefined();
  });
  it('keeps different tabs independent', async () => {
    sessionStorage.setItem('logViewer_tabId', 'a');
    await saveSession(session);
    sessionStorage.setItem('logViewer_tabId', 'b');
    expect(await loadSession()).toBeNull();
    sessionStorage.setItem('logViewer_tabId', 'a');
    expect(await loadSession()).not.toBeNull();
  });
  it('clears all persisted logs when remembering is disabled', async () => {
    await saveSession(session);
    await setSessionPersistenceEnabled(false);
    await saveSession(session);
    expect(await loadSession()).toBeNull();
    await setSessionPersistenceEnabled(true);
    expect(await loadSession()).toBeNull();
  });
});
