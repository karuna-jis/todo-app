// Service Worker for PWA - Offline Support, Caching, Updates, and Firebase Messaging
// This is the main service worker for Progressive Web App functionality

// Import Firebase for Cloud Messaging
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBDxGeqSk1xheSRAtk6HTZNcKqC_LNankE",
  authDomain: "to-do-app-dcdb3.firebaseapp.com",
  projectId: "to-do-app-dcdb3",
  storageBucket: "to-do-app-dcdb3.appspot.com",
  messagingSenderId: "190624201750",
  appId: "1:190624201750:web:2c2d842af364481bdcc937",
  measurementId: "G-259PEFN7CL"
};

// Initialize Firebase
let messaging = null;
try {
  firebase.initializeApp(firebaseConfig);
  console.log("[SW] ✅ Firebase initialized successfully");
  messaging = firebase.messaging();
  console.log("[SW] ✅ Firebase Messaging initialized successfully");
} catch (error) {
  console.error("[SW] ❌ Firebase initialization error:", error);
}

const CACHE_NAME = 'todo-app-pwa-v1';
const RUNTIME_CACHE = 'todo-app-runtime-v1';

// Assets to cache on install
const urlsToCache = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/icons/icon.png',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/favicon.ico'
];

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  console.log('[SW] 📦 Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] ✅ Caching app shell and essential resources');
        // Use addAll but catch errors for files that might not exist yet
        return cache.addAll(urlsToCache).catch((err) => {
          console.log('[SW] ⚠️ Some files could not be cached:', err);
          // Continue even if some files fail to cache
        });
      })
      .then(() => {
        console.log('[SW] ✅ Service worker installed successfully');
        // Force activation of new service worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] ❌ Service worker installation failed:', error);
      })
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', (event) => {
  console.log('[SW] 🔄 Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches that don't match current version
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] 🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] ✅ Service worker activated');
        // Take control of all pages immediately
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('[SW] ❌ Service worker activation failed:', error);
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (except same-origin)
  if (url.origin !== self.location.origin) {
    // Allow Firebase and Google APIs for messaging
    if (url.hostname.includes('firebase') || 
        url.hostname.includes('gstatic') || 
        url.hostname.includes('googleapis')) {
      // Let these pass through without caching
      return;
    }
    return;
  }

  // Strategy: Cache First for static assets, Network First for API calls
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        // For static assets (JS, CSS, images), serve from cache first
        if (cachedResponse && (
          request.url.includes('/static/') ||
          request.url.includes('/icons/') ||
          request.url.includes('/manifest.json') ||
          request.url.includes('/favicon.ico')
        )) {
          console.log('[SW] 📦 Serving from cache:', request.url);
          return cachedResponse;
        }

        // For other requests, try network first
        return fetch(request)
          .then((response) => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response for caching
            const responseToCache = response.clone();

            // Cache successful responses
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
                console.log('[SW] 💾 Cached response:', request.url);
              });

            return response;
          })
          .catch(() => {
            // Network failed - try to serve from cache
            if (cachedResponse) {
              console.log('[SW] 🌐 Network failed, serving from cache:', request.url);
              return cachedResponse;
            }

            // If it's a navigation request and no cache, serve index.html
            if (request.mode === 'navigate') {
              return caches.match('/')
                .then((indexResponse) => {
                  if (indexResponse) {
                    return indexResponse;
                  }
                  // Fallback offline page
                  return new Response(
                    `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <title>Offline - Todo App</title>
                        <meta charset="utf-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                          body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #2a8c7b 0%, #1a5d4f 100%);
                            color: white;
                            text-align: center;
                          }
                          .offline-container {
                            padding: 2rem;
                          }
                          h1 { margin-bottom: 1rem; }
                          p { opacity: 0.9; }
                        </style>
                      </head>
                      <body>
                        <div class="offline-container">
                          <h1>📴 You're Offline</h1>
                          <p>Please check your internet connection and try again.</p>
                          <p>The app will work once you're back online.</p>
                        </div>
                      </body>
                    </html>
                    `,
                    {
                      headers: { 'Content-Type': 'text/html' }
                    }
                  );
                });
            }

            // For other requests, return a basic error response
            return new Response('Offline - Resource not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
  console.log('[SW] 📨 Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Skip waiting and activate immediately
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    // Cache additional URLs on demand
    event.waitUntil(
      caches.open(RUNTIME_CACHE)
        .then((cache) => {
          return cache.addAll(event.data.urls);
        })
        .then(() => {
          // Send confirmation back to client
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage({ success: true });
          }
        })
    );
  }
});

// Sync event - handle background sync (if needed in future)
self.addEventListener('sync', (event) => {
  console.log('[SW] 🔄 Background sync:', event.tag);
  
  if (event.tag === 'sync-tasks') {
    event.waitUntil(
      // Add your sync logic here
      Promise.resolve()
    );
  }
});

// Firebase Cloud Messaging - Background message handler
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log("[SW] ===== FIREBASE BACKGROUND MESSAGE RECEIVED =====");
    console.log("[SW] Full payload:", JSON.stringify(payload, null, 2));

    // Extract notification details
    const notificationTitle = payload.notification?.title || payload.data?.title || "New Task Created";
    const notificationBody = payload.notification?.body || payload.data?.body || "A new task was added";
    
    const notificationOptions = {
      body: notificationBody,
      icon: payload.notification?.icon || payload.webpush?.notification?.icon || "/icons/icon.png",
      badge: payload.notification?.badge || payload.webpush?.notification?.badge || "/icons/icon.png",
      image: payload.notification?.image || payload.data?.image || "/icons/icon.png",
      sound: payload.notification?.sound || payload.webpush?.notification?.sound || "default",
      data: {
        ...payload.data,
        projectId: payload.data?.projectId || "",
        projectName: payload.data?.projectName || "",
        taskId: payload.data?.taskId || "",
        taskName: payload.data?.taskName || "",
        addedBy: payload.data?.addedBy || payload.data?.createdBy || "",
        addedByName: payload.data?.addedByName || payload.data?.createdByName || "",
        link: payload.fcmOptions?.link || payload.data?.link || ""
      },
      tag: payload.data?.taskId || `task-${Date.now()}`,
      requireInteraction: true,
      vibrate: [200, 100, 200, 100, 200],
      silent: false,
      renotify: true,
      timestamp: Date.now(),
      actions: [
        {
          action: "view",
          title: "View Task"
        },
        {
          action: "dismiss",
          title: "Dismiss"
        }
      ]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions)
      .then(() => {
        console.log("[SW] ✅ Firebase background notification shown successfully!");
      })
      .catch((error) => {
        console.error("[SW] ❌ Error showing Firebase notification:", error);
      });
  });
  
  console.log("[SW] ✅ Firebase onBackgroundMessage handler registered");
}

// Push event - handle push notifications (fallback for non-Firebase)
self.addEventListener('push', (event) => {
  console.log('[SW] 📬 Push event received');
  
  if (!event.data) {
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { body: event.data.text() };
  }

  const title = data.title || 'Todo App';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon.png',
    badge: '/icons/icon.png',
    data: data.data || {},
    tag: data.tag || 'default',
    requireInteraction: false,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event - handle notification clicks and action buttons
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 👆 Notification clicked:', event.notification.tag);
  console.log('[SW] Action:', event.action);
  console.log('[SW] Notification data:', event.notification.data);
  
  const data = event.notification.data || {};
  const action = event.action;
  
  // Handle action buttons
  if (action === 'dismiss') {
    console.log('[SW] User dismissed notification');
    event.notification.close();
    return;
  }
  
  // Default action or "view" action - open the app
  event.notification.close();

  // Get URL from data.link (absolute URL from backend) or construct from data
  let urlToOpen = data.link || data.url || '/dashboard';
  
  // If link is relative, make it absolute using the origin
  if (urlToOpen.startsWith('/')) {
    urlToOpen = self.location.origin + urlToOpen;
  }
  
  // Fallback: construct from projectId if link not available
  if (!data.link && !data.url && data.projectId) {
    const projectName = data.projectName || 'Project';
    urlToOpen = self.location.origin + `/view/${data.projectId}/${encodeURIComponent(projectName)}`;
  }

  console.log('[SW] Opening URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find and focus existing window
        for (let client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => {
              if (!client.url.includes(urlToOpen)) {
                return client.navigate(urlToOpen);
              }
            });
          }
        }
        // No existing window, open new one
        return clients.openWindow(urlToOpen);
      })
  );
});

console.log('[SW] ✅ Service Worker script loaded and ready');
