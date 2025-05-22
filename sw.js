// sw.js

// Import idb library (self‐hosted) for IndexedDB operations.
importScripts('/static/js/umd.js');

// Cache names.
const CACHE_NAME = 'agrosense-shell-v3';
const API_CACHE_NAME = 'agrosense-api-cache-v1'; // Separate cache for API responses.

// List of known static assets.
const ASSETS = [
  '/',
  '/offline.html',
  '/static/css/styles.css',
  '/static/js/scripts.js',
  '/static/images/icon-192.png',
  '/static/images/icon-512.png'
];

// ---------------------------------------------------------------------------
// Logging Helpers
// ---------------------------------------------------------------------------
function logInfo(message, details = {}) {
  console.log(`[INFO] ${new Date().toISOString()} - ${message}`, details);
}

function logError(message, error, details = {}) {
  console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error, details);
}

// ---------------------------------------------------------------------------
// INSTALL: Cache Static Assets
// ---------------------------------------------------------------------------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Attempt to add each asset separately.
      return Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.error(`Failed to cache ${url}:`, err);
            // Return a resolved promise to avoid rejecting all-statement.
            return Promise.resolve();
          })
        )
      ).then(() => {
        // Once all attempts complete, proceed.
        return self.skipWaiting();
      });
    })
  );
});


// ---------------------------------------------------------------------------
// ACTIVATE: Cleanup Old Caches and Take Control Promptly
// ---------------------------------------------------------------------------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys.filter(key => key !== CACHE_NAME && key !== API_CACHE_NAME)
            .map(key => {
              logInfo('Deleting old cache', { cacheKey: key });
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// FETCH: Respond to Requests Depending on URL and Request Mode
// ---------------------------------------------------------------------------
self.addEventListener('fetch', event => {
  const req = event.request;

  // Handle only GET requests over HTTP/HTTPS.
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  // For API endpoints (i.e., URLs containing '/api/'), use stale-while-revalidate.
  if (req.url.includes('/api/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Otherwise, use custom strategies.
  event.respondWith((async () => {
    // For navigation requests, try network first then offline fallback.
    if (req.mode === 'navigate') {
      try {
        let networkResp = await fetch(req);
        logInfo('Fetched navigation from network', { url: req.url });
        return networkResp;
      } catch (err) {
        logError('Navigation fetch failed, serving offline page', err, { url: req.url });
        return caches.match('/offline.html');
      }
    }

    // For other GET requests, try cache-first then network.
    const cached = await caches.match(req);
    if (cached) {
      logInfo('Serving from cache', { url: req.url });
      return cached;
    }
    try {
      const networkResp = await fetch(req);
      if (networkResp.ok) {
        const copy = networkResp.clone();
        (await caches.open(CACHE_NAME)).put(req, copy);
        logInfo('Fetched and cached new request', { url: req.url });
      }
      return networkResp;
    } catch (err) {
      logError('Fetch failed for non-navigation request', err, { url: req.url });
      return cached; // Safe fallback.
    }
  })());
});

// ---------------------------------------------------------------------------
// Stale-While-Revalidate Strategy for API Endpoints
// ---------------------------------------------------------------------------
async function staleWhileRevalidate(req) {
  const cache = await caches.open(API_CACHE_NAME);
  const cachedResponse = await cache.match(req);

  // Start network fetch in background.
  const networkFetch = fetch(req)
    .then(networkResponse => {
      if (networkResponse && networkResponse.ok) {
        cache.put(req, networkResponse.clone());
        logInfo('API network response updated the cache', { url: req.url });
      } else {
        logError('API network response not ok', new Error(`Status: ${networkResponse.status}`), { url: req.url });
      }
      return networkResponse;
    })
    .catch(err => {
      logError('Network error during SWR for API endpoint', err, { url: req.url });
    });

  if (cachedResponse) {
    logInfo('Serving stale API response from cache', { url: req.url });
  }
  return cachedResponse || networkFetch;
}

// ---------------------------------------------------------------------------
// PUSH: Display Notifications When a Push Event is Received
// ---------------------------------------------------------------------------
self.addEventListener('push', event => {
  logInfo('Push event received');
  let data = {
    title: 'AgroSense Notification',
    body: 'You have a new notification!',
    icon: '/static/images/icon-192.png'
  };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      logError('Error parsing push message data', error);
    }
  }
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge || '/static/images/icon-192.png'
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ---------------------------------------------------------------------------
// BACKGROUND SYNC: Process Offline Queued Requests
// ---------------------------------------------------------------------------
self.addEventListener('sync', event => {
  if (event.tag === 'offline-sync') {
    logInfo('Background sync event received', { tag: event.tag });
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  // Open (or create) the IndexedDB database 'offline-requests'.
  const db = await idb.openDB('offline-requests', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('requests')) {
        db.createObjectStore('requests', { autoIncrement: true });
      }
    }
  });

  // Retrieve and process all queued requests.
  const tx = db.transaction('requests', 'readwrite');
  const store = tx.objectStore('requests');
  const keys = await store.getAllKeys();

  for (const key of keys) {
    const data = await store.get(key);
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' }
      });
      if (response && response.ok) {
        logInfo('Successfully synced offline request', { key: key, url: '/api/submit' });
        await store.delete(key);
      } else {
        logError('Server error while syncing request', new Error('Response not OK'), { key: key, url: '/api/submit' });
      }
    } catch (error) {
      logError('Error syncing offline request', error, { key: key, url: '/api/submit' });
      // Leave request for next sync attempt.
    }
  }
  await tx.done;
  db.close();
}

// ---------------------------------------------------------------------------
// Listen for Messages (e.g., from Client to Skip Waiting)
// ---------------------------------------------------------------------------
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
