/**
 * Minimal service worker.
 *
 * It exists only so the site satisfies Chrome's PWA installability criteria
 * (which is what makes the app show up in Finder's "Open With" menu via the
 * manifest's `file_handlers`). It deliberately caches nothing and never calls
 * respondWith(), so every request falls through to the network exactly as it
 * would without a service worker — no offline support, no stale assets after a
 * deploy.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally empty: pass through to the network.
});
