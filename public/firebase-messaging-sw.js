// Service Worker for Firebase Cloud Messaging + Offline Support
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBDxGeqSk1xheSRAtk6HTZNcKqC_LNankE",
  authDomain: "to-do-app-dcdb3.firebaseapp.com",
  projectId: "to-do-app-dcdb3",
  storageBucket: "to-do-app-dcdb3.appspot.com",   // FIXED
  messagingSenderId: "190624201750",
  appId: "1:190624201750:web:2c2d842af364481bdcc937",
  measurementId: "G-259PEFN7CL"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Log service worker initialization
console.log("[SW] ===== SERVICE WORKER INITIALIZED =====");
console.log("[SW] Firebase initialized");
console.log("[SW] Messaging initialized");
console.log("[SW] Service worker scope:", self.registration?.scope || "unknown");
console.log("[SW] Service worker ready to handle background notifications");

// PWA Offline Caching
const CACHE_NAME = 'todo-app-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/icons/iconn.png',
  '/icons/icon.png',
  '/icons/icon.png',
  '/icons/iconn.png',
  '/static/js/bundle.js',
  '/static/css/main.css'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache).catch((err) => {
          console.log('[SW] Cache addAll error (some files may not exist):', err);
        });
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all pages
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip Firebase and external API requests
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('gstatic') ||
      event.request.url.includes('googleapis') ||
      event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          return response;
        }
        
        // Try network first, then cache
        return fetch(event.request).then((response) => {
          // Don't cache if not a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // Clone the response for caching
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return response;
        }).catch(() => {
          // If fetch fails and it's a navigation request, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/').then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // Fallback: return a basic offline page
              return new Response('Offline - Please check your connection', {
                headers: { 'Content-Type': 'text/html' }
              });
            });
          }
          // For other requests, return cached version if available
          return caches.match(event.request);
        });
      })
  );
});

// Background notifications - This handles notifications when app is CLOSED
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] ===== BACKGROUND MESSAGE RECEIVED (App Closed) =====");
  console.log("[SW] Full payload:", JSON.stringify(payload, null, 2));
  console.log("[SW] Notification object:", payload.notification);
  console.log("[SW] Data object:", payload.data);
  console.log("[SW] Webpush object:", payload.webpush);

  // Extract notification details - prioritize notification object, fallback to data
  const notificationTitle = payload.notification?.title || payload.data?.title || "New Task Created";
  const notificationBody = payload.notification?.body || payload.data?.body || "A new task was added";
  
  // Build notification options
  const notificationOptions = {
    body: notificationBody,
    icon: payload.notification?.icon || payload.webpush?.notification?.icon || "/icons/iconn.png",
    badge: payload.notification?.badge || payload.webpush?.notification?.badge || "/icons/iconn.png",
    sound: payload.notification?.sound || payload.webpush?.notification?.sound || "default",
    data: {
      ...payload.data,
      // Ensure all data fields are preserved
      projectId: payload.data?.projectId || "",
      projectName: payload.data?.projectName || "",
      taskId: payload.data?.taskId || "",
      taskName: payload.data?.taskName || "",
      addedBy: payload.data?.addedBy || payload.data?.createdBy || "",
      addedByName: payload.data?.addedByName || payload.data?.createdByName || "",
      link: payload.fcmOptions?.link || payload.data?.link || ""
    },
    tag: payload.data?.taskId || `task-${Date.now()}`, // Unique tag to prevent duplicates
    requireInteraction: false,
    vibrate: [200, 100, 200], // Vibration pattern for mobile
    silent: false, // CRITICAL: Must be false for sound to play
    renotify: true,
    timestamp: Date.now(),
    // Additional options for better mobile support
    dir: "ltr",
    lang: "en"
  };

  console.log("[SW] Notification title:", notificationTitle);
  console.log("[SW] Notification body:", notificationBody);
  console.log("[SW] Notification options:", JSON.stringify(notificationOptions, null, 2));

  // CRITICAL: Always show notification when app is closed
  // Use waitUntil to ensure notification is shown even if service worker is busy
  return self.registration.showNotification(notificationTitle, notificationOptions)
    .then(() => {
      console.log("[SW] ✅ Background notification shown successfully!");
    })
    .catch((error) => {
      console.error("[SW] ❌ Error showing background notification:", error);
      // Try again with minimal options if first attempt fails
      return self.registration.showNotification(notificationTitle, {
        body: notificationBody,
        icon: "/icons/iconn.png",
        badge: "/icons/iconn.png",
        data: payload.data || {}
      });
    });
});

// Fallback: Push event listener (for browsers that don't use FCM directly)
self.addEventListener("push", (event) => {
  console.log("[SW] ===== PUSH EVENT RECEIVED =====");
  
  if (!event.data) {
    console.log("[SW] ⚠️ Push event has no data");
    return;
  }

  let payload;
  try {
    payload = event.data.json();
    console.log("[SW] Push payload:", JSON.stringify(payload, null, 2));
  } catch (e) {
    console.log("[SW] Push data is not JSON, using text:", event.data.text());
    payload = { data: { body: event.data.text() } };
  }

  const notificationTitle = payload.notification?.title || payload.data?.title || "New Task Added";
  const notificationBody = payload.notification?.body || payload.data?.body || "A new task was added";
  
  const notificationOptions = {
    body: notificationBody,
    icon: payload.notification?.icon || payload.webpush?.notification?.icon || "/icons/iconn.png",
    badge: payload.notification?.badge || payload.webpush?.notification?.badge || "/icons/iconn.png",
    sound: payload.notification?.sound || payload.webpush?.notification?.sound || "default",
    vibrate: [200, 100, 200],
    silent: false, // CRITICAL: Must be false for sound
    data: {
      ...payload.data,
      projectId: payload.data?.projectId || "",
      projectName: payload.data?.projectName || "",
      taskId: payload.data?.taskId || "",
      taskName: payload.data?.taskName || "",
      link: payload.fcmOptions?.link || payload.data?.link || ""
    },
    tag: payload.data?.taskId || `task-${Date.now()}`,
    requireInteraction: false,
    renotify: true,
    timestamp: Date.now()
  };

  console.log("[SW] Showing push notification:", notificationTitle);
  console.log("[SW] Notification options:", JSON.stringify(notificationOptions, null, 2));

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
      .then(() => {
        console.log("[SW] ✅ Push notification shown successfully!");
      })
      .catch((error) => {
        console.error("[SW] ❌ Error showing push notification:", error);
      })
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  
  // Get URL from fcmOptions.link (absolute URL from backend) or construct from data
  let urlToOpen = data.link || "/dashboard";
  
  // If link is relative, make it absolute using the origin
  if (urlToOpen.startsWith("/")) {
    // Get origin from any existing client or use default
    urlToOpen = self.location.origin + urlToOpen;
  }
  
  // Fallback: construct from projectId if link not available
  if (!data.link && data.projectId) {
    const projectName = data.projectName || "Project";
    urlToOpen = self.location.origin + `/view/${data.projectId}/${encodeURIComponent(projectName)}`;
  }

  console.log("[SW] Opening URL:", urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Try to find and focus existing window with same origin
      for (let client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          // Focus the window and navigate to the URL
          return client.focus().then(() => {
            // Navigate to the URL if it's different
            if (!client.url.includes(urlToOpen)) {
              return client.navigate(urlToOpen);
            }
          });
        }
      }
      // No existing window found, open new one
      return clients.openWindow(urlToOpen);
    })
  );
});
