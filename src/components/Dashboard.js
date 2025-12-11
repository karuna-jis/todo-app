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

import { useNavigate } from "react-router-dom";
import { onMessage, messaging } from "../components/firebase";
import { initializeFCMToken } from "../utils/fcmToken";
import { useNotification } from "../contexts/NotificationContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // AUTH STATES
  const [userEmail, setUserEmail] = useState("");
  const [userUID, setUserUID] = useState("");
  const [userRole, setUserRole] = useState("");
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

  // Check if mobile/tablet screen (max-width: 992px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 992);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // AUTH LISTENER
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/");
        return;
      }

      setUserEmail(user.email || "");
      setUserUID(user.uid || "");
      console.log("👤 User authenticated:", {
        email: user.email,
        uid: user.uid
      });

      try {
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setUserRole(snap.data().role || "user");
        } else {
          setUserRole("user");
        }
      } catch (err) {
        console.error("Error fetching user doc:", err);
        setUserRole("user");
      }

      // Initialize FCM token for push notifications
      // Enhanced initialization with multiple retries for new users
      if (user.uid) {
        console.log("🔄 User logged in, initializing FCM token...");
        console.log("   User UID:", user.uid);
        console.log("   User Email:", user.email);
        
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
                  // Show success message
                  Swal.fire({
                    toast: true,
                    position: "top-end",
                    icon: "success",
                    title: "Notifications Enabled",
                    text: "You will now receive push notifications",
                    timer: 3000,
                    showConfirmButton: false
                  });
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
        
        // Start initialization
        initializeFCM();
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Handle foreground FCM messages (when app is open)
  useEffect(() => {
    if (!messaging || !onMessage) {
      console.warn("⚠️ FCM messaging not available for foreground messages");
      return;
    }

    console.log("✅ Setting up FCM foreground message listener");

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log("📨 Foreground FCM message received:", payload);
      console.log("   Notification:", payload.notification);
      console.log("   Data:", payload.data);
      
      // Play notification sound (WhatsApp-style)
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGW67+efTQ8MTqfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBhluu/nn00PDE6n4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
        audio.volume = 0.7;
        audio.play().catch(err => {
          // Fallback: Use Web Audio API for simple beep
          try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
          } catch (audioErr) {
            console.log("Could not play sound:", audioErr);
          }
        });
      } catch (error) {
        console.log("Sound playback error:", error);
      }
      
      // Show custom WhatsApp-style popup notification
      showNotification({
        notification: payload.notification,
        data: payload.data,
      });
      
      console.log("✅ Custom popup notification triggered with sound");
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [showNotification]);


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
  return (
    <div className="container-fluid p-0">
      {/* HEADER */}
      <div className="w-100 text-center py-2 py-md-3" style={{ backgroundColor: "#2a8c7b" }}>
      <h1 className="text-white fw-bold dashboard-title">Dashboard</h1>

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
