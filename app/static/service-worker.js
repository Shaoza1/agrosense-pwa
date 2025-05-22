// Names of the caches used in this version of the service worker.
const CACHE_NAME = 'agrosense-cache-v1';
const urlsToCache = [
  '/', // your landing page route
  '/static/css/styles.css',
  '/static/js/scripts.js',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  // Include any additional assets you want to cache
];

// Install event: caching all required assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: clean up old caches if any
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// Fetch event: serve from cache, fallback to network if resource is missing
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // If the resource is in the cache, we return it.
        if (response) {
          return response;
        }
        // Otherwise, fetch from network
        return fetch(event.request);
      }
    )
  );
});
