// Session storage utility for persisting log viewer state across page refreshes
// Uses IndexedDB for storing large data like logs

const DB_NAME = 'logViewerSession';
const STORE_NAME = 'sessionData';
const SESSION_KEY = 'currentSession';
const EXPIRY_HOURS = 24;

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

// Save session data to IndexedDB
export const saveSession = async (sessionData) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const dataToSave = {
      ...sessionData,
      timestamp: Date.now(),
      expiresAt: Date.now() + (EXPIRY_HOURS * 60 * 60 * 1000)
    };

    await new Promise((resolve, reject) => {
      const request = store.put(dataToSave, SESSION_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log('Session saved successfully');
  } catch (error) {
    console.error('Error saving session:', error);
  }
};

// Load session data from IndexedDB
export const loadSession = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const sessionData = await new Promise((resolve, reject) => {
      const request = store.get(SESSION_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Check if session has expired
    if (sessionData && sessionData.expiresAt > Date.now()) {
      console.log('Session loaded successfully');
      return sessionData;
    } else {
      console.log('Session expired or not found');
      await clearSession();
      return null;
    }
  } catch (error) {
    console.error('Error loading session:', error);
    return null;
  }
};

// Clear session data
export const clearSession = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const request = store.delete(SESSION_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log('Session cleared successfully');
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};
