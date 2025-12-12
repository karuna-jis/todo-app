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
    console.warn("⚠️ This browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    console.log("✅ Notification permission already granted");
    return true;
  }

  if (Notification.permission === "denied") {
    console.warn("⚠️ Notification permission denied");
    console.warn("   User needs to enable notifications in browser settings");
    return false;
  }

  // Request permission (default state)
  console.log("📢 Requesting notification permission...");
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("✅ Notification permission granted");
      return true;
    } else {
      console.warn("⚠️ Notification permission not granted:", permission);
      return false;
    }
  } catch (error) {
    console.error("❌ Error requesting notification permission:", error);
    return false;
  }
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

    // Ensure service worker is ready before getting token
    if (!navigator.serviceWorker.controller) {
      console.warn("⚠️ Service worker controller not available");
      console.warn("   Waiting for service worker...");
      const registration = await navigator.serviceWorker.ready;
      if (!registration || !registration.active) {
        console.error("❌ Service worker not active");
        return null;
      }
    }

    // Get FCM token
    console.log("   Calling getToken() with VAPID key...");
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    });

    if (token) {
      console.log("✅ FCM Token obtained:", token.substring(0, 30) + "...");
      console.log("   Token length:", token.length);
      return token;
    } else {
      console.warn("⚠️ No FCM token available");
      console.warn("   getToken() returned null");
      console.warn("   This usually means:");
      console.warn("   1. Service worker not ready");
      console.warn("   2. VAPID key mismatch");
      console.warn("   3. Notification permission not granted");
      return null;
    }
  } catch (error) {
    console.error("❌ Error getting FCM token:", error);
    console.error("   Error details:", error.message);
    console.error("   Error code:", error.code || "unknown");
    
    // Provide specific error messages
    if (error.code === "messaging/registration-token-not-available") {
      console.error("   Service worker not registered or not ready");
    } else if (error.code === "messaging/invalid-vapid-key") {
      console.error("   VAPID key is invalid");
      console.error("   Check REACT_APP_VAPID_KEY in .env file");
    } else if (error.message?.includes("vapid")) {
      console.error("   VAPID key issue");
      console.error("   Verify VAPID key from Firebase Console");
    }
    
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
 * Enhanced version with better error handling and registration check
 * @returns {Promise<boolean>} true if service worker is ready
 */
const waitForServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) {
    console.error("❌ Service Worker not supported in this browser");
    console.error("   FCM requires service worker support");
    return false;
  }

  try {
    // First, check if service worker is already active
    if (navigator.serviceWorker.controller) {
      console.log("   ✅ Service worker is already active");
      return true;
    }

    // Check if service worker is ready
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.active) {
        console.log("   ✅ Service worker is ready");
        return true;
      }
    } catch (error) {
      console.log("   Service worker not ready yet, waiting...");
    }

    // Register service worker if not registered
    if (!navigator.serviceWorker.controller) {
      try {
        console.log("   Registering service worker at /serviceWorker.js...");
        const registration = await navigator.serviceWorker.register('/serviceWorker.js', {
          scope: '/'
        });
        console.log("   Service worker registered, scope:", registration.scope);
        
        // Wait for activation
        if (registration.installing) {
          console.log("   Service worker is installing...");
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Service worker installation timeout"));
            }, 10000); // 10 second timeout
            
            registration.installing.addEventListener('statechange', function() {
              if (this.state === 'activated') {
                clearTimeout(timeout);
                console.log("   ✅ Service worker activated");
                resolve();
              } else if (this.state === 'redundant') {
                clearTimeout(timeout);
                reject(new Error("Service worker became redundant"));
              }
            });
          });
        } else if (registration.waiting) {
          console.log("   Service worker is waiting, trying to activate...");
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          // Wait a bit for activation
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (registration.active) {
          console.log("   ✅ Service worker is already active");
          return true;
        }
      } catch (error) {
        console.error("   ❌ Could not register service worker:", error.message);
        console.error("   Error details:", error);
        return false;
      }
    }

    // Wait for service worker to be ready with timeout
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 20; // Increased attempts (10 seconds total)
      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          if (navigator.serviceWorker.controller) {
            clearInterval(checkInterval);
            console.log("   ✅ Service worker is ready (after wait)");
            resolve(true);
            return;
          }
          
          const registration = await navigator.serviceWorker.ready;
          if (registration && registration.active) {
            clearInterval(checkInterval);
            console.log("   ✅ Service worker is ready (after wait)");
            resolve(true);
            return;
          }
        } catch (error) {
          // Continue checking
        }
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.error("   ❌ Service worker not ready after waiting");
          console.error("   Waited for", maxAttempts * 0.5, "seconds");
          console.error("   Possible issues:");
          console.error("   1. serviceWorker.js not accessible");
          console.error("   2. Browser blocking service worker");
          console.error("   3. Not running on HTTPS or localhost");
          console.error("   💡 Try refreshing the page");
          resolve(false);
        }
      }, 500);
    });
  } catch (error) {
    console.error("❌ Error waiting for service worker:", error);
    console.error("   Error details:", error.message);
    return false;
  }
};

/**
 * Initialize FCM token registration for current user
 * Call this when user logs in
 * @param {string} userUID - User UID
 */
export const initializeFCMToken = async (userUID) => {
  if (!userUID) {
    console.warn("⚠️ User UID not provided for FCM token initialization");
    return false;
  }

  try {
    console.log("🔄 Initializing FCM token for user:", userUID);
    console.log("   Checking prerequisites...");
    
    // Step 1: Check if messaging is available
    if (!messaging) {
      console.error("❌ Firebase Messaging not initialized");
      console.error("   Possible reasons:");
      console.error("   1. Browser doesn't support service workers");
      console.error("   2. serviceWorker.js not in public folder");
      console.error("   3. Firebase config issue");
      return false;
    }
    console.log("   ✅ Firebase Messaging initialized");

    // Step 2: Check VAPID key FIRST (before waiting for service worker)
    if (!VAPID_KEY) {
      console.error("❌ VAPID_KEY is not set!");
      console.error("   This is REQUIRED for FCM token generation");
      console.error("   Steps to fix:");
      console.error("   1. Go to Firebase Console: https://console.firebase.google.com");
      console.error("   2. Select project: to-do-app-dcdb3");
      console.error("   3. Project Settings → Cloud Messaging tab");
      console.error("   4. Web Push certificates section");
      console.error("   5. Generate new key pair (if not exists)");
      console.error("   6. Copy the 'Key pair' value");
      console.error("   7. Create .env file in todos folder:");
      console.error("      REACT_APP_VAPID_KEY=your-vapid-key-here");
      console.error("   8. Restart development server (npm start)");
      console.error("   9. For production: Set REACT_APP_VAPID_KEY in Vercel environment variables");
      return false;
    }
    console.log("   ✅ VAPID_KEY is set");

    // Step 3: Wait for service worker to be ready (CRITICAL)
    console.log("   Step 3: Waiting for service worker...");
    const swReady = await waitForServiceWorker();
    if (!swReady) {
      console.error("❌ Service worker not ready after waiting");
      console.error("   This is REQUIRED for FCM token generation");
      console.error("   Possible reasons:");
      console.error("   1. Service worker file not accessible at /serviceWorker.js");
      console.error("   2. Browser blocking service worker");
      console.error("   3. HTTPS required (or localhost)");
      console.error("   💡 Solution:");
      console.error("   - Check if serviceWorker.js exists in public folder");
      console.error("   - Check browser console for service worker errors");
      console.error("   - Try refreshing the page");
      console.error("   - Check if running on HTTPS or localhost");
      return false;
    }
    console.log("   ✅ Service worker is ready");

    // Step 4: Request notification permission
    console.log("   Step 4: Checking notification permission...");
    if (Notification.permission === "denied") {
      console.error("❌ Notification permission is DENIED");
      console.error("   User has blocked notifications");
      console.error("   💡 Solution:");
      console.error("   1. Browser address bar → 🔒 icon → Site settings");
      console.error("   2. Notifications → Allow");
      console.error("   3. Refresh page (F5)");
      return false;
    }

    // Step 5: Get FCM token
    console.log("   Step 5: Getting FCM token...");
    const token = await getFCMToken();
    
    if (!token) {
      console.error("❌ Could not obtain FCM token");
      console.error("   Check the errors above for details");
      return false;
    }
    
    console.log("   ✅ FCM Token obtained:", token.substring(0, 30) + "...");

    // Step 6: Save token to Firestore
    console.log("   Step 6: Saving FCM token to Firestore...");
    try {
      await saveFCMTokenToFirestore(userUID, token);
      console.log("✅ FCM token initialization complete");
      console.log("   ✅ Token obtained and saved successfully");
      console.log("   ✅ User will now receive push notifications");
      return true;
    } catch (saveError) {
      console.error("❌ Error saving token to Firestore:", saveError);
      console.error("   Token was obtained but not saved");
      console.error("   Check Firestore rules and permissions");
      return false;
    }
  } catch (error) {
    console.error("❌ Error initializing FCM token:", error);
    console.error("   Error details:", error.message);
    console.error("   Error code:", error.code);
    if (error.stack) {
      console.error("   Stack:", error.stack);
    }
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
    console.log("   User Email:", user.email);
    console.log("   VAPID_KEY set:", !!VAPID_KEY);
    if (VAPID_KEY) {
      console.log("   VAPID_KEY preview:", VAPID_KEY.substring(0, 20) + "...");
    } else {
      console.error("   ❌ VAPID_KEY is NOT set!");
      console.error("   Create .env file in todos folder with:");
      console.error("   REACT_APP_VAPID_KEY=your-vapid-key");
    }
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

