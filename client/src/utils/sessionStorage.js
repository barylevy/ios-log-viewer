// Session storage utility for persisting log viewer state across page refreshes
// Uses IndexedDB for storing large data like logs
// Each browser tab gets its own unique session ID

const DB_NAME = 'logViewerSession';
const STORE_NAME = 'sessionData';
const EXPIRY_HOURS = 24;

// Generate a unique session ID for this tab
// This ID is stored in sessionStorage, so it's unique per tab
const getTabSessionId = () => {
  let tabId = sessionStorage.getItem('logViewer_tabId');
  if (!tabId) {
    // Generate a unique ID for this tab
    tabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('logViewer_tabId', tabId);
  }
  return tabId;
};

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

    // Use tab-specific session ID as key
    const tabSessionId = getTabSessionId();

    await new Promise((resolve, reject) => {
      const request = store.put(dataToSave, tabSessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log('Session saved successfully for tab:', tabSessionId);
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

    // Use tab-specific session ID as key
    const tabSessionId = getTabSessionId();

    const sessionData = await new Promise((resolve, reject) => {
      const request = store.get(tabSessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    db.close();

    // Check if session has expired
    if (sessionData && sessionData.expiresAt > Date.now()) {
      console.log('Session loaded successfully for tab:', tabSessionId);
      return sessionData;
    } else {
      console.log('Session expired or not found for tab:', tabSessionId);
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

    // Use tab-specific session ID as key
    const tabSessionId = getTabSessionId();

    await new Promise((resolve, reject) => {
      const request = store.delete(tabSessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    db.close();
    console.log('Session cleared successfully for tab:', tabSessionId);
  } catch (error) {
    console.error('Error clearing session:', error);
  }
};
