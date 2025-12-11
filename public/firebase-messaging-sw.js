// Service Worker for Firebase Cloud Messaging
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

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Background notifications
messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Background message received:", payload);

  const notificationTitle = payload.notification?.title || "New Task Created";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "A new task was added",
    icon: payload.notification?.icon || "/logo192.png",
    badge: "/logo192.png",
    sound: "default", // WhatsApp-style sound (browser will play default notification sound)
    data: payload.data || {},
    tag: payload.data?.taskId || "task-update",
    requireInteraction: false,
    vibrate: [200, 100, 200], // WhatsApp-style vibration pattern (for mobile)
    silent: false // Ensure sound is not silenced
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Fallback: some browsers need this to support push
self.addEventListener("push", (event) => {
  if (!event.data) return;

  const payload = event.data.json();
  console.log("[SW] Push event:", payload);

  const notificationTitle = payload.notification?.title || "Notification";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body,
    icon: payload.notification?.icon || "/logo192.png",
    badge: "/logo192.png",
    sound: "default",
    vibrate: [200, 100, 200], // WhatsApp-style vibration pattern (for mobile)
    silent: false, // Ensure sound is not silenced
    data: payload.data || {},
    tag: payload.data?.taskId || "task-update",
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
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
