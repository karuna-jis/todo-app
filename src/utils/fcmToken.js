// FCM Token Management Utility
// Handles FCM token registration, storage, and updates

import { messaging, getToken } from "../components/firebase";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../components/firebase";

// VAPID key - Get this from Firebase Console
// Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
// If you don't have one, generate it in Firebase Console
// You can also set it via environment variable: REACT_APP_VAPID_KEY
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
    console.warn("Firebase Messaging not initialized");
    return null;
  }

  try {
    // Request permission first
    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn("Notification permission not granted");
      return null;
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    });

    if (token) {
      console.log("FCM Token obtained:", token);
      return token;
    } else {
      console.warn("No FCM token available");
      return null;
    }
  } catch (error) {
    console.error("Error getting FCM token:", error);
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
    console.warn("User UID or token missing");
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
      console.log("FCM token saved to user document");
    } else {
      // Create user document if it doesn't exist
      await setDoc(userRef, {
        fcmToken: token,
        fcmTokenUpdatedAt: new Date().toISOString(),
      });
      console.log("FCM token saved to new user document");
    }
  } catch (error) {
    console.error("Error saving FCM token to Firestore:", error);
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
    // Get FCM token
    const token = await getFCMToken();
    
    if (token) {
      // Save token to Firestore
      await saveFCMTokenToFirestore(userUID, token);
    } else {
      console.warn("Could not obtain FCM token");
    }
  } catch (error) {
    console.error("Error initializing FCM token:", error);
  }
};

/**
 * Handle FCM token refresh
 * Call this when token is refreshed
 * @param {string} userUID - User UID
 */
export const onTokenRefresh = async (userUID) => {
  if (!messaging) return;

  try {
    messaging.onTokenRefresh(async () => {
      const token = await getFCMToken();
      if (token && userUID) {
        await saveFCMTokenToFirestore(userUID, token);
        console.log("FCM token refreshed and saved");
      }
    });
  } catch (error) {
    console.error("Error setting up token refresh listener:", error);
  }
};

