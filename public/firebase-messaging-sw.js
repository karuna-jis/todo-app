// Service Worker for Firebase Cloud Messaging + Offline Support
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

// Badge API utility for service worker
const BADGE_STORAGE_KEY = 'pwa_badge_count';

// Get badge count from IndexedDB (service worker can't use localStorage)
const getBadgeCountFromStorage = async () => {
  try {
    // Try to get from IndexedDB
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('badgeDB', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('badgeStore')) {
          db.createObjectStore('badgeStore');
        }
      };
    });
    
    const transaction = db.transaction(['badgeStore'], 'readonly');
    const store = transaction.objectStore('badgeStore');
    const request = store.get(BADGE_STORAGE_KEY);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result ? parseInt(request.result, 10) : 0);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.log('[SW Badge] Error reading badge count:', error);
    return 0;
  }
};

// Set badge count in IndexedDB
const setBadgeCountInStorage = async (count) => {
  try {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('badgeDB', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('badgeStore')) {
          db.createObjectStore('badgeStore');
        }
      };
    });
    
    const transaction = db.transaction(['badgeStore'], 'readwrite');
    const store = transaction.objectStore('badgeStore');
    if (count > 0) {
      store.put(count.toString(), BADGE_STORAGE_KEY);
    } else {
      store.delete(BADGE_STORAGE_KEY);
    }
  } catch (error) {
    console.log('[SW Badge] Error writing badge count:', error);
  }
};

// Increment badge in service worker (works even when app is closed)
const incrementBadgeInSW = async () => {
  try {
    // Check if Badge API is supported
    if ('setAppBadge' in self.navigator && 'clearAppBadge' in self.navigator) {
      const currentCount = await getBadgeCountFromStorage();
      const newCount = currentCount + 1;
      
      console.log(`[SW Badge] 📈 Incrementing badge: ${currentCount} → ${newCount}`);
      
      // Set badge using Badge API
      await self.navigator.setAppBadge(newCount);
      console.log(`[SW Badge] ✅ Badge set to ${newCount} (Badge API in Service Worker)`);
      
      // Store count in IndexedDB
      await setBadgeCountInStorage(newCount);
      
      return newCount;
    } else {
      // Badge API not supported, just store count
      const currentCount = await getBadgeCountFromStorage();
      const newCount = currentCount + 1;
      await setBadgeCountInStorage(newCount);
      console.log(`[SW Badge] ⚠️ Badge API not supported, stored count: ${newCount}`);
      return newCount;
    }
  } catch (error) {
    console.error('[SW Badge] ❌ Error incrementing badge:', error);
    // Fallback: try to store count anyway
    try {
      const currentCount = await getBadgeCountFromStorage();
      const newCount = currentCount + 1;
      await setBadgeCountInStorage(newCount);
      return newCount;
    } catch (e) {
      console.error('[SW Badge] ❌ Error storing badge count:', e);
      return 0;
    }
  }
};

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
try {
  firebase.initializeApp(firebaseConfig);
  console.log("[SW] ✅ Firebase initialized successfully");
} catch (error) {
  console.error("[SW] ❌ Firebase initialization error:", error);
}

// Initialize Firebase Messaging
let messaging = null;
try {
  messaging = firebase.messaging();
  console.log("[SW] ✅ Firebase Messaging initialized successfully");
} catch (error) {
  console.error("[SW] ❌ Firebase Messaging initialization error:", error);
}

// Log service worker initialization
console.log("[SW] ===== SERVICE WORKER INITIALIZED =====");
console.log("[SW] Service worker scope:", self.registration?.scope || "unknown");
console.log("[SW] Messaging object:", messaging ? "✅ Available" : "❌ Not available");
console.log("[SW] Service worker ready to handle background notifications");

// IndexedDB for storing badge count when app is closed
const DB_NAME = 'badge_db';
const DB_VERSION = 1;
const STORE_NAME = 'badge_count';

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error("[SW] ❌ IndexedDB open error:", request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      console.log("[SW] ✅ IndexedDB opened successfully");
      resolve(request.result);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        console.log("[SW] ✅ IndexedDB object store created");
      }
    };
  });
};

// Get badge count from IndexedDB
const getBadgeCountFromDB = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('badge_count');
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.count : 0);
      };
      request.onerror = () => {
        console.error("[SW] Error reading badge count from IndexedDB:", request.error);
        resolve(0);
      };
    });
  } catch (error) {
    console.error("[SW] Error getting badge count from IndexedDB:", error);
    return 0;
  }
};

// Set badge count in IndexedDB
const setBadgeCountInDB = async (count) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    await store.put({ id: 'badge_count', count: count });
    console.log(`[SW] ✅ Badge count ${count} stored in IndexedDB`);
  } catch (error) {
    console.error("[SW] Error storing badge count in IndexedDB:", error);
  }
};

// Increment badge count in IndexedDB
const incrementBadgeCountInDB = async () => {
  const currentCount = await getBadgeCountFromDB();
  const newCount = currentCount + 1;
  await setBadgeCountInDB(newCount);
  console.log(`[SW] 📈 Badge count incremented: ${currentCount} → ${newCount}`);
  return newCount;
};

// PWA Offline Caching
const CACHE_NAME = 'todo-app-v2';
const urlsToCache = [
  '/',
  '/dashboard',
  '/manifest.json',
  '/icons/icon.png',
  '/icons/icon.png',
  '/icons/icon.png',
  '/icons/icon.png',
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
// CRITICAL: This handler MUST be registered for background notifications to work
if (!messaging) {
  console.error("[SW] ❌ CRITICAL: Messaging object is null! Background notifications will NOT work!");
  console.error("[SW] Check Firebase initialization in service worker");
} else {
  console.log("[SW] ✅ Registering onBackgroundMessage handler...");
  
  messaging.onBackgroundMessage((payload) => {
    console.log("[SW] ===== BACKGROUND MESSAGE RECEIVED (App Closed) =====");
    console.log("[SW] Full payload:", JSON.stringify(payload, null, 2));
    console.log("[SW] Notification object:", payload.notification);
    console.log("[SW] Data object:", payload.data);
    console.log("[SW] Webpush object:", payload.webpush);

    // Extract notification details with all information
    const taskName = payload.data?.taskName || payload.data?.text || "New Task";
    const addedByName = payload.data?.addedByName || payload.data?.createdByName || "";
    const addedBy = payload.data?.addedBy || payload.data?.createdBy || "";
    const projectName = payload.data?.projectName || "Project";
    
    // Build detailed notification title and body (like dashboard popup)
    const notificationTitle = payload.notification?.title || payload.data?.title || "New Task Added";
    
    // Create detailed body with all information: User, Task, Project
    let notificationBody = "";
    if (addedByName || addedBy) {
      const userName = addedByName || addedBy.split('@')[0] || "Someone";
      notificationBody = `${userName} added new task`;
    } else {
      notificationBody = "New task added";
    }
    
    // Add task name
    if (taskName && taskName !== "New Task") {
      notificationBody += `: ${taskName}`;
    }
    
    // Add project name in a new line format (will show in notification)
    if (projectName && projectName !== "Project") {
      notificationBody += `\n📁 Project: ${projectName}`;
    }
    
    // Create unique tag to prevent duplicates - combine taskId, projectId, and timestamp
    const taskId = payload.data?.taskId || "";
    const projectId = payload.data?.projectId || "";
    const uniqueTag = taskId && projectId 
      ? `task-${projectId}-${taskId}` 
      : `task-${projectId || 'unknown'}-${Date.now()}`;
    
    // Check for existing notifications with same tag to prevent duplicates
    const checkAndShowNotification = async () => {
      try {
        const notifications = await self.registration.getNotifications({ tag: uniqueTag });
        
        // If notification with same tag exists, close it first to avoid duplicates
        if (notifications.length > 0) {
          console.log("[SW] ⚠️ Duplicate notification detected with tag:", uniqueTag);
          notifications.forEach(notif => notif.close());
          // Small delay to ensure old notification is closed
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.log("[SW] Could not check existing notifications:", error);
      }
      
      // Build notification options - Make it popup/alert style with sound
      // NOTE: 'sound' property is not standard and may be ignored by browsers
      // We rely on 'silent: false' to trigger browser's default notification sound
      const notificationOptions = {
        body: notificationBody,
        icon: payload.notification?.icon || payload.webpush?.notification?.icon || "/icons/icon.png",
        badge: payload.notification?.badge || payload.webpush?.notification?.badge || "/icons/icon.png",
        image: payload.notification?.image || payload.data?.image || "/icons/icon.png", // Large image for popup
        data: {
          ...payload.data,
          // Ensure all data fields are preserved with proper values
          projectId: projectId || payload.data?.projectId || "",
          projectName: projectName || payload.data?.projectName || "",
          taskId: taskId || payload.data?.taskId || "",
          taskName: taskName || payload.data?.taskName || "",
          addedBy: addedBy || payload.data?.addedBy || payload.data?.createdBy || "",
          addedByName: addedByName || payload.data?.addedByName || payload.data?.createdByName || "",
          createdBy: addedBy || payload.data?.addedBy || payload.data?.createdBy || "",
          createdByName: addedByName || payload.data?.addedByName || payload.data?.createdByName || "",
          link: payload.fcmOptions?.link || payload.data?.link || "",
          // Store formatted notification details
          notificationTitle: notificationTitle,
          notificationBody: notificationBody
        },
        tag: uniqueTag, // Unique tag to prevent duplicates
        requireInteraction: true, // CRITICAL: Keep notification visible until user interacts (popup style)
        vibrate: [200, 100, 200, 100, 200, 100, 200], // Longer vibration pattern for attention
        silent: false, // CRITICAL: Must be false for browser to play default notification sound
        renotify: false, // Set to false to prevent duplicate notifications
        timestamp: Date.now(),
        // Additional options for better mobile support and popup visibility
        dir: "ltr",
        lang: "en",
        // Make notification more prominent (popup style)
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

      console.log("[SW] 📱 Background Notification Details:");
      console.log("[SW]   Title:", notificationTitle);
      console.log("[SW]   Body:", notificationBody);
      console.log("[SW]   Task:", taskName);
      console.log("[SW]   Added By:", addedByName || addedBy);
      console.log("[SW]   Project:", projectName);
      console.log("[SW]   Unique tag:", uniqueTag);
      console.log("[SW]   Silent:", notificationOptions.silent, "(false = sound enabled)");
      console.log("[SW]   Vibrate:", notificationOptions.vibrate);
      console.log("[SW] Full notification options:", JSON.stringify(notificationOptions, null, 2));

      // CRITICAL: Always show notification when app is closed
      // Show notification with popup style and sound
      return self.registration.showNotification(notificationTitle, notificationOptions)
        .then(async () => {
          console.log("[SW] ✅ Background notification shown successfully with popup style and sound!");
          
          // Increment badge count in IndexedDB (for when app is closed)
          const newBadgeCount = await incrementBadgeCountInDB();
          console.log(`[SW] 📱 Badge count updated in IndexedDB: ${newBadgeCount} (app icon will show this when app opens)`);
          
          // Send message to all open clients to increment badge (for when app is open)
          return self.clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
              if (clientList.length > 0) {
                console.log(`[SW] 📢 Sending badge increment message to ${clientList.length} client(s)`);
                clientList.forEach((client) => {
                  client.postMessage({
                    type: "INC_BADGE",
                    payload: {
                      projectId: payload.data?.projectId || "",
                      projectName: payload.data?.projectName || "",
                      taskId: payload.data?.taskId || "",
                      taskName: payload.data?.taskName || "",
                      addedBy: payload.data?.addedBy || payload.data?.createdBy || "",
                      addedByName: payload.data?.addedByName || payload.data?.createdByName || "",
                      link: payload.fcmOptions?.link || payload.data?.link || "",
                      timestamp: Date.now(),
                      badgeCount: newBadgeCount
                    }
                  }).catch((err) => {
                    console.log("[SW] ⚠️ Could not send message to client:", err);
                  });
                });
              } else {
                console.log("[SW] ℹ️ No open clients - badge count stored in IndexedDB for when app opens");
              }
            });
        })
        .catch((error) => {
          console.error("[SW] ❌ Error showing background notification:", error);
          // Try again with minimal options if first attempt fails (still popup style with sound)
          return self.registration.showNotification(notificationTitle, {
            body: notificationBody,
            icon: "/icons/icon.png",
            badge: "/icons/icon.png",
            tag: uniqueTag,
            requireInteraction: true, // Keep as popup even in fallback
            silent: false, // CRITICAL: Must be false for browser to play default notification sound
            vibrate: [200, 100, 200, 100, 200],
            data: payload.data || {}
          });
        });
    };

    // Use waitUntil to ensure notification is shown even if service worker is busy
    return checkAndShowNotification();
  });
  
  console.log("[SW] ✅ onBackgroundMessage handler registered successfully");
}

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

  // Extract notification details with all information
  const taskName = payload.data?.taskName || payload.data?.text || "New Task";
  const addedByName = payload.data?.addedByName || payload.data?.createdByName || "";
  const addedBy = payload.data?.addedBy || payload.data?.createdBy || "";
  const projectName = payload.data?.projectName || "Project";
  
  // Build detailed notification title and body (like dashboard popup)
  const notificationTitle = payload.notification?.title || payload.data?.title || "New Task Added";
  
  // Create detailed body with all information: User, Task, Project
  let notificationBody = "";
  if (addedByName || addedBy) {
    const userName = addedByName || addedBy.split('@')[0] || "Someone";
    notificationBody = `${userName} added new task`;
  } else {
    notificationBody = "New task added";
  }
  
  // Add task name
  if (taskName && taskName !== "New Task") {
    notificationBody += `: ${taskName}`;
  }
  
  // Add project name in a new line format (will show in notification)
  if (projectName && projectName !== "Project") {
    notificationBody += `\n📁 Project: ${projectName}`;
  }
  
  // Create unique tag to prevent duplicates
  const taskId = payload.data?.taskId || "";
  const projectId = payload.data?.projectId || "";
  const uniqueTag = taskId && projectId 
    ? `task-${projectId}-${taskId}` 
    : `task-${projectId || 'unknown'}-${Date.now()}`;
  
  // Check and show notification with duplicate prevention
  const checkAndShowNotification = async () => {
    try {
      const notifications = await self.registration.getNotifications({ tag: uniqueTag });
      
      // If notification with same tag exists, close it first to avoid duplicates
      if (notifications.length > 0) {
        console.log("[SW] ⚠️ Duplicate notification detected with tag:", uniqueTag);
        notifications.forEach(notif => notif.close());
        // Small delay to ensure old notification is closed
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.log("[SW] Could not check existing notifications:", error);
    }
    
    const notificationOptions = {
      body: notificationBody,
      icon: payload.notification?.icon || payload.webpush?.notification?.icon || "/icons/icon.png",
      badge: payload.notification?.badge || payload.webpush?.notification?.badge || "/icons/icon.png",
      image: payload.notification?.image || payload.data?.image || "/icons/icon.png", // Large image for popup
      vibrate: [200, 100, 200, 100, 200, 100, 200], // Longer vibration for attention
      silent: false, // CRITICAL: Must be false for browser to play default notification sound
      data: {
        ...payload.data,
        // Ensure all data fields are preserved with proper values
        projectId: projectId || payload.data?.projectId || "",
        projectName: projectName || payload.data?.projectName || "",
        taskId: taskId || payload.data?.taskId || "",
        taskName: taskName || payload.data?.taskName || "",
        addedBy: addedBy || payload.data?.addedBy || payload.data?.createdBy || "",
        addedByName: addedByName || payload.data?.addedByName || payload.data?.createdByName || "",
        createdBy: addedBy || payload.data?.addedBy || payload.data?.createdBy || "",
        createdByName: addedByName || payload.data?.addedByName || payload.data?.createdByName || "",
        link: payload.fcmOptions?.link || payload.data?.link || "",
        // Store formatted notification details
        notificationTitle: notificationTitle,
        notificationBody: notificationBody
      },
      tag: uniqueTag, // Unique tag to prevent duplicates
      requireInteraction: true, // CRITICAL: Keep notification visible (popup style)
      renotify: false, // Set to false to prevent duplicate notifications
      timestamp: Date.now(),
      // Popup-style actions
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

    console.log("[SW] 📱 Push Notification Details:");
    console.log("[SW]   Title:", notificationTitle);
    console.log("[SW]   Body:", notificationBody);
    console.log("[SW]   Task:", taskName);
    console.log("[SW]   Added By:", addedByName || addedBy);
    console.log("[SW]   Project:", projectName);
    console.log("[SW]   Unique tag:", uniqueTag);
    console.log("[SW] Full notification options:", JSON.stringify(notificationOptions, null, 2));

    return self.registration.showNotification(notificationTitle, notificationOptions)
      .then(async () => {
        console.log("[SW] ✅ Push notification shown successfully with popup style and sound!");
        
        // Increment badge count in IndexedDB (for when app is closed)
        const newBadgeCount = await incrementBadgeCountInDB();
        console.log(`[SW] 📱 Badge count updated in IndexedDB: ${newBadgeCount} (app icon will show this when app opens)`);
        
        // Send message to all open clients to increment badge (for when app is open)
        return self.clients.matchAll({ type: "window", includeUncontrolled: true })
          .then((clientList) => {
            if (clientList.length > 0) {
              console.log(`[SW] 📢 Sending badge increment message to ${clientList.length} client(s)`);
              clientList.forEach((client) => {
                client.postMessage({
                  type: "INC_BADGE",
                  payload: {
                    projectId: payload.data?.projectId || "",
                    projectName: payload.data?.projectName || "",
                    taskId: payload.data?.taskId || "",
                    taskName: payload.data?.taskName || "",
                    addedBy: payload.data?.addedBy || payload.data?.createdBy || "",
                    addedByName: payload.data?.addedByName || payload.data?.createdByName || "",
                    link: payload.fcmOptions?.link || payload.data?.link || "",
                    timestamp: Date.now(),
                    badgeCount: newBadgeCount
                  }
                }).catch((err) => {
                  console.log("[SW] ⚠️ Could not send message to client:", err);
                });
              });
            } else {
              console.log("[SW] ℹ️ No open clients - badge count stored in IndexedDB for when app opens");
            }
          });
      })
      .catch((error) => {
        console.error("[SW] ❌ Error showing push notification:", error);
      });
  };

  event.waitUntil(checkAndShowNotification());
});

// Handle notification click and action buttons
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] ===== NOTIFICATION CLICKED =====");
  console.log("[SW] Action:", event.action);
  console.log("[SW] Notification data:", event.notification.data);
  
  const data = event.notification.data || {};
  const action = event.action;
  
  // Handle action buttons
  if (action === "dismiss") {
    console.log("[SW] User dismissed notification");
    event.notification.close();
    return;
  }
  
  // Default action or "view" action - open the app
  event.notification.close();

  // Clear badge when notification is clicked
  self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((clientList) => {
      if (clientList.length > 0) {
        console.log("[SW] 📢 Sending badge clear message to clients");
        clientList.forEach((client) => {
          client.postMessage({
            type: "CLEAR_BADGE"
          }).catch((err) => {
            console.log("[SW] ⚠️ Could not send clear badge message to client:", err);
          });
        });
      }
    });

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
