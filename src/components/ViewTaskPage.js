
// ViewTaskPage.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { auth, db } from "./firebase.js";



import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc,
  getDocs,
  getDoc,
  where,
  arrayUnion,
} from "firebase/firestore";
// Removed Cloud Functions imports - using Node.js backend instead

import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from "@mui/lab";
import { Paper } from "@mui/material";

export default function ViewTaskPage() {
  const { projectId, projectName } = useParams();

  const [taskText, setTaskText] = useState("");
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState(""); // Global search term
  const [selectedIndex, setSelectedIndex] = useState(-1); // For keyboard navigation
  const [headerHeight, setHeaderHeight] = useState(0); // Header height for scrollable area
  const [isMobile, setIsMobile] = useState(false); // Check if mobile/tablet screen (max-width: 992px)

  // Refs for task cards (for scrolling to selected item)
  const taskRefs = useRef({});
  const headerRef = useRef(null);

  // modal state (edit)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // delete confirm
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState(null);

  const STATUS_OPTIONS = ["Pending", "In Progress", "Completed"];
  const [showAddBox, setShowAddBox] = useState(false);
  // const tasksColPath = collection(db, "projects", projectId, "tasks");
const tasksColPath = projectId
  ? collection(db, "projects", projectId, "tasks")
  : null;

  // Mark notifications as seen when user opens chat page (ViewTaskPage)
  // markSeen() should be called ONLY inside TaskViewPage useEffect
  useEffect(() => {
    if (!projectId) return;

    const markNotificationsAsSeen = async () => {
      try {
        const user = auth.currentUser;
        const currentUserUID = user?.uid;
        if (!currentUserUID) {
          console.log("No current user UID, skipping markNotificationsAsSeen");
          return;
        }

        const notificationsRef = collection(db, "notifications");
        // Get all notifications for this project
        const q = query(
          notificationsRef,
          where("projectId", "==", projectId)
        );

        const snapshot = await getDocs(q);
        console.log(`Found ${snapshot.docs.length} notifications for project ${projectId}`);
        
        // Update ALL notifications for this project - push currentUser UID to seenBy
        // Only update if not already in seenBy to avoid duplicates
        const notificationsToUpdate = snapshot.docs.filter((docSnap) => {
          const data = docSnap.data();
          const seenBy = data.seenBy || [];
          const shouldUpdate = !seenBy.includes(currentUserUID);
          if (shouldUpdate) {
            console.log(`Will update notification ${docSnap.id}, current seenBy:`, seenBy);
          }
          return shouldUpdate;
        });

        console.log(`Updating ${notificationsToUpdate.length} notifications for user ${currentUserUID}`);

        const updatePromises = notificationsToUpdate.map((docSnap) => {
          const docRef = doc(db, "notifications", docSnap.id);
          console.log(`Updating notification ${docSnap.id} with arrayUnion(${currentUserUID})`);
          return updateDoc(docRef, {
            seenBy: arrayUnion(currentUserUID), // Add current user UID to seenBy array
          });
        });

        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          console.log(`Successfully updated ${updatePromises.length} notifications`);
        } else {
          console.log("No notifications to update");
        }
      } catch (error) {
        console.error("Error marking notifications as seen:", error);
        console.error("Error details:", {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        // Error logged to console - user will see it in browser console
        console.error("Failed to mark notifications as seen:", error.message);
      }
    };

    markNotificationsAsSeen();
  }, [projectId]);

  // realtime listener
  useEffect(() => {
    if (!projectId || !tasksColPath) return;

    const q = query(tasksColPath, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTasks(arr);
      },
      (err) => {
        console.error("Tasks snapshot error:", err);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Helper function to get current user's email
  const getCurrentUserEmail = () => {
    const user = auth.currentUser;
    return user?.email || null;
  };

  // Helper function to check if current user is the task creator
  const isTaskCreator = (task) => {
    const currentUserEmail = getCurrentUserEmail();
    if (!currentUserEmail || !task.createdBy) return false;
    return task.createdBy === currentUserEmail;
  };

 // Add task
const addTask = async () => {
  if (!taskText.trim()) return;
    const user = auth.currentUser;
    if (!user) {
      alert("You must be logged in to create tasks.");
      return;
    }
    
    const userEmail = user.email || "Guest";
    const userName = user?.displayName?.trim() || userEmail;

    const taskDocRef = await addDoc(tasksColPath, {
    text: taskText.trim(),
    status: "Pending",
      createdBy: userEmail, // Store email of creator (never changes)
      createdByName: userName, // Store name of creator (never changes)
      updatedBy: userName, // Store name of last updater (changes only on status update)
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    projectId: projectId,   // <-- REQUIRED !!
  });

    // OPTIMIZED: Create ONE notification per task (not per user)
    // Previously: Created one notification per project member (inefficient)
    // Now: Single notification shared by all project members, tracked via seenBy array
    // This reduces Firestore documents by ~80-90% while maintaining same functionality
    try {
      const userUID = user.uid;
      const notificationsRef = collection(db, "notifications");
      
      // Create a single notification document for this task
      // Creator is added to seenBy initially so they never see badge for their own task
      // All other project members will see this notification until they mark it as seen
      // Badge count logic filters by seenBy array to show unread count per user
      await addDoc(notificationsRef, {
        projectId: projectId,
        projectName: projectName || "Project",
        taskId: taskDocRef.id,
        taskName: taskText.trim(),
        createdBy: userEmail,
        createdByUID: userUID, // Store UID for filtering
        createdByName: userName,
        time: serverTimestamp(),
        seenBy: [userUID], // Creator UID added initially - creator never sees badge for own task
        // When other users open ViewTaskPage, their UID is added to seenBy array
        // Badge count in Dashboard filters notifications where seenBy doesn't include current user
        // Since creator is already in seenBy, they won't see the badge
      });
      
      // Send push notifications via Node.js backend API
      // This sends FCM push notifications to all assigned users (except creator)
      try {
        // Get project document to find assigned users
        const projectDocRef = doc(db, "projects", projectId);
        const projectDoc = await getDoc(projectDocRef);
        
        if (projectDoc.exists()) {
          const projectData = projectDoc.data();
          const assignedUsers = projectData.users || [];
          
          // Get FCM tokens for all assigned users (except creator)
          const usersSnapshot = await getDocs(collection(db, "users"));
          const targetTokens = [];
          const usersWithoutTokens = [];
          const usersWithTokens = [];
          
          usersSnapshot.forEach((userDoc) => {
            const userData = userDoc.data();
            const userDocUID = userDoc.id;
            
            // Check if user is assigned to project and not the creator
            if (assignedUsers.includes(userDocUID) && userDocUID !== userUID) {
              if (userData.fcmToken) {
                targetTokens.push(userData.fcmToken);
                usersWithTokens.push({
                  uid: userDocUID,
                  email: userData.email || userDocUID,
                });
              } else {
                usersWithoutTokens.push({
                  uid: userDocUID,
                  email: userData.email || userDocUID,
                });
              }
            }
          });
          
          // Log detailed information for debugging
          console.log("📊 FCM Token Status for Assigned Users:");
          console.log(`   Total assigned users (excluding creator): ${assignedUsers.filter(uid => uid !== userUID).length}`);
          console.log(`   Users with FCM tokens: ${usersWithTokens.length}`);
          if (usersWithTokens.length > 0) {
            console.log("   ✅ Users with tokens:", usersWithTokens.map(u => u.email || u.uid));
          }
          console.log(`   Users without FCM tokens: ${usersWithoutTokens.length}`);
          if (usersWithoutTokens.length > 0) {
            console.log("   ❌ Users without tokens:", usersWithoutTokens.map(u => u.email || u.uid));
            console.log("   💡 To fix: These users need to:");
            console.log("      1. Login to the app");
            console.log("      2. Allow notification permission");
            console.log("      3. Run 'registerFCMToken()' in browser console");
            console.log("      4. Or wait for auto-initialization on login");
          }
          
          // Send notifications if there are target users
          if (targetTokens.length > 0) {
            // Backend API URL
            // For local development: http://localhost:3001
            // For production: Set REACT_APP_NOTIFICATION_API_URL in Vercel environment variables
            // Or use your deployed backend URL (e.g., Render.com, Railway, etc.)
            const API_URL = process.env.REACT_APP_NOTIFICATION_API_URL || 
                          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
                            ? "http://localhost:3001"
                            : "https://your-backend-url.onrender.com"); // Update this to your production backend URL
            
            console.log(`📤 Sending notifications to ${targetTokens.length} users`);
            console.log(`🔗 Backend API URL: ${API_URL}`);
            console.log(`📋 Target tokens:`, targetTokens.map(t => t.substring(0, 20) + "..."));
            
            // Prepare notification data with absolute URL
            const baseUrl = window.location.origin;
            const notificationData = {
              projectId: projectId,
              projectName: projectName || "Project",
              taskId: taskDocRef.id,
              taskName: taskText.trim(),
              createdBy: userEmail,
              createdByUID: userUID,
              createdByName: userName,
              link: `/view/${projectId}/${encodeURIComponent(projectName || "Project")}`,
              origin: baseUrl, // Add origin for backend to construct absolute URL
            };
            
            // Call backend API to send batch notifications
            try {
              const response = await fetch(`${API_URL}/notify-batch`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  tokens: targetTokens,
                  title: "New Task Created",
                  body: `${userName} created: ${taskText.trim()}`,
                  data: notificationData,
                }),
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Backend API error (${response.status}):`, errorText);
                throw new Error(`Backend API returned ${response.status}: ${errorText}`);
              }
              
              const result = await response.json();
              
              if (result.success) {
                console.log(`✅ Push notifications sent: ${result.notified} success, ${result.failed} failed`);
                if (result.failed > 0) {
                  console.warn(`⚠️ Some notifications failed. Check backend logs.`);
                }
              } else {
                console.error("❌ Failed to send push notifications:", result.error);
              }
            } catch (fetchError) {
              console.error("❌ Error calling backend API:", fetchError);
              console.error("   Make sure backend server is running at:", API_URL);
              console.error("   Check if CORS is configured correctly");
            }
          } else {
            console.warn("⚠️ No users to notify:");
            console.warn(`   - Assigned users: ${assignedUsers.length}`);
            console.warn(`   - Users with FCM tokens: ${targetTokens.length}`);
            console.warn(`   - Creator UID: ${userUID}`);
            if (usersWithoutTokens.length > 0) {
              console.warn("   ❌ Users missing FCM tokens:");
              usersWithoutTokens.forEach(user => {
                console.warn(`      - ${user.email || user.uid}`);
              });
            }
            console.warn("   💡 Solution:");
            console.warn("   1. Ask these users to login to the app");
            console.warn("   2. They should allow notification permission when prompted");
            console.warn("   3. If permission was denied, they need to:");
            console.warn("      - Click 🔒 icon in browser address bar");
            console.warn("      - Go to Site settings → Notifications → Allow");
            console.warn("      - Refresh page and login again");
            console.warn("   4. Or they can manually register by running in browser console:");
            console.warn("      registerFCMToken()");
            console.warn("   5. Verify token is saved in Firestore: users/{userUID}/fcmToken");
          }
        }
      } catch (fcmError) {
        console.error("❌ Error sending push notification:", fcmError);
        console.error("   Error details:", fcmError.message);
        console.error("   Stack:", fcmError.stack);
        // Don't block task creation if FCM fails
      }
    } catch (error) {
      console.error("Error creating notification:", error);
      // Don't block task creation if notification fails
    }

  setTaskText("");
};


  // Open edit modal (we keep modal behavior as original)
  const openEditModal = (task) => {
    // Check if user is the creator before opening modal
    if (!isTaskCreator(task)) {
      alert("You don't have permission to edit this task. Only the creator can edit.");
      return;
    }
    
    setEditingTask({
      ...task,
      text: task.text ?? "",
      status: task.status ?? "Pending",
      updatedBy: task.updatedBy ?? (auth.currentUser?.displayName ?? "User"),
    });
    setShowEditModal(true);
  };

  // Save editing changes
  const saveEdit = async () => {
    if (!editingTask?.id) return;
    
    // Check if user is the creator
    const task = tasks.find(t => t.id === editingTask.id);
    if (task && !isTaskCreator(task)) {
      alert("You don't have permission to edit this task. Only the creator can edit.");
      setShowEditModal(false);
      setEditingTask(null);
      return;
    }

    const user = auth.currentUser;
    const by = user?.displayName?.trim() || user?.email || "Guest";
    
    // Get the original task to check if status changed
    const originalTask = tasks.find(t => t.id === editingTask.id);
    const statusChanged = originalTask && originalTask.status !== editingTask.status;
    
    const ref = doc(db, "projects", projectId, "tasks", editingTask.id);
    
    // Prepare update object
    const updateData = {
      text: editingTask.text,
      status: editingTask.status,
      updatedAt: serverTimestamp(),
    };
    
    // Only update updatedBy if status changed
    // If only text changed (not status), updatedBy stays the same
    if (statusChanged) {
      updateData.updatedBy = by;
    }
    
    // CRITICAL: createdBy and createdByName are NEVER updated - they stay the same forever
    // These fields are not included in updateData to ensure they never change
    await updateDoc(ref, updateData);
    setShowEditModal(false);
    setEditingTask(null);
  };

  // Delete
  const confirmDelete = (taskId) => {
    setDeletingTaskId(taskId);
    setShowDeleteConfirm(true);
  };

  const doDelete = async () => {
    if (!deletingTaskId) return;
    
    // Check if user is the creator
    const task = tasks.find(t => t.id === deletingTaskId);
    if (task && !isTaskCreator(task)) {
      alert("You don't have permission to delete this task. Only the creator can delete.");
      setShowDeleteConfirm(false);
      setDeletingTaskId(null);
      return;
    }

    await deleteDoc(doc(db, "projects", projectId, "tasks", deletingTaskId));
    setShowDeleteConfirm(false);
    setDeletingTaskId(null);
  };

  // helper: format Firestore timestamp safely
  const formatTs = (ts) => {
  if (!ts) return "—";

  let date;

  if (ts.seconds) {
    date = new Date(ts.seconds * 1000);
  } else {
    date = new Date(ts);
  }

  if (isNaN(date)) return "—";

  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" }); // Nov
  const time = date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return `${day} ${month}, ${time}`;
};

  // Helper function to highlight search text
  const highlightText = (text, searchTerm) => {
    if (!searchTerm.trim()) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} style={{ backgroundColor: '#ffeb3b', padding: '2px 0', borderRadius: '2px' }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Filter tasks based on search term
  const filteredTasks = searchTerm.trim()
    ? tasks.filter((t) => 
        t.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.updatedBy?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.status?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : tasks;

  // Get matching task indices for keyboard navigation
  const matchingTaskIndices = tasks
    .map((t, index) => {
      if (!searchTerm.trim()) return -1;
      const matches = 
        t.text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.updatedBy?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.status?.toLowerCase().includes(searchTerm.toLowerCase());
      return matches ? index : -1;
    })
    .filter(index => index !== -1);

  // Keyboard navigation handler
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!searchTerm.trim() || matchingTaskIndices.length === 0) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev < matchingTaskIndices.length - 1 ? prev + 1 : 0;
          // Scroll to the selected task
          const taskId = tasks[matchingTaskIndices[next]]?.id;
          if (taskId && taskRefs.current[taskId]) {
            taskRefs.current[taskId].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : matchingTaskIndices.length - 1;
          // Scroll to the selected task
          const taskId = tasks[matchingTaskIndices[next]]?.id;
          if (taskId && taskRefs.current[taskId]) {
            taskRefs.current[taskId].scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return next;
        });
      } else if (e.key === 'Escape') {
        setSearchTerm("");
        setSelectedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm, matchingTaskIndices, tasks]);

  // Reset selected index when search term changes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [searchTerm]);

  // Check if mobile/tablet screen (max-width: 992px)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 992);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Calculate header height for scrollable area
  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        setHeaderHeight(headerRef.current.offsetHeight);
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);
    
    return () => window.removeEventListener('resize', updateHeaderHeight);
  }, [searchTerm]); // Recalculate when search term changes (affects header height)



  return (
    <div className="container-fluid p-0 m-0" style={{ overflowX: "hidden", overflowY: "auto", maxWidth: "100vw", width: "100%", paddingLeft: 0, paddingRight: 0, marginLeft: 0, marginRight: 0 }}>
      {/* Header */}
      <div
        ref={headerRef}
        className="w-100 d-flex align-items-center justify-content-between flex-wrap py-2 py-md-3 task-header-responsive"
        style={{ backgroundColor: "#2a8c7b", gap: "10px", position: "sticky", top: 0, zIndex: 100, paddingLeft: "12px", paddingRight: "12px", marginLeft: 0, marginRight: 0 }}
      >
        <button
          className="btn btn-light back-btn-responsive"
          style={{ borderRadius: "50%", width: "35px", height: "35px", padding: 0, fontSize: "18px", flexShrink: 0 }}
          onClick={() => window.history.back()}
        >
          ←
        </button>

        <div className="text-center flex-grow-1" style={{ minWidth: "120px" }}>
          <h1 className="text-white fw-bold task-title-responsive">Chat Box</h1>
          <h2 className="text-white task-subtitle-responsive" style={{ fontSize: "14px" }}>
            {projectName}
          </h2>
        </div>

        {/* Global Search Bar */}
        <div className="global-search-wrapper" style={{ flex: "0 1 auto", minWidth: "150px", maxWidth: "300px", width: "100%", display: "flex", flexDirection: "column" }}>
          <div className="input-group shadow-sm global-search-container" style={{ width: "100%", display: "flex", position: "relative" }}>
            <input
              type="text"
              className="form-control global-search-input"
              placeholder="Search all tasks..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedIndex(-1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matchingTaskIndices.length > 0) {
                  e.preventDefault();
                  const firstIndex = matchingTaskIndices[0];
                  const taskId = tasks[firstIndex]?.id;
                  if (taskId && taskRefs.current[taskId]) {
                    taskRefs.current[taskId].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setSelectedIndex(0);
                  }
                }
              }}
              style={{
                fontSize: "13px",
                height: "35px",
              }}
            />
            <span
              className="input-group-text bg-white text-success shadow-sm"
              style={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                padding: "0 12px",
                border: "1px solid #ced4da",
                borderLeft: "none",
              }}
            >
              <i className="bi bi-search"></i>
            </span>
            {searchTerm && (
              <button
                className="btn btn-sm text-muted"
              onClick={() => {
                setSearchTerm("");
                setSelectedIndex(-1);
              }}
                style={{
                  position: "absolute",
                  right: "45px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  padding: "0 5px",
                  zIndex: 10,
                }}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {searchTerm && matchingTaskIndices.length > 0 && (
            <small className="text-white" style={{ fontSize: "11px", display: "block", marginTop: "4px" }}>
              {matchingTaskIndices.length} result{matchingTaskIndices.length !== 1 ? 's' : ''} found
              {selectedIndex >= 0 && ` (${selectedIndex + 1}/${matchingTaskIndices.length})`}
            </small>
          )}
          {searchTerm && matchingTaskIndices.length === 0 && (
            <small className="text-white" style={{ fontSize: "11px", display: "block", marginTop: "4px" }}>
              No results found
            </small>
          )}
        </div>

      </div>

      {/* Scrollable Timeline Container */}
      <div 
        className="timeline-wrapper-responsive"
          style={{
          maxHeight: isMobile 
            ? `calc(100vh - ${headerHeight}px - 60px)` // Mobile: Subtract header + WhatsApp input bar (60px)
            : `calc(100vh - ${headerHeight}px - 90px)`, // Desktop: Subtract header + button space
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          paddingBottom: isMobile ? "70px" : "90px" // Add padding to prevent content from being hidden behind input bar
        }}
      >
        <div className="timeline-container-responsive" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <Timeline position="right" className="task-timeline-responsive">   {/* force items to the right */}
    {tasks.length === 0 ? (
      <div style={{ padding: "24px 12px" }}>
        <p className="text-center text-muted mt-4">
          No tasks found.
        </p>
      </div>
    ) : filteredTasks.length === 0 ? (
      <div style={{ padding: "24px 12px" }}>
          <p className="text-center text-muted mt-4">
          No tasks match your search.
          </p>
        </div>
      ) : (
      filteredTasks.map((t, index) => {
        const originalIndex = tasks.findIndex(task => task.id === t.id);
        const isSelected = selectedIndex >= 0 && matchingTaskIndices[selectedIndex] === originalIndex;
        
        return (
          <TimelineItem 
            key={t.id} 
            className="task-item-responsive"
          >

            {/* LEFT SIDE — ONLY DATE */}
            <TimelineOppositeContent
              align="right"
              sx={{ m: "auto 0", fontWeight: 600 }}
              color="text.secondary"
              className="timeline-date-responsive"
            >
             {formatTs(t.updatedAt)}
            </TimelineOppositeContent>

            <TimelineSeparator>
              <TimelineDot color="success" />
              <TimelineConnector />
            </TimelineSeparator>

            {/* RIGHT SIDE — COMPLETE TASK CARD */}
            <TimelineContent sx={{ py: "20px", px: 2 }} className="timeline-content-responsive">
            <Paper 
              elevation={2} 
              className="task-card-paper" 
              ref={(el) => {
                if (el) taskRefs.current[t.id] = el;
              }}
              style={{ 
                padding: 14, 
                borderRadius: 10, 
                maxWidth: "330px", 
                width: "100%",
                boxShadow: isSelected ? "0 4px 8px rgba(255, 235, 59, 0.5)" : "0 2px 4px rgba(0,0,0,0.1)",
                border: isSelected ? "2px solid #ffeb3b" : "none",
                transition: "all 0.2s ease",
                backgroundColor: isSelected ? "#fffde7" : "white",
              }}
            >
              <div className="d-flex align-items-start justify-content-between flex-wrap task-card-content">

                {/* LEFT — TEXT & STATUS */}
                <div className="task-card-left" style={{ maxWidth: "75%", flex: "1 1 auto", minWidth: "200px" }}>
                  <div className="small text-muted mb-2 task-created-by">
                    Created By: <strong>{highlightText(t.createdByName || "Unknown", searchTerm)}</strong>
                  </div>
                  <div className="small text-muted mb-2 task-updated-by">
                    Updated By: <strong>{highlightText(t.updatedBy || "Unknown", searchTerm)}</strong>
                  </div>

                  {/* status dropdown inline update */}
                 <div className="d-flex align-items-center mb-2 flex-wrap task-status-group">
  <label className="me-2 small mb-0 task-status-label">Status:</label>

  <select
    className="form-select form-select-sm task-status-select"
    value={t.status}
    onChange={async (e) => {
      const user = auth.currentUser;
      if (!user) {
        alert("You must be logged in to update task status.");
        return;
      }
      
      const userName = user?.displayName?.trim() || user?.email || "Guest";
      const ref = doc(db, "projects", projectId, "tasks", t.id);
      
      try {
        // Only update status, updatedBy, and updatedAt when status changes
        // createdBy and createdByName stay the same
      await updateDoc(ref, {
        status: e.target.value,
          updatedBy: userName, // Update who last updated the status
        updatedAt: serverTimestamp(),
          // Note: createdBy and createdByName are NOT included - they never change
        });
      } catch (error) {
        console.error("Error updating task status:", error);
        
        alert(`Failed to update task status: ${error.message || "Unknown error"}`);
        // Reset dropdown to original value on error
        e.target.value = t.status;
      }
    }}
    style={{
      width: 150,
      backgroundColor:
        t.status === "Completed"
          ? "#9bf294ff"      // light green
          : t.status === "Pending"
          ? "#eecf6aff"      // light yellow
          : t.status === "In Progress"
          ? "#9bc6f3ff"      // light blue
          : "white",       // default
      fontWeight: "500",
    }}
  >
    {STATUS_OPTIONS.map((s) => (
      <option key={s} value={s}>
        {s}
      </option>
    ))}
  </select>
</div>


                  <h5 className="card-title mb-0 task-text-responsive">
                    {highlightText(t.text || "", searchTerm)}
                  </h5>
                </div>

                {/* RIGHT — ACTION BUTTONS - Only show if user is creator */}
                {isTaskCreator(t) && (
                <div className="text-end d-flex gap-1 task-action-buttons">
  {/* EDIT ICON */}
  <button
    className="btn btn-sm btn-outline-primary d-flex align-items-center justify-content-center task-action-btn"
                      onClick={() => {
                        if (!isTaskCreator(t)) {
                          alert("You don't have permission to edit this task. Only the creator can edit.");
                          return;
                        }
                        openEditModal(t);
                      }}
    style={{
      borderRadius: "50%",
      width: "32px",
      height: "32px",
      padding: 0,
    }}
    title="Edit"
  >
    <i className="bi bi-pencil-square"></i>
  </button>
  {/* DELETE ICON */}
  <button
    className="btn btn-sm btn-outline-danger d-flex align-items-center justify-content-center task-action-btn"
                      onClick={() => {
                        if (!isTaskCreator(t)) {
                          alert("You don't have permission to delete this task. Only the creator can delete.");
                          return;
                        }
                        confirmDelete(t.id);
                      }}
    style={{
      borderRadius: "50%",
      width: "32px",
      height: "32px",
      padding: 0,
    }}
    title="Delete"
  >
    <i className="bi bi-trash3"></i>
  </button>
</div>
                )}


              </div>
            </Paper>
          </TimelineContent>

        </TimelineItem>
        );
      })
    )}
    </Timeline>
  </div>
</div>

      {/* WhatsApp-style Bottom Input Bar - Mobile/Tablet View (max-width: 992px) */}
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
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                addTask();
              }
            }}
            className="form-control whatsapp-input-field"
            placeholder="Type a message..."
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
              addTask();
            }}
            className="btn btn-success whatsapp-send-btn"
            disabled={!taskText.trim()}
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              backgroundColor: taskText.trim() ? "#2a8c7b" : "#ccc",
              border: "none",
              cursor: taskText.trim() ? "pointer" : "not-allowed"
            }}
          >
            <i className="bi bi-send-fill" style={{ fontSize: "18px", color: "white" }}></i>
          </button>
        </div>
      )}

      {/* Desktop: Floating Add Button (min-width: 992px) */}
      {!isMobile && (
        <>
          <div style={{ position: "fixed", bottom: "25px", right: "25px", zIndex: 1000 }}>
            <button 
              onClick={() => setShowAddBox(true)} 
              className="btn btn-success shadow-lg task-add-btn-responsive"
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                fontSize: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0
              }}
            > 
              +
            </button>
          </div>

{showAddBox && (
  <div
    className="card shadow add-task-box-responsive"
    style={{
      position: "fixed",
      bottom: "20px",
      right: "20px",
      width: "100%",
      maxWidth: "300px",
      zIndex: 1000,
      padding: "15px",
      borderRadius: "12px",
      animation: "slideUp 0.3s ease",
      margin: "0 15px",
    }}
  >
    <div className="d-flex justify-content-between align-items-center mb-2">
      <h6 className="m-0 add-task-title">Add Task</h6>
      <button
        className="btn-close"
        onClick={() => setShowAddBox(false)}
      ></button>
    </div>

    <input
      value={taskText}
      onChange={(e) => setTaskText(e.target.value)}
      className="form-control mb-3 add-task-input"
      placeholder="Enter task"
    />

    <button
      className="btn btn-success w-100 add-task-submit-btn"
      onClick={() => {
        addTask();
        setShowAddBox(false);
      }}
    >
      Add
    </button>
  </div>
          )}
        </>
)}


      {/* ---------- Edit Modal ---------- */}
      {showEditModal && editingTask && (
        <div className="modal show d-block modal-overlay-responsive" tabIndex="-1" role="dialog" style={{ padding: "15px" }}>
          <div className="modal-dialog modal-dialog-centered task-modal-responsive" role="document" style={{ maxWidth: "500px", width: "100%" }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title modal-title-responsive">Edit Task</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTask(null);
                  }}
                />
              </div>

              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Task Text</label>
                  <input
                    className="form-control modal-input-responsive"
                    value={editingTask.text}
                    onChange={(e) =>
                      setEditingTask({ ...editingTask, text: e.target.value })
                    }
                  />
                </div>

              </div>

              <div className="modal-footer d-flex flex-column flex-sm-row justify-content-end gap-2">
                
                <button className="btn btn-success modal-btn-responsive" onClick={saveEdit}>
                  Save 
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Delete Confirmation Modal ---------- */}
      {showDeleteConfirm && (
        <div className="modal show d-block modal-overlay-responsive" tabIndex="-1" role="dialog" style={{ padding: "15px" }}>
          <div className="modal-dialog modal-sm modal-dialog-centered task-modal-responsive" role="document" style={{ maxWidth: "400px", width: "100%" }}>
            <div className="modal-content">
              <div className="modal-body">
                <p className="delete-confirm-text">Are you sure you want to delete this task?</p>
                <div className="d-flex flex-column flex-sm-row justify-content-end gap-2">
                  <button
                    className="btn btn-secondary modal-btn-responsive"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-danger modal-btn-responsive" onClick={doDelete}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    
  );
}
