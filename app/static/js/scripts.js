(() => {
  /* ---------------------------------------------------------------------------
     Helper: Retrieve CSRF Token (if provided in HTML)
  ---------------------------------------------------------------------------- */
  function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : null;
  }

  /* ---------------------------------------------------------------------------
     Utility: Convert a Base64 string to a Uint8Array.
  ---------------------------------------------------------------------------- */
  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const raw = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const bin = window.atob(raw);
    return Uint8Array.from([...bin].map(c => c.charCodeAt(0)));
  }

  // Public VAPID Key (replace with your actual key if needed).
  const publicVapidKey = 'BOHQBRL0kFeq_eacPxqw9goo-NPxkOnNpP96Pzt9sdSFPyDkD6E_dyLpu0jdwKMw2nJfkXWfBeGorgn-ot3peUY';

  /* ---------------------------------------------------------------------------
     Function: Send subscription data to server with CSRF token (if available)
  ---------------------------------------------------------------------------- */
  function subscribeUser(subscription) {
    const csrfToken = getCSRFToken();
    fetch('/api/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
      }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to store subscription on server');
        console.log('Subscription stored on server.');
      })
      .catch(err => console.error('Subscription sending failed:', err));
  }

  /* ---------------------------------------------------------------------------
     Service Worker Registration + Update Notification Integration
  ---------------------------------------------------------------------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => {
          console.log('SW registered with scope:', reg.scope);

          // Push Notification subscription.
          navigator.serviceWorker.ready.then(registration => {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
                }).then(subscription => {
                  console.log('Push subscribed:', subscription);
                  subscribeUser(subscription);
                }).catch(err => console.error('Push subscription failed:', err));
              } else {
                console.error('Push notifications permission not granted');
              }
            });
          });

          // --- Service Worker Update Notification Logic ---
          // If there's a waiting SW, prompt the user.
          if (reg.waiting) {
            updateReady(reg.waiting);
          }
          // Listen for new updates.
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                updateReady(installingWorker);
              }
            };
          };
        })
        .catch(err => console.error('SW registration failed:', err));
    });
  }

  /**
   * updateReady: Notifies the user that a new service worker is waiting to take over.
   * It shows an update banner in the UI (if available) or falls back to a confirm dialog.
   */
  function updateReady(worker) {
    const updateBanner = document.getElementById('update-banner');
    if (updateBanner) {
      updateBanner.classList.remove('hidden');
      const reloadBtn = document.getElementById('reload-button');
      reloadBtn.addEventListener('click', () => {
        // Tell the waiting worker to skip waiting.
        worker.postMessage({ action: 'skipWaiting' });
        // Reload the page.
        window.location.reload();
      });
    } else {
      if (confirm('A new update is available. Refresh now?')) {
        worker.postMessage({ action: 'skipWaiting' });
        window.location.reload();
      }
    }
  }

  /* ---------------------------------------------------------------------------
     Offline Form Submission using Background Sync & Security Enhancements
  ---------------------------------------------------------------------------- */
  async function submitForm(data) {
    const csrfToken = getCSRFToken();
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
        }
      });
      if (!response.ok) {
        throw new Error('Network response was not OK');
      }
      console.log('Data submitted successfully');
    } catch (error) {
      console.error('Network error, queuing request for background sync:', error);
      await queueRequest(data);
    }
  }

  async function queueRequest(data) {
    // Open (or create) the IndexedDB database 'offline-requests' via idb library.
    const db = await idb.openDB('offline-requests', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('requests')) {
          db.createObjectStore('requests', { autoIncrement: true });
        }
      }
    });
    await db.add('requests', data);
    console.log('Request queued in IndexedDB');
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register('offline-sync')
        .then(() => console.log('Background sync registered'))
        .catch(err => console.error('Background sync registration failed:', err));
    });
  }

  // Bind form submission (if <form id="myForm"> exists).
  const myForm = document.getElementById('myForm');
  if (myForm) {
    myForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        cropName: document.getElementById('cropName').value,
        plantedDate: document.getElementById('plantedDate').value
        // Additional fields as necessary.
      };
      await submitForm(data);
    });
  }

  /* ---------------------------------------------------------------------------
     Other Existing Functionality
  ---------------------------------------------------------------------------- */
  // Update current date.
  const dateEl = document.getElementById('current-date');
  if (dateEl) {
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateEl.textContent = new Date().toLocaleDateString('en-US', opts);
  }

  // Mobile Menu Toggle.
  const menuBtn = document.getElementById('menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
  }

  // Connection Status Update.
  const statusEl = document.getElementById('connection-status');
  function updateStatus() {
    if (!statusEl) return;
    if (navigator.onLine) {
      statusEl.innerHTML = '<i class="fas fa-wifi"></i> Online';
      statusEl.classList.replace('text-red-500', 'text-green-500');
    } else {
      statusEl.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
      statusEl.classList.replace('text-green-500', 'text-red-500');
    }
  }
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();

  // Camera Capture Functionality.
  const video = document.getElementById('camera-feed'),
    canvas = document.getElementById('canvas'),
    captureBtn = document.getElementById('capture-btn'),
    placeholder = document.getElementById('diagnosis-placeholder'),
    results = document.getElementById('diagnosis-results'),
    container = document.querySelector('#diagnose .grid > div:last-child');
  if (video && canvas && captureBtn && placeholder && results && container && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => video.srcObject = stream)
      .catch(() => {
        captureBtn.disabled = true;
        captureBtn.textContent = 'Camera Unavailable';
      });
    captureBtn.addEventListener('click', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      placeholder.classList.add('hidden');
      results.classList.add('hidden');
      const loader = document.createElement('div');
      loader.className = 'animate-spin h-12 w-12 border-b-2 border-green-600 mb-4';
      container.append(loader);
      setTimeout(() => {
        loader.remove();
        results.classList.remove('hidden');
      }, 2000);
    });
  }

  // Voice Input Functionality.
  const voiceBtn = document.getElementById('voice-btn');
  if (voiceBtn && 'webkitSpeechRecognition' in window) {
    const rec = new webkitSpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onstart = () => voiceBtn.classList.add('listening');
    rec.onend = () => voiceBtn.classList.remove('listening');
    rec.onresult = e => alert(`You said: "${e.results[0][0].transcript}"`);
    voiceBtn.addEventListener('click', () => {
      if (voiceBtn.classList.contains('listening')) rec.stop();
      else rec.start();
    });
  } else {
    if (voiceBtn) {
      voiceBtn.disabled = true;
      voiceBtn.title = 'Voice input not supported in this browser';
    }
  }

  /* ---------------------------------------------------------------------------
     PWA Install Prompt with Enhanced UX
  ---------------------------------------------------------------------------- */
  let deferredPromptInstall;
  const banner = document.getElementById('install-banner'),
    btnInstall = document.getElementById('install-btn'),
    btnDismiss = document.getElementById('dismiss-banner'),
    toast = document.getElementById('install-toast');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPromptInstall = e;
    if (banner) { banner.classList.remove('hidden'); }
  });
  btnInstall?.addEventListener('click', async () => {
    if (banner) { banner.classList.add('hidden'); }
    deferredPromptInstall.prompt();
    const { outcome } = await deferredPromptInstall.userChoice;
    console.log('Install outcome:', outcome);
    deferredPromptInstall = null;
    if (outcome === 'accepted' && toast) {
      toast.textContent = 'App installed successfully!';
      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    }
  });
  btnDismiss?.addEventListener('click', () => {
    if (banner) { banner.classList.add('hidden'); }
  });
  window.addEventListener('appinstalled', () => {
    if (banner) { banner.classList.add('hidden'); }
    console.log('PWA installed');
    deferredPromptInstall = null;
    if (toast) {
      toast.textContent = 'App installed successfully!';
      toast.classList.remove('hidden');
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    }
  });
})();
