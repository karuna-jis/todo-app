// FCM Token Management Utility
// Handles FCM token registration, storage, and updates

import { messaging, getToken } from "../components/firebase";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../components/firebase";

// VAPID key - Get this from Firebase Console
// Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// Set it via environment variable: REACT_APP_VAPID_KEY
const VAPID_KEY = process.env.REACT_APP_VAPID_KEY;

/**
 * Request notification permission from user
 * @returns {Promise<boolean>} true if permission granted, false otherwise
 */
export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    console.warn("Notification permission denied");
    return false;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  return permission === "granted";
};

/**
 * Get FCM token for current user
 * @returns {Promise<string|null>} FCM token or null if unavailable
 */
export const getFCMToken = async () => {
  if (!messaging) {
    console.warn("⚠️ Firebase Messaging not initialized");
    return null;
  }

  try {
    // Check VAPID key
    if (!VAPID_KEY) {
      console.error("❌ VAPID_KEY is not set!");
      console.error("   Set REACT_APP_VAPID_KEY in .env file");
      console.error("   Get it from: Firebase Console > Project Settings > Cloud Messaging > Web Push certificates");
      return null;
    }

    // Request permission first
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn("⚠️ Notification permission not granted");
      console.warn("   User needs to allow notifications in browser");
      return null;
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    });

    if (token) {
      console.log("✅ FCM Token obtained:", token.substring(0, 20) + "...");
      return token;
    } else {
      console.warn("⚠️ No FCM token available");
      return null;
    }
  } catch (error) {
    console.error("❌ Error getting FCM token:", error);
    console.error("   Error details:", error.message);
    return null;
  }
};

/**
 * Save FCM token to user document in Firestore
 * @param {string} userUID - User UID
 * @param {string} token - FCM token
 */
export const saveFCMTokenToFirestore = async (userUID, token) => {
  if (!userUID || !token) {
    console.warn("⚠️ User UID or token missing");
    return;
  }

  try {
    const userRef = doc(db, "users", userUID);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Update existing user document
      await updateDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
      console.log(`✅ FCM token saved to user document: ${userUID}`);
    } else {
      // Create user document if it doesn't exist
      await setDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
      console.log(`✅ FCM token saved to new user document: ${userUID}`);
    }
  } catch (error) {
    console.error("❌ Error saving FCM token to Firestore:", error);
    console.error("   Error details:", error.message);
  }
};

/**
 * Initialize FCM token registration for current user
 * Call this when user logs in
 * @param {string} userUID - User UID
 */
export const initializeFCMToken = async (userUID) => {
  if (!userUID) {
    console.warn("User UID not provided");
    return;
  }

  try {
    console.log("🔄 Initializing FCM token for user:", userUID);
    
    // Get FCM token
    const token = await getFCMToken();
    
    if (token) {
      // Save token to Firestore
      await saveFCMTokenToFirestore(userUID, token);
      console.log("✅ FCM token initialization complete");
    } else {
      console.warn("⚠️ Could not obtain FCM token");
      console.warn("   Check:");
      console.warn("   1. VAPID_KEY is set in .env file");
      console.warn("   2. Notification permission is granted");
      console.warn("   3. Service worker is registered");
    }
  } catch (error) {
    console.error("❌ Error initializing FCM token:", error);
    console.error("   Error details:", error.message);
  }
};

/**
 * Manual FCM token registration - can be called from browser console
 * Usage: window.registerFCMToken()
 */
export const registerFCMTokenManually = async () => {
  const { auth } = await import("../components/firebase");
  const user = auth.currentUser;
  
  if (!user) {
    console.error("❌ No user logged in. Please login first.");
    return;
  }

  console.log("🔄 Manual FCM token registration for:", user.uid);
  await initializeFCMToken(user.uid);
};

// Make it available in browser console
if (typeof window !== "undefined") {
  window.registerFCMToken = registerFCMTokenManually;
  window.checkFCMStatus = async () => {
    const { auth } = await import("../components/firebase");
    const { doc, getDoc } = await import("firebase/firestore");
    const { db } = await import("../components/firebase");
    
    const user = auth.currentUser;
    if (!user) {
      console.error("❌ No user logged in");
      return;
    }

    console.log("📊 FCM Status Check:");
    console.log("   User UID:", user.uid);
    console.log("   VAPID_KEY set:", !!process.env.REACT_APP_VAPID_KEY);
    console.log("   Notification permission:", Notification.permission);
    console.log("   Messaging initialized:", !!messaging);
    
    // Show how to fix permission if denied
    if (Notification.permission === "denied") {
      console.warn("   ⚠️ PERMISSION DENIED - Fix steps:");
      console.warn("   1. Browser address bar → 🔒 icon → Site settings");
      console.warn("   2. Notifications → Allow");
      console.warn("   3. Refresh page (F5)");
      console.warn("   4. Run registerFCMToken() again");
    }
    
    try {
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        console.log("   Has FCM token in Firestore:", !!data.fcmToken);
        if (data.fcmToken) {
          console.log("   Token:", data.fcmToken.substring(0, 20) + "...");
        } else {
          console.warn("   ⚠️ No FCM token in Firestore");
          if (Notification.permission === "granted") {
            console.warn("   Run: registerFCMToken() to register token");
          }
        }
      } else {
        console.log("   User document doesn't exist in Firestore");
      }
    } catch (error) {
      console.error("   Error checking Firestore:", error.message);
    }
  };
}

