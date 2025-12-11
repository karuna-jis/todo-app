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
    sound: "default",
    data: payload.data || {},
    tag: payload.data?.taskId || "task-update",
    requireInteraction: false
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
    icon: "/logo192.png",
    sound: "default",
    data: payload.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions)
  );
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const projectId = data.projectId;
  const projectName = data.projectName || "Project";

  const urlToOpen = projectId
    ? `/view/${projectId}/${encodeURIComponent(projectName)}`
    : "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (let client of clientList) {
        if (client.url.includes(urlToOpen) && "focus" in client) return client.focus();
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
