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
    console.warn("   User UID:", userUID);
    console.warn("   Token:", token ? token.substring(0, 20) + "..." : "null");
    return;
  }

  try {
    const userRef = doc(db, "users", userUID);
    const userDoc = await getDoc(userRef);

    const tokenData = {
      fcmToken: token,
      fcmTokenUpdatedAt: new Date().toISOString(),
    };

    if (userDoc.exists()) {
      // Update existing user document - merge with existing data
      await updateDoc(userRef, tokenData);
      console.log(`✅ FCM token saved to existing user document: ${userUID}`);
      console.log(`   Token preview: ${token.substring(0, 20)}...`);
      
      // Verify it was saved
      const verifyDoc = await getDoc(userRef);
      if (verifyDoc.exists() && verifyDoc.data().fcmToken === token) {
        console.log(`✅ Verified: FCM token successfully saved in Firestore`);
      } else {
        console.warn(`⚠️ Warning: Token may not have been saved correctly`);
      }
    } else {
      // Create user document if it doesn't exist - use merge to preserve any existing data
      await setDoc(userRef, tokenData, { merge: true });
      console.log(`✅ FCM token saved to new user document: ${userUID}`);
      console.log(`   Token preview: ${token.substring(0, 20)}...`);
      
      // Verify it was saved
      const verifyDoc = await getDoc(userRef);
      if (verifyDoc.exists() && verifyDoc.data().fcmToken === token) {
        console.log(`✅ Verified: FCM token successfully saved in Firestore`);
      } else {
        console.warn(`⚠️ Warning: Token may not have been saved correctly`);
      }
    }
  } catch (error) {
    console.error("❌ Error saving FCM token to Firestore:", error);
    console.error("   Error details:", error.message);
    console.error("   Error code:", error.code);
    console.error("   Stack:", error.stack);
    throw error; // Re-throw to allow caller to handle
  }
};

/**
 * Wait for service worker to be ready
 * @returns {Promise<boolean>} true if service worker is ready
 */
const waitForServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    console.warn("⚠️ Service Worker not supported in this browser");
    return false;
  }

  try {
    // Check if service worker is already registered
    const registration = await navigator.serviceWorker.ready;
    if (registration) {
      console.log("✅ Service worker is ready");
      return true;
    }
  } catch (error) {
    console.warn("⚠️ Service worker not ready yet:", error.message);
  }

  // Wait for service worker registration
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 10;
    const checkInterval = setInterval(async () => {
      attempts++;
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration) {
          clearInterval(checkInterval);
          console.log("✅ Service worker is ready (after wait)");
          resolve(true);
        }
      } catch (error) {
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.warn("⚠️ Service worker not ready after waiting");
          resolve(false);
        }
      }
    }, 500);
  });
};

/**
 * Initialize FCM token registration for current user
 * Call this when user logs in
 * @param {string} userUID - User UID
 */
export const initializeFCMToken = async (userUID) => {
  if (!userUID) {
    console.warn("⚠️ User UID not provided for FCM token initialization");
    return;
  }

  try {
    console.log("🔄 Initializing FCM token for user:", userUID);
    console.log("   Checking prerequisites...");
    
    // Check if messaging is available
    if (!messaging) {
      console.error("❌ Firebase Messaging not initialized");
      console.error("   Make sure firebase-messaging-sw.js is in public folder");
      return;
    }

    // Wait for service worker to be ready
    console.log("   Waiting for service worker...");
    const swReady = await waitForServiceWorker();
    if (!swReady) {
      console.warn("⚠️ Service worker not ready, but continuing...");
    }

    // Check VAPID key
    if (!VAPID_KEY) {
      console.error("❌ VAPID_KEY is not set!");
      console.error("   Set REACT_APP_VAPID_KEY in .env file");
      console.error("   Get it from: Firebase Console > Project Settings > Cloud Messaging > Web Push certificates");
      console.error("   Then restart the development server");
      return;
    }
    console.log("   ✅ VAPID_KEY is set");

    console.log("   Step 1: Getting FCM token...");
    
    // Get FCM token
    const token = await getFCMToken();
    
    if (token) {
      console.log("   Step 2: Saving FCM token to Firestore...");
      // Save token to Firestore
      await saveFCMTokenToFirestore(userUID, token);
      console.log("✅ FCM token initialization complete");
      console.log("   ✅ Token obtained and saved successfully");
      return true;
    } else {
      console.warn("⚠️ Could not obtain FCM token");
      console.warn("   Possible reasons:");
      console.warn("   1. Notification permission is not granted");
      console.warn("   2. Service worker is not registered");
      console.warn("   3. Browser doesn't support FCM");
      console.warn("   💡 Solution:");
      console.warn("   - Allow notifications in browser settings");
      console.warn("   - Check service worker registration in DevTools");
      console.warn("   - Try running registerFCMToken() manually in console");
      return false;
    }
  } catch (error) {
    console.error("❌ Error initializing FCM token:", error);
    console.error("   Error details:", error.message);
    console.error("   Error code:", error.code);
    console.error("   Stack:", error.stack);
    return false;
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

/**
 * Check which users in a project are missing FCM tokens
 * Usage: window.checkProjectUsersFCMTokens(projectId)
 */
export const checkProjectUsersFCMTokens = async (projectId) => {
  const { db } = await import("../components/firebase");
  const { doc, getDoc, collection, getDocs } = await import("firebase/firestore");
  
  try {
    // Get project document
    const projectDocRef = doc(db, "projects", projectId);
    const projectDoc = await getDoc(projectDocRef);
    
    if (!projectDoc.exists()) {
      console.error("❌ Project not found:", projectId);
      return;
    }
    
    const projectData = projectDoc.data();
    const assignedUsers = projectData.users || [];
    
    console.log(`📊 Checking FCM tokens for project: ${projectData.name || projectId}`);
    console.log(`   Assigned users: ${assignedUsers.length}`);
    
    // Get all users
    const usersSnapshot = await getDocs(collection(db, "users"));
    const usersWithTokens = [];
    const usersWithoutTokens = [];
    
    assignedUsers.forEach((userUID) => {
      const userDoc = usersSnapshot.docs.find(doc => doc.id === userUID);
      if (userDoc) {
        const userData = userDoc.data();
        if (userData.fcmToken) {
          usersWithTokens.push({
            uid: userUID,
            email: userData.email || userUID,
          });
        } else {
          usersWithoutTokens.push({
            uid: userUID,
            email: userData.email || userUID,
          });
        }
      } else {
        usersWithoutTokens.push({
          uid: userUID,
          email: userUID,
        });
      }
    });
    
    console.log(`✅ Users with FCM tokens: ${usersWithTokens.length}`);
    if (usersWithTokens.length > 0) {
      usersWithTokens.forEach(user => {
        console.log(`   - ${user.email || user.uid}`);
      });
    }
    
    console.log(`❌ Users without FCM tokens: ${usersWithoutTokens.length}`);
    if (usersWithoutTokens.length > 0) {
      console.warn("   These users need to register FCM tokens:");
      usersWithoutTokens.forEach(user => {
        console.warn(`   - ${user.email || user.uid}`);
      });
      console.warn("   💡 Solution:");
      console.warn("   1. Ask these users to login");
      console.warn("   2. Allow notification permission");
      console.warn("   3. Run 'registerFCMToken()' in browser console");
    }
    
    return {
      projectId,
      projectName: projectData.name,
      totalUsers: assignedUsers.length,
      withTokens: usersWithTokens.length,
      withoutTokens: usersWithoutTokens.length,
      usersWithTokens,
      usersWithoutTokens,
    };
  } catch (error) {
    console.error("❌ Error checking project users FCM tokens:", error);
  }
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
  window.checkProjectUsersFCMTokens = async (projectId) => {
    return await checkProjectUsersFCMTokens(projectId);
  };
}

