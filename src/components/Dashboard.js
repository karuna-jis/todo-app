// src/components/Dashboard.js
import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import Swal from "sweetalert2";
import { auth, db, secondaryAuth } from "./firebase";
import "../App.css";
import { signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "firebase/auth";

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { useNavigate, useLocation } from "react-router-dom";
import { onMessage, messaging } from "../components/firebase";
import { initializeFCMToken } from "../utils/fcmToken";
import { useNotification } from "../contexts/NotificationContext";
import { incrementBadge, clearAppBadge, getBadgeCount, setAppBadge, isBadgeSupported } from "../utils/badge";

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { showNotification } = useNotification();
  
  // Extract current projectId from location if user is on ViewTaskPage
  const currentProjectId = location.pathname.startsWith('/view/') 
    ? location.pathname.split('/')[2] 
    : null;

  // AUTH STATES
  const [userEmail, setUserEmail] = useState("");
  const [userUID, setUserUID] = useState("");
  const [userRole, setUserRole] = useState("");
  const [authChecked, setAuthChecked] = useState(false); // Track if auth check is complete
  const firstLetter = userEmail ? userEmail.charAt(0).toUpperCase() : "";

  // PROJECT STATES
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [isMobile, setIsMobile] = useState(false); // Check if mobile/tablet screen (max-width: 992px)

  // ASSIGN MODAL
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [assignedUsers, setAssignedUsers] = useState([]);

  // ADD USER MODAL
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newUserInput, setNewUserInput] = useState(""); // For WhatsApp-style input

  // UI page control
  const [activePage, setActivePage] = useState("dashboard");

  // NOTIFICATIONS STATE
  const [notifications, setNotifications] = useState([]);
  const [projectNotificationCounts, setProjectNotificationCounts] = useState({});

  // PWA INSTALL PROMPT STATE
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  // ADMIN TASKS STATE - Real-time task list for admin
  const [adminTasks, setAdminTasks] = useState([]);

  // Check if mobile/tablet screen (max-width: 992px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 992);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // PWA Install Prompt Handler
  useEffect(() => {
    // Check if already installed first
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isInStandaloneMode = window.navigator.standalone || isStandalone;
    
    if (isInStandaloneMode) {
      console.log('✅ App is already installed (standalone mode)');
      setShowInstallButton(false);
      return;
    }

    // Check if deferredPrompt already exists (from index.html)
    if (window.deferredPrompt) {
      console.log('📱 Found existing deferredPrompt from index.html');
      setDeferredPrompt(window.deferredPrompt);
      setShowInstallButton(true);
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      console.log('📱 beforeinstallprompt event received');
      e.preventDefault();
      setDeferredPrompt(e);
      window.deferredPrompt = e; // Store globally
      setShowInstallButton(true);
      console.log('✅ Install button should now be visible');
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      console.log('✅ PWA installed successfully');
      setDeferredPrompt(null);
      window.deferredPrompt = null;
      setShowInstallButton(false);
    };

    // Listen for custom events from index.html
    const handlePWAInstallable = (e) => {
      console.log('📱 pwa-installable custom event received');
      if (e.detail) {
        handleBeforeInstallPrompt(e.detail);
      }
    };

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('pwa-installable', handlePWAInstallable);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-installed', handleAppInstalled);

    // Periodic check for deferredPrompt (in case event was missed)
    const checkInterval = setInterval(() => {
      if (window.deferredPrompt && !deferredPrompt) {
        console.log('📱 Found deferredPrompt on periodic check');
        setDeferredPrompt(window.deferredPrompt);
        setShowInstallButton(true);
      }
    }, 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('pwa-installable', handlePWAInstallable);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-installed', handleAppInstalled);
      clearInterval(checkInterval);
    };
  }, [deferredPrompt]);

  // Handle install button click
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Try to get from window object (fallback)
      const prompt = window.deferredPrompt;
      if (!prompt) {
        console.warn('⚠️ Install prompt not available');
        return;
      }
      
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('✅ User accepted install prompt');
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'App installed successfully!',
          timer: 3000
        });
      } else {
        console.log('❌ User dismissed install prompt');
      }
      
      window.deferredPrompt = null;
      setShowInstallButton(false);
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('✅ User accepted install prompt');
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'App installed successfully!',
        timer: 3000
      });
    } else {
      console.log('❌ User dismissed install prompt');
    }

    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  // AUTH LISTENER
  useEffect(() => {
    let isMounted = true;
    let hasAuthenticated = false;
    let authTime = null; // Track when user authenticated
    let navigationTimeout = null;
    let authStateRestored = false; // Track if auth state has been restored from persistence
    let intentionalLogout = false; // Track if logout was intentional (via logout button)
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Check if logout was intentional (set by handleLogout)
      if (window.__intentionalLogout) {
        intentionalLogout = true;
        window.__intentionalLogout = false; // Reset
      }
      
      // First check: Wait for auth state to be restored from persistence
      // This prevents false logouts when auth state is being restored
      if (!authStateRestored) {
        authStateRestored = true;
        // Give Firebase time to restore auth state from localStorage
        await new Promise(resolve => setTimeout(resolve, 500));
        // Re-check user after waiting
        const currentUser = auth.currentUser;
        if (!currentUser && !user) {
          // Auth state restored and no user found - this is a real logout
          if (isMounted) {
            setAuthChecked(true);
            // Only navigate if we're on a protected route
            if (location.pathname !== "/") {
              console.log("🔄 No authenticated user found, navigating to login...");
              navigate("/");
            }
          }
          return;
        }
        // If user exists after restoration, continue with normal flow
        if (currentUser && !user) {
          // Auth was restored, user exists
          user = currentUser;
        }
      }
      
      if (!user) {
        // Clear any pending navigation
        if (navigationTimeout) {
          clearTimeout(navigationTimeout);
          navigationTimeout = null;
        }
        
        // Mark auth check as complete
        if (isMounted) {
          setAuthChecked(true);
        }
        
        // Only navigate to login if logout was intentional (via logout button)
        // Don't navigate on back button press or accidental navigation
        if (intentionalLogout && isMounted) {
          console.log("🔄 Intentional logout, navigating to login...");
          navigate("/");
          intentionalLogout = false; // Reset flag
        } else if (authStateRestored && location.pathname !== "/" && !hasAuthenticated) {
          // Only navigate if auth state restored, no user found, and user was never authenticated
          // This handles initial load when user is not logged in
          console.log("🔄 No authenticated user on initial load, navigating to login...");
          navigate("/");
        } else {
          // User pressed back button or navigation happened - don't logout
          // Keep user on current page, auth state will be restored
          console.log("⏸️ Preventing navigation - back button or accidental navigation detected");
        }
        return;
      }

      // Mark that we've authenticated at least once
      hasAuthenticated = true;
      authTime = Date.now(); // Record authentication time
      
      if (!isMounted) return;

      // Wrap all async operations in try-catch to prevent errors from causing navigation issues
      try {
        setUserEmail(user.email || "");
        setUserUID(user.uid || "");
        setAuthChecked(true); // Mark auth check as complete
        console.log("👤 User authenticated:", {
          email: user.email,
          uid: user.uid
        });

        // Ensure user document exists in Firestore before initializing FCM
        try {
          const ref = doc(db, "users", user.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            setUserRole(snap.data().role || "user");
            console.log("✅ User document exists in Firestore");
          } else {
            // Create user document if it doesn't exist
            console.log("📝 User document not found, creating...");
            setUserRole("user");
            await setDoc(ref, {
              email: user.email || "",
              username: user.email?.split("@")[0] || "User",
              role: "user",
              createdAt: serverTimestamp(),
            }, { merge: true });
            console.log("✅ User document created in Firestore");
          }
        } catch (err) {
        console.error("❌ Error fetching/creating user doc:", err);
        setUserRole("user");
        // Try to create user document even if fetch failed
        try {
          const ref = doc(db, "users", user.uid);
          await setDoc(ref, {
            email: user.email || "",
            username: user.email?.split("@")[0] || "User",
            role: "user",
            createdAt: serverTimestamp(),
          }, { merge: true });
          console.log("✅ User document created (fallback)");
        } catch (createErr) {
          console.error("❌ Failed to create user document:", createErr);
        }
      }

      // Initialize FCM token for push notifications
      // Enhanced initialization with multiple retries for new users
      // IMPORTANT: This runs for ALL users (admin and regular users)
      if (user.uid) {
        console.log("🔄 User logged in, initializing FCM token...");
        console.log("   User UID:", user.uid);
        console.log("   User Email:", user.email);
        console.log("   User Role:", userRole || "user (will be set)");
        
        // Wait for page to be fully loaded and service worker to register
        const initializeFCM = async () => {
          // Wait for DOM to be ready
          if (document.readyState !== 'complete') {
            await new Promise(resolve => {
              if (document.readyState === 'complete') {
                resolve();
              } else {
                window.addEventListener('load', resolve);
              }
            });
          }
          
          // Additional delay to ensure service worker registration from index.html completes
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Check notification permission first and prompt if needed
          if (Notification.permission === "default") {
            console.log("📢 Notification permission not set, will request...");
            // Permission will be requested in getFCMToken()
          } else if (Notification.permission === "denied") {
            console.warn("⚠️ Notification permission is DENIED");
            // Show prominent message to user
            Swal.fire({
              icon: "warning",
              title: "Notifications Blocked",
              html: `
                <p>You need to enable notifications to receive push alerts.</p>
                <p><strong>Steps to enable:</strong></p>
                <ol style="text-align: left; margin: 20px;">
                  <li>Click the <strong>🔒 lock icon</strong> in your browser's address bar</li>
                  <li>Go to <strong>Site settings</strong></li>
                  <li>Find <strong>Notifications</strong> and set it to <strong>Allow</strong></li>
                  <li>Refresh this page (F5)</li>
                </ol>
                <p>Or click the button below to try again:</p>
              `,
              showCancelButton: true,
              confirmButtonText: "Try Again",
              cancelButtonText: "Later",
              confirmButtonColor: "#2a8c7b"
            }).then((result) => {
              if (result.isConfirmed) {
                // Try to request permission again (might work in some browsers)
                Notification.requestPermission().then(permission => {
                  if (permission === "granted") {
                    console.log("✅ Permission granted, initializing FCM token...");
                    initializeFCMToken(user.uid);
                  } else {
                    console.warn("⚠️ Permission still not granted");
                  }
                });
              }
            });
            return; // Don't proceed if permission is denied
          }
          
          // Initialize FCM token with retry mechanism
          const initializeWithRetry = async (retries = 5, delay = 3000) => {
            for (let attempt = 1; attempt <= retries; attempt++) {
              try {
                console.log(`\n🔄 FCM Token Initialization - Attempt ${attempt}/${retries}`);
                console.log("   Waiting before attempt...");
                
                // Progressive delay between attempts
                if (attempt > 1) {
                  await new Promise(resolve => setTimeout(resolve, delay * (attempt - 1)));
                }
                
                const success = await initializeFCMToken(user.uid);
                if (success) {
                  console.log("✅ FCM token initialized successfully!");
                  // No toast - silent initialization
                  return true;
                } else {
                  console.warn(`⚠️ Attempt ${attempt} failed, will retry...`);
                  if (attempt < retries) {
                    console.log(`   Next retry in ${delay * attempt / 1000} seconds...`);
                  }
                }
              } catch (error) {
                console.error(`❌ Attempt ${attempt} error:`, error.message);
                if (attempt === retries) {
                  console.error("❌ FCM token initialization failed after all retries");
                  console.warn("💡 Troubleshooting:");
                  console.warn("   1. Check browser console for detailed errors");
                  console.warn("   2. Run: window.checkFCMStatus() to diagnose");
                  console.warn("   3. Run: window.registerFCMToken() to manually register");
                  
                  // Show user-friendly message with action button
                  Swal.fire({
                    icon: "info",
                    title: "Enable Notifications",
                    html: `
                      <p>To receive push notifications, please:</p>
                      <ol style="text-align: left; margin: 20px;">
                        <li>Allow notification permission when prompted</li>
                        <li>Or click the lock icon → Site settings → Notifications → Allow</li>
                        <li>Then click the button below to register</li>
                      </ol>
                    `,
                    showCancelButton: true,
                    confirmButtonText: "Register Now",
                    cancelButtonText: "Later",
                    confirmButtonColor: "#2a8c7b"
                  }).then((result) => {
                    if (result.isConfirmed) {
                      // Import and call manual registration
                      import("../utils/fcmToken").then(({ registerFCMTokenManually }) => {
                        registerFCMTokenManually();
                      });
                    }
                  });
                }
              }
            }
            return false;
          };
          
          await initializeWithRetry();
        };
        
        // Start initialization (don't await - run in background)
        initializeFCM().catch((err) => {
          console.error("❌ FCM initialization error:", err);
          // Don't navigate on FCM errors - just log them
        });
      }
      } catch (error) {
        // Catch any unhandled errors in the auth callback
        console.error("❌ Error in auth callback:", error);
        // Don't navigate on errors - user should stay on dashboard
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    });

    // Handle back button - prevent login screen, allow app to close
    const handlePopState = (event) => {
      const currentUser = auth.currentUser;
      
      if (currentUser) {
        // User is authenticated
        if (location.pathname === "/" || location.pathname === "/login") {
          // Back button tried to go to login - prevent and redirect to dashboard
          console.log("🚫 Back button prevented - user is authenticated, redirecting to dashboard");
          event.preventDefault();
          navigate("/dashboard", { replace: true });
        }
        // If on dashboard, allow back button to work normally (may close app)
        // Don't prevent default - let browser handle it
      }
    };

    // Also handle browser back/forward buttons
    window.addEventListener("popstate", handlePopState);

    return () => {
      isMounted = false;
      if (navigationTimeout) {
        clearTimeout(navigationTimeout);
      }
      window.removeEventListener("popstate", handlePopState);
      unsubscribe();
    };
  }, [navigate, location.pathname]);

  // Handle foreground FCM messages (when app is open)
  useEffect(() => {
    if (!messaging || !onMessage) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      const addedBy = payload.data?.addedByName || payload.data?.addedBy || payload.data?.createdBy || "Unknown";
      const taskName = payload.data?.taskName || "New Task";

      showNotification({
        title: "New Task Added",
        body: `${addedBy} added new task: ${taskName}`,
        projectId: payload.data?.projectId || "",
        projectName: payload.data?.projectName || "",
        taskId: payload.data?.taskId || "",
        taskName: taskName,
        addedBy: payload.data?.addedBy || payload.data?.createdBy || "",
        addedByName: addedBy,
        link: payload.data?.link || "",
        timestamp: payload.data?.timestamp || Date.now(),
      });

      // Note: Badge increment is handled by Firestore listener (onSnapshot)
      // This prevents duplicate badge increments when both FCM and Firestore detect the same task
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [showNotification]);

  // Listen for service worker messages (background notifications)
  useEffect(() => {
    if (!navigator.serviceWorker) return;

    const handleMessage = (event) => {
      console.log("[Dashboard] 📨 Message from service worker:", event.data);

      if (event.data?.type === "INC_BADGE") {
        // Increment badge when background notification arrives
        incrementBadge().catch((error) => {
          console.error("[Dashboard] Error incrementing badge from SW message:", error);
        });

        // Also show notification popup if app is open
        if (event.data.payload) {
          const payload = event.data.payload;
          const addedBy = payload.addedByName || payload.addedBy || "Unknown";
          const taskName = payload.taskName || "New Task";

          showNotification({
            title: "New Task Added",
            body: `${addedBy} added new task: ${taskName}`,
            projectId: payload.projectId || "",
            projectName: payload.projectName || "",
            taskId: payload.taskId || "",
            taskName: taskName,
            addedBy: payload.addedBy || "",
            addedByName: addedBy,
            link: payload.link || "",
            timestamp: payload.timestamp || Date.now(),
          });
        }
      } else if (event.data?.type === "CLEAR_BADGE") {
        // Clear badge when notification is clicked
        clearAppBadge().catch((error) => {
          console.error("[Dashboard] Error clearing badge from SW message:", error);
        });
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [showNotification]);

  // Initialize badge on app launch and clear on focus/visibility
  useEffect(() => {
    // Initialize badge on mount
    initializeBadge().catch((error) => {
      console.error("[Dashboard] Error initializing badge:", error);
    });

    // Clear badge when app gains focus (user opens the app)
    const handleFocus = () => {
      console.log("[Dashboard] 📱 App focused - clearing badge");
      clearAppBadge().catch((error) => {
        console.error("[Dashboard] Error clearing badge on focus:", error);
      });
    };

    // Clear badge when visibility changes to visible (user opens the app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[Dashboard] 📱 App became visible - clearing badge");
        clearAppBadge().catch((error) => {
          console.error("[Dashboard] Error clearing badge on visibility change:", error);
        });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);


  // LOAD PROJECTS (realtime)
  useEffect(() => {
    if (!userUID) {
      console.log("⚠️ userUID not set, waiting...");
      return;
    }

    console.log("📋 Loading projects for user:", userUID);
    console.log("   User Email:", userEmail);
    
    // Query: Get all projects where users array contains current user's UID
    const q = query(collection(db, "projects"), where("users", "array-contains", userUID));
    
    const unsub = onSnapshot(
      q, 
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        console.log(`\n✅ Found ${list.length} projects for user ${userUID}`);
        
        // Detailed logging
        if (list.length === 0) {
          console.warn("⚠️ No projects found for this user");
          console.warn("   User UID:", userUID);
          console.warn("   User Email:", userEmail);
          console.warn("   Make sure user is assigned to at least one project");
          console.warn("   Check Firestore: projects collection → users array should contain:", userUID);
          console.warn("   💡 Run: window.checkProjectAssignment() to debug");
        } else {
          list.forEach((p, index) => {
            console.log(`\n   Project ${index + 1}: ${p.name} (ID: ${p.id})`);
            console.log(`     Assigned users count: ${(p.users || []).length}`);
            console.log(`     Users array:`, p.users);
            // Check if current user is in the array
            const isUserInArray = (p.users || []).includes(userUID);
            console.log(`     Current user (${userUID}) in array:`, isUserInArray ? "✅ YES" : "❌ NO");
            if (!isUserInArray) {
              console.error(`     ❌ ERROR: User ${userUID} is NOT in project's users array!`);
              console.error(`     This project should not appear for this user.`);
            }
          });
        }
        
        setProjects(list);
      },
      (error) => {
        console.error("❌ Error loading projects:", error);
        console.error("   Error code:", error.code);
        console.error("   Error message:", error.message);
        console.error("   User UID:", userUID);
        console.error("   This might be a Firestore rules issue");
        console.error("   Check Firebase Console → Firestore → Rules");
        console.error("   Rule should allow: read if request.auth.uid in resource.data.users");
      }
    );

    return () => unsub();
  }, [userUID, userEmail]);

  // REALTIME TASK LISTENER - Show popup when new task added
  useEffect(() => {
    if (!userUID || projects.length === 0) return;

    const unsubscribers = [];
    const lastTaskIds = {};

    projects.forEach((project) => {
      const tasksRef = collection(db, "projects", project.id, "tasks");
      const q = query(tasksRef, orderBy("createdAt", "desc"));

      const unsub = onSnapshot(
        q,
        async (snapshot) => {
          for (const docSnap of snapshot.docs) {
            const taskData = docSnap.data();
            const taskId = docSnap.id;
            const projectId = project.id;
            const key = `${projectId}-${taskId}`;

            if (!lastTaskIds[key]) {
              lastTaskIds[key] = true;
              const taskCreatedBy = taskData.createdBy || "";
              if (taskCreatedBy === userEmail) continue;

              // Don't show popup if user is currently viewing this project's ViewTaskPage
              if (currentProjectId === projectId) {
                console.log(`⏸️ User is viewing project ${projectId}, skipping popup notification`);
                continue;
              }

              // Check if user has already seen this notification in Firestore
              try {
                const notificationsRef = collection(db, "notifications");
                const notificationQuery = query(
                  notificationsRef,
                  where("projectId", "==", projectId),
                  where("taskId", "==", taskId)
                );
                const notificationSnapshot = await getDocs(notificationQuery);
                
                let shouldShowPopup = true;
                notificationSnapshot.docs.forEach((notifDoc) => {
                  const notifData = notifDoc.data();
                  const seenBy = notifData.seenBy || [];
                  if (seenBy.includes(userUID)) {
                    shouldShowPopup = false;
                    console.log(`⏸️ User has already seen notification for task ${taskId}, skipping popup`);
                  }
                });

                if (!shouldShowPopup) continue;
              } catch (error) {
                console.error("Error checking notification seen status:", error);
                // Continue to show popup if check fails
              }

              const addedBy = taskData.createdBy || taskData.createdByName || "Unknown";
              const taskName = taskData.text || taskData.taskName || "New Task";

              showNotification({
                title: "New Task Added",
                body: `${addedBy} added new task: ${taskName}`,
                projectId: projectId,
                projectName: project.name,
                taskId: taskId,
                taskName: taskName,
                addedBy: addedBy,
                addedByName: taskData.createdByName || addedBy,
                link: `/view/${projectId}/${encodeURIComponent(project.name)}`,
                timestamp: taskData.createdAt?.toMillis?.() || Date.now(),
              });

              // Increment badge count when new task is detected via Firestore listener
              // This ensures badge shows immediately when task is added
              incrementBadge().catch((error) => {
                console.error("[Dashboard] Error incrementing badge on new task:", error);
              });
            }
          }
        },
        (error) => {
          console.error(`Error listening to tasks for project ${project.id}:`, error);
        }
      );

      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [userUID, userEmail, projects, showNotification, currentProjectId]);

  // LOAD ALL USERS (for assign & list)
  useEffect(() => {
    fetchAllUsers();
  }, []);

  // When switching to users page, refresh list
  useEffect(() => {
    if (activePage === "users") fetchAllUsers();
  }, [activePage]);

  // LOAD NOTIFICATIONS PER PROJECT (realtime) - For badge counts
  // Query: projectId == project.id && seenBy array does NOT include current user UID
  // Using where("projectId", "==", project.id) and client-side filter for seenBy
  useEffect(() => {
    if (!userUID || projects.length === 0) {
      setProjectNotificationCounts({});
      return;
    }

    const notificationsRef = collection(db, "notifications");
    const unsubscribers = [];

    // Create a listener for each project
    projects.forEach((project) => {
      // Query: where("projectId", "==", project.id)
      // Filter client-side: where seenBy does NOT include current user UID
      const q = query(
        notificationsRef,
        where("projectId", "==", project.id)
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          // Filter notifications where seenBy does NOT include current user UID
          // Recalculate badges only from unseen notifications
          const unseenNotifications = snap.docs.filter((docSnap) => {
            const data = docSnap.data();
            const seenBy = data.seenBy || [];
            return !seenBy.includes(userUID); // Count only unseen notifications
          });
          
          const count = unseenNotifications.length;
          console.log(`📊 Project ${project.name}: ${count} unseen notifications`);
          setProjectNotificationCounts((prev) => ({
            ...prev,
            [project.id]: count,
          }));
        },
        (err) => {
          console.error(`Notification snapshot error for project ${project.id}:`, err);
        }
      );

      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [userUID, projects]);

  // LOAD ALL TASKS FOR ADMIN (realtime) - Show all tasks from all projects
  useEffect(() => {
    if (userRole !== "admin" || projects.length === 0) {
      setAdminTasks([]);
      return;
    }

    const unsubscribers = [];
    const allTasks = [];

    // Listen to tasks from all projects
    projects.forEach((project) => {
      const tasksRef = collection(db, "projects", project.id, "tasks");
      const q = query(tasksRef, orderBy("createdAt", "desc"));

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          // Update tasks for this specific project
          const projectTasks = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            projectId: project.id,
            projectName: project.name,
            ...docSnap.data(),
          }));

          // Merge with tasks from other projects
          setAdminTasks((prevTasks) => {
            // Remove old tasks from this project
            const otherProjectTasks = prevTasks.filter(
              (t) => t.projectId !== project.id
            );
            // Add new tasks from this project
            const merged = [...otherProjectTasks, ...projectTasks];
            // Sort by createdAt (newest first)
            return merged.sort((a, b) => {
              const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
              const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
              return bTime - aTime;
            });
          });
        },
        (error) => {
          console.error(`Error listening to tasks for project ${project.id}:`, error);
        }
      );

      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [userRole, projects]);

  // FUNCTIONS

  const addProject = async () => {
    if (!projectName.trim()) {
      return Swal.fire({ toast: true, position: "top-end", icon: "warning", title: "Enter project name" });
    }
    if (userRole !== "admin") {
      return Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Only admin can create projects" });
    }

    try {
      await addDoc(collection(db, "projects"), {
        name: projectName,
        createdBy: userUID,
        users: [userUID],
        createdAt: serverTimestamp(),
      });
      setProjectName("");
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Project created" });
    } catch (err) {
      console.error(err);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Failed to create project" });
    }
  };

  const addNewUser = async () => {
    if (!newUsername.trim() || !newEmail.trim()) {
      return Swal.fire({ toast: true, position: "top-end", icon: "warning", title: "Please fill all fields" });
    }
    if (userRole !== "admin") {
      return Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Only admin can add users" });
    }

    try {
      const defaultPassword = "12345678";
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail, defaultPassword);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, "users", uid), {
        username: newUsername,
        email: newEmail,
        role: newRole,
        uid,
        createdAt: serverTimestamp(),
      });

      await signOut(secondaryAuth);

      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "User created!" });

      setNewUsername("");
      setNewEmail("");
      setNewRole("user");
      setShowUserModal(false);
      fetchAllUsers();
    } catch (err) {
      console.error(err);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: err.message || "Failed to create user" });
    }
  };

  const updateProject = async (id) => {
    if (!editName.trim()) return;
    try {
      await updateDoc(doc(db, "projects", id), { name: editName });
      setEditId(null);
      setEditName("");
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Updated" });
    } catch (err) {
      console.error(err);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Update failed" });
    }
  };

  const deleteProject = async (id) => {
    const confirm = await Swal.fire({ title: "Delete Project?", icon: "warning", showCancelButton: true, confirmButtonText: "Delete" });
    if (!confirm.isConfirmed) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Deleted" });
    } catch (err) {
      console.error(err);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Delete failed" });
    }
  };

  const openAssignModal = (project) => {
    if (userRole !== "admin") {
      return Swal.fire({ toast: true, position: "top-end", icon: "warning", title: "Only admin can assign users" });
    }
    setSelectedProject(project);
    setAssignedUsers(project.users || []);
    setShowAssignModal(true);
  };

  const toggleUser = (uid) => {
    setAssignedUsers((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  };

  const saveAssignedUsers = async () => {
    if (!selectedProject) return;
    
    try {
      console.log("💾 Saving assigned users to project:", selectedProject.id);
      console.log("   Project name:", selectedProject.name);
      console.log("   Assigned users:", assignedUsers);
      console.log("   Assigned user count:", assignedUsers.length);
      
      // Verify all user UIDs exist
      const validUsers = [];
      for (const uid of assignedUsers) {
        const userExists = allUsers.find(u => u.id === uid);
        if (userExists) {
          validUsers.push(uid);
          console.log(`   ✅ User ${uid} (${userExists.email}) is valid`);
        } else {
          console.warn(`   ⚠️ User ${uid} not found in allUsers list`);
        }
      }
      
      if (validUsers.length !== assignedUsers.length) {
        console.warn("⚠️ Some users were not found, using only valid users");
      }
      
      const finalUsers = validUsers.length > 0 ? validUsers : assignedUsers;
      
      if (finalUsers.length === 0) {
        console.error("❌ No valid users to assign!");
        Swal.fire({ 
          toast: true, 
          position: "top-end", 
          icon: "error", 
          title: "No valid users to assign",
          text: "Please select at least one valid user"
        });
        return;
      }
      
      console.log("\n📤 Updating project in Firestore...");
      console.log("   Final users array:", finalUsers);
      console.log("   Final users count:", finalUsers.length);
      
      // Update project with assigned users
      const projectRef = doc(db, "projects", selectedProject.id);
      await updateDoc(projectRef, { 
        users: finalUsers 
      });
      
      console.log("✅ Firestore update completed");
      
      // Verify the update was successful
      const updatedDoc = await getDoc(projectRef);
      if (updatedDoc.exists()) {
        const updatedData = updatedDoc.data();
        console.log("\n✅ Project updated successfully!");
        console.log("   Updated users array:", updatedData.users);
        console.log("   Total users in project:", updatedData.users?.length || 0);
        
        // Log each assigned user's UID for debugging
        if (updatedData.users && updatedData.users.length > 0) {
          console.log("\n   Assigned Users List:");
          updatedData.users.forEach((uid, index) => {
            const user = allUsers.find(u => u.id === uid);
            console.log(`   ${index + 1}. ${uid} (${user?.email || user?.username || 'Unknown'})`);
          });
        } else {
          console.warn("   ⚠️ WARNING: Users array is empty!");
        }
        
        // Verify current user can see this project
        const currentUserInProject = updatedData.users?.includes(userUID);
        console.log(`\n   Current logged-in user (${userUID}) in project:`, currentUserInProject ? "✅ YES" : "❌ NO");
        if (!currentUserInProject && userRole === "admin") {
          console.log("   ℹ️ Note: Admin can see all projects, but this user won't see it if not in array");
        }
      } else {
        console.error("❌ ERROR: Project document not found after update!");
      }
      
      setShowAssignModal(false);
      Swal.fire({ 
        toast: true, 
        position: "top-end", 
        icon: "success", 
        title: `Users Assigned (${finalUsers.length} users)`,
        text: "Assigned users will see the project in their dashboard"
      });
    } catch (err) {
      console.error("❌ Error saving assigned users:", err);
      console.error("   Error code:", err.code);
      console.error("   Error message:", err.message);
      Swal.fire({ 
        toast: true, 
        position: "top-end", 
        icon: "error", 
        title: "Failed to assign users",
        text: err.message 
      });
    }
  };

  const handleLogout = async () => {
    // Mark logout as intentional before signing out
    // This flag will be checked in auth listener
    window.__intentionalLogout = true;
    await signOut(auth);
    navigate("/");
  };

  const fetchAllUsers = async () => {
    try {
      const usersRef = collection(db, "users");
      const snapshot = await getDocs(usersRef);
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllUsers(list);
    } catch (err) {
      console.error("fetchAllUsers error:", err);
    }
  };

  const deleteUser = async (id) => {
    const conf = await Swal.fire({
    title: "Are you sure?",
    text: "You won't be able to revert this!",
    icon: "warning",
     toast: true, position: "top-end",  
    showCancelButton: true,
    confirmButtonText: "Yes, delete it!",
    cancelButtonText: "Cancel",
  });
    if (!conf) return;
    try {
      await deleteDoc(doc(db, "users", id));
      fetchAllUsers();
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "User deleted" });
    } catch (err) {
      console.error(err);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Delete failed" });
    }
  };

  const handleView = (id, name) => {
    navigate(`/view/${id}/${name}`);
  };

  // Debug function - Check project assignment
  // Can be called from browser console: window.checkProjectAssignment()
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.checkProjectAssignment = async () => {
        console.log("🔍 Checking Project Assignment Status...");
        console.log("   Current User UID:", userUID);
        console.log("   Current User Email:", userEmail);
        console.log("   Projects in state:", projects.length);
        
        if (!userUID) {
          console.error("❌ User not logged in");
          return;
        }

        try {
          // Get all projects from Firestore
          const allProjectsSnapshot = await getDocs(collection(db, "projects"));
          console.log(`\n📊 All Projects in Firestore: ${allProjectsSnapshot.docs.length}`);
          
          allProjectsSnapshot.docs.forEach((docSnap) => {
            const projectData = docSnap.data();
            const projectUsers = projectData.users || [];
            const isUserAssigned = projectUsers.includes(userUID);
            
            console.log(`\n   Project: ${projectData.name} (ID: ${docSnap.id})`);
            console.log(`     Total assigned users: ${projectUsers.length}`);
            console.log(`     Users array:`, projectUsers);
            console.log(`     Current user (${userUID}) assigned:`, isUserAssigned ? "✅ YES" : "❌ NO");
            
            if (isUserAssigned) {
              const isInState = projects.find(p => p.id === docSnap.id);
              console.log(`     In dashboard state:`, isInState ? "✅ YES" : "❌ NO");
            }
          });
          
          // Check projects in state
          console.log(`\n📋 Projects in Dashboard State: ${projects.length}`);
          projects.forEach((p) => {
            console.log(`   - ${p.name} (ID: ${p.id})`);
            console.log(`     Users: ${(p.users || []).length}`);
          });
          
        } catch (error) {
          console.error("❌ Error checking projects:", error);
        }
      };
    }
  }, [userUID, userEmail, projects]);

  // RENDER
  // Show loading screen until auth check is complete
  if (!authChecked) {
    return (
      <div className="container-fluid p-0 d-flex justify-content-center align-items-center" style={{ minHeight: "100vh" }}>
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      {/* HEADER */}
      <div className="w-100 text-center py-2 py-md-3 position-relative" style={{ backgroundColor: "#2a8c7b" }}>
        <h1 className="text-white fw-bold dashboard-title">Dashboard</h1>
        
        {/* PWA Install Button */}
        {showInstallButton && (
          <button
            onClick={handleInstallClick}
            className="btn btn-light btn-sm position-absolute"
            style={{
              top: "50%",
              right: "15px",
              transform: "translateY(-50%)",
              fontSize: "12px",
              padding: "8px 16px",
              borderRadius: "20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              zIndex: 1000,
              fontWeight: "600",
              whiteSpace: "nowrap"
            }}
            title="Install App on your device"
          >
            📱 Install App
          </button>
        )}
        
        {/* Debug: Show install status (remove in production) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="position-absolute" style={{ top: "5px", left: "10px", fontSize: "10px", color: "#fff", zIndex: 1001 }}>
            Install: {showInstallButton ? "✅" : "❌"} | 
            Standalone: {window.matchMedia('(display-mode: standalone)').matches ? "✅" : "❌"} |
            Prompt: {window.deferredPrompt ? "✅" : "❌"}
          </div>
        )}
      </div>

      <div className="row m-0">
        {/* SIDEBAR */}
        <div className="col-12 col-md-3 p-3 p-md-4 sidebar-responsive" style={{ backgroundColor: "#e8e8e8", minHeight: "auto" }}>
          <div
            className="mb-3 mb-md-4 user-avatar"
            style={{
              width: "90px",
              height: "90px",
              backgroundColor: "#777",
              borderRadius: "50%",
              margin: "auto",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontSize: "40px",
              fontWeight: "bold",
              color: "white",
            }}
          >
            {firstLetter}
          </div>

          <button className="btn w-100 mb-2 mb-md-3 text-white fw-bold sidebar-btn" style={{ backgroundColor: "#2a8c7b", fontSize: "14px", padding: "8px" }}>
            {userEmail}
          </button>

         

          {userRole === "admin" && (
            <div style={{ marginTop: 12 }}>
              <button
               className="btn w-100 mb-2 mb-md-3 text-white fw-bold sidebar-btn"
                onClick={() => setActivePage("users")}
                style={{ cursor: "pointer", padding: "10px", backgroundColor: "#2a8c7b", fontSize: "14px"}}
              >
                👥 Users
              </button>

              <button
               className="btn w-100 mb-2 mb-md-3 text-white fw-bold sidebar-btn"
                onClick={() => setActivePage("dashboard")}
                style={{ cursor: "pointer", padding: "10px",backgroundColor: "#2a8c7b", fontSize: "14px"  }}
              >
                📁 Projects
              </button>
               
            </div>
            
          )}
          <button className="btn w-100 fw-bold text-white sidebar-btn" style={{ backgroundColor: "black", fontSize: "14px", padding: "10px" }} onClick={handleLogout}>
            Logout
          </button>
        </div>

        {/* MAIN SCREEN */}
        <div className="col-12 col-md-9 p-3 p-md-4 main-content-responsive" style={{ minHeight: "100vh" }}>
          {/* Conditional pages */}
          {activePage === "dashboard" && (
            <>
              {/* CREATE PROJECT */}
              {userRole === "admin" && (
                <>
                  {/* Desktop View */}
                  {!isMobile && (
                    <div className="mb-3 mb-md-4 p-2 p-md-3 shadow-sm bg-white create-project-box">
                      <h5 className="mb-2 mb-md-3 create-project-title">Create New Project</h5>

                      <div className="d-flex align-items-center mb-2 mb-md-3 create-project-input-group">
                        <input
                          type="text"
                          className="form-control project-input-responsive"
                          placeholder="Project Name"
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              addProject();
                            }
                          }}
                          style={{ border: "2px solid #2a8c7b" }}
                        />

                        <button
                          className="btn ms-2 ms-md-3 text-white add-project-btn"
                          onClick={addProject}
                          style={{
                            backgroundColor: "#2a8c7b",
                            borderRadius: "50%",
                            width: "56px",
                            height: "56px",
                            flexShrink: 0,
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mobile View - WhatsApp-style Bottom Input */}
                  {isMobile && (
                    <div 
                      className="whatsapp-input-bar"
                      style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        backgroundColor: "#f0f0f0",
                        padding: "8px 12px",
                        borderTop: "1px solid #e0e0e0",
                        zIndex: 1000,
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        boxShadow: "0 -2px 10px rgba(0,0,0,0.1)"
                      }}
                    >
                      <input
                        type="text"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            addProject();
                          }
                        }}
                        className="form-control whatsapp-input-field"
                        placeholder="Type project name..."
                        style={{
                          flex: 1,
                          borderRadius: "20px",
                          border: "1px solid #e0e0e0",
                          padding: "10px 16px",
                          fontSize: "15px",
                          backgroundColor: "white",
                          outline: "none"
                        }}
                      />
                      <button
                        onClick={addProject}
                        className="btn btn-success whatsapp-send-btn"
                        disabled={!projectName.trim()}
                        style={{
                          width: "44px",
                          height: "44px",
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: 0,
                          backgroundColor: projectName.trim() ? "#2a8c7b" : "#ccc",
                          border: "none",
                          cursor: projectName.trim() ? "pointer" : "not-allowed"
                        }}
                      >
                        <i className="bi bi-send-fill" style={{ fontSize: "18px", color: "white" }}></i>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* PROJECT LIST */}
              <div className="row g-3">
                {projects.map((p) => (
                  <div key={p.id} className="col-12 col-sm-6 col-lg-4 mb-3 mb-md-4">

                    <div
                      className="card shadow-sm p-2 p-md-3 project-card-responsive"
                      style={{
                        borderRadius: "12px",
                        minHeight: "auto",
                        borderLeft: "6px solid #2a8c7b",
                        position: "relative"
                      }}
                    >
                      {editId === p.id ? (
                        <input className="form-control project-edit-input mb-2" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                      ) : (
                        <h5 className="project-name-responsive" style={{ fontFamily: "serif" }}>{p.name}</h5>
                      )}

                      {userRole === "admin" && (
                        <p className="text-muted mt-2 project-assigned-text">
                          <strong>Assigned:</strong>{" "}
                          {p.users?.map((uid) => {
                            const user = allUsers.find((u) => u.id === uid);
                            return user ? user.username || user.email : "Unknown";
                          }).join(", ") || "None"}
                        </p>
                      )}
                     
                      {userRole === "admin" && (
                    <div className="mt-auto d-flex flex-wrap justify-content-between gap-1 project-actions" 
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        display: "flex",
                        gap: "6px",
                         zIndex: 10
                          }}>
                        {editId === p.id ? (
                          <button className="btn btn-sm btn-primary project-action-btn" onClick={() => updateProject(p.id)}>
                            Save
                          </button>
                        ) : (
                          
                          <button
                             className=" text-end btn btn-sm btn-outline-primary d-flex align-items-center justify-content-center task-action-btn"
                             onClick={() => {setEditId(p.id);setEditName(p.name || ""); }}
                             style={{ borderRadius: "50%", width: "32px",height: "32px", padding: 0,}}
                             title="Edit"
                          >
                           <i className="bi bi-pencil-square"></i>
                          </button>
                          
                        )}
                    
                        <button
                             className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center task-action-btn"
                             onClick={() => deleteProject(p.id)}
                             style={{borderRadius: "50%", width: "32px", height: "32px", padding: 0, }}
                             title="Delete"
                         >
                             <i className="bi bi-trash3"></i>
                         </button>
                          
                           </div>
                        )}
                        <div className="mt-auto d-flex flex-wrap justify-content-between gap-1 project-actions">
                        <div className="d-flex gap-1">
                          <button 
                            className="btn btn-sm text-white project-action-btn" 
                            style={{ backgroundColor: "#2a8c7b", position: "relative" }} 
                            onClick={() => handleView(p.id, p.name)}
                          >
                            Chat
                            {/* Badge count on Chat button - top-left corner */}
                            {projectNotificationCounts[p.id] > 0 && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: "-6px",
                                  left: "-6px",
                                  backgroundColor: "#dc3545",
                                  color: "white",
                                  borderRadius: "50%",
                                  minWidth: "18px",
                                  height: "18px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: "10px",
                                  fontWeight: "600",
                                  zIndex: 10,
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                                  padding: projectNotificationCounts[p.id] > 9 ? "0 5px" : "0",
                                }}
                              >
                                {projectNotificationCounts[p.id] > 99 ? "99+" : projectNotificationCounts[p.id]}
                              </span>
                            )}
                          </button>
                          <button 
                            className="btn btn-sm text-white project-action-btn" 
                            style={{ backgroundColor: "#2a8c7b" }} 
                            onClick={() => navigate(`/board/${p.id}/${encodeURIComponent(p.name)}`)}
                          >
                            View Board
                          </button>
                          {userRole === "admin" && (
                            <button className="btn btn-sm btn-warning project-action-btn" onClick={() => openAssignModal(p)}>
                              Assign
                            </button>
                          )}
                        </div>
                      </div>
                     
                   </div>
                  </div>
                ))}

                {projects.length === 0 && <div className="text-center text-muted mt-4">No projects created yet.</div>}
              </div>
            </>
          )}

          {/* USERS PAGE */}
          {activePage === "users" && (
            <div 
              className="p-2 p-md-3 users-page-container"
              style={{
                maxHeight: userRole === "admin" ? "calc(100vh - 200px)" : "calc(100vh - 150px)",
                overflowY: "auto",
                overflowX: "hidden",
                paddingBottom: userRole === "admin" ? "70px" : "20px"
              }}
            >
              <h3 className="mb-2 mb-md-3 users-page-title">All Users</h3>

              {allUsers.length === 0 ? (
                <p>No users found.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-bordered users-table">
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {allUsers
                      .filter((user) => user.role !== "admin")
                      .map((user) => (
                        <tr key={user.id}>
                          <td>{user.username}</td>
                          <td>{user.email}</td>
                          <td>{user.role}</td>
                          <td>
                            <button className="btn btn-danger btn-sm user-delete-btn" onClick={() => deleteUser(user.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* WhatsApp-style Bottom Input Bar for Users Page - Only for Admin and Mobile/Tablet (max-width: 992px) */}
          {activePage === "users" && userRole === "admin" && isMobile && (
            <div 
              className="whatsapp-input-bar"
              style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: "white",
                borderTop: "1px solid #ddd",
                padding: "8px",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 -2px 10px rgba(0,0,0,0.1)"
              }}
            >
              <input
                type="text"
                value={newUserInput}
                onChange={(e) => setNewUserInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && newUserInput.trim()) {
                    // Parse input: format "username email" or "email"
                    const parts = newUserInput.trim().split(/\s+/);
                    if (parts.length >= 2) {
                      setNewUsername(parts[0]);
                      setNewEmail(parts.slice(1).join(' '));
                    } else if (parts.length === 1) {
                      // If only one part, assume it's email
                      setNewEmail(parts[0]);
                      setNewUsername(parts[0].split('@')[0]); // Use email prefix as username
                    }
                    setShowUserModal(true);
                    setNewUserInput("");
                  }
                }}
                className="form-control whatsapp-input-field"
                placeholder="Add user…"
                style={{
                  flex: 1,
                  borderRadius: "20px",
                  border: "1px solid #e0e0e0",
                  padding: "10px 16px",
                  fontSize: "15px",
                  backgroundColor: "white",
                  outline: "none"
                }}
              />
              <button
                onClick={() => {
                  if (newUserInput.trim()) {
                    // Parse input: format "username email" or "email"
                    const parts = newUserInput.trim().split(/\s+/);
                    if (parts.length >= 2) {
                      setNewUsername(parts[0]);
                      setNewEmail(parts.slice(1).join(' '));
                    } else if (parts.length === 1) {
                      // If only one part, assume it's email
                      setNewEmail(parts[0]);
                      setNewUsername(parts[0].split('@')[0]); // Use email prefix as username
                    }
                    setShowUserModal(true);
                    setNewUserInput("");
                  }
                }}
                className="btn btn-success whatsapp-send-btn"
                disabled={!newUserInput.trim()}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  backgroundColor: newUserInput.trim() ? "#2a8c7b" : "#ccc",
                  border: "none",
                  cursor: newUserInput.trim() ? "pointer" : "not-allowed"
                }}
              >
                <i className="bi bi-plus-lg" style={{ fontSize: "20px", color: "white" }}></i>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ADD USER FLOAT BUTTON - Hidden on mobile/tablet (max-width 992px) */}
      {userRole === "admin" && activePage !== "users" && (
       <button
  className="float-add-btn float-add-btn-desktop"
  onClick={() => setShowUserModal(true)}
>
  +
</button>

      )}

      {/* ADD USER MODAL */}
      {showUserModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center modal-overlay-responsive" style={{ background: "rgba(0,0,0,0.5)", zIndex: 10000, padding: "15px" }}>
          <div className="bg-white p-3 p-md-4 rounded shadow modal-content-responsive" style={{ width: "100%", maxWidth: "380px" }}>
            <h4 className="mb-2 mb-md-3 modal-title-responsive">Add New User</h4>

            <input type="text" className="form-control mb-2 modal-input-responsive" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            <input type="email" className="form-control mb-2 modal-input-responsive" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />

            <select className="form-control mb-3 modal-input-responsive" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>

            <div className="text-end d-flex flex-column flex-sm-row justify-content-end gap-2">
              <button className="btn btn-secondary modal-btn-responsive" onClick={() => {
                setShowUserModal(false);
                setNewUsername("");
                setNewEmail("");
                setNewRole("user");
                setNewUserInput("");
              }}>
                Cancel
              </button>

              <button className="btn btn-success modal-btn-responsive" onClick={addNewUser}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL */}
      {showAssignModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center modal-overlay-responsive" style={{ background: "rgba(0,0,0,0.5)", zIndex: 99999, padding: "15px" }}>
          <div className="bg-white p-3 p-md-4 rounded shadow modal-content-responsive" style={{ width: "100%", maxWidth: "380px" }}>
            <h4 className="mb-2 mb-md-3 modal-title-responsive">Assign Users</h4>

            <div className="assign-users-list" style={{ maxHeight: "200px", overflowY: "auto" }}>
              {allUsers
               .filter((u) => u.role !== "admin")
              .map((u) => (
                <div key={u.id} className="d-flex align-items-center mb-2">
                  <input type="checkbox" checked={assignedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} />
                  <span className="ms-2 assign-user-text">{u.username || u.email}</span>
                </div>
              ))}
            </div>

            <div className="text-end mt-3 d-flex flex-column flex-sm-row justify-content-end gap-2">
              <button className="btn btn-secondary modal-btn-responsive" onClick={() => setShowAssignModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary modal-btn-responsive" onClick={saveAssignedUsers}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Panel - Removed bell icon, using badges on project cards only */}
    </div>
  );
}
