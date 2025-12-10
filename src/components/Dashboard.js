// src/components/Dashboard.js
import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import Swal from "sweetalert2";
import { auth, db, secondaryAuth } from "./firebase";
import "../App.css";
import { signOut, onAuthStateChanged, createUserWithEmailAndPassword,signInWithEmailAndPassword,deleteUser as deleteAuthUser } from "firebase/auth";

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

export default function Dashboard() {
  const navigate = useNavigate();

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
      if (user.uid) {
        initializeFCMToken(user.uid);
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
      
      // Show browser notification even when app is in foreground
      if (Notification.permission === "granted") {
        const notificationTitle = payload.notification?.title || payload.data?.title || "New Task Created";
        const notificationBody = payload.notification?.body || payload.data?.body || "A new task has been created";
        
        const notificationOptions = {
          body: notificationBody,
          icon: payload.notification?.icon || "/logo192.png",
          badge: "/logo192.png",
          tag: payload.data?.taskId || "task-notification",
          data: payload.data || {},
        };

        console.log("🔔 Showing browser notification:", notificationTitle);
        
        // Show notification
        try {
          const notification = new Notification(notificationTitle, notificationOptions);
          console.log("✅ Browser notification shown successfully");
          
          // Handle notification click
          notification.onclick = (event) => {
            event.preventDefault();
            const data = notification.data || {};
            if (data.link) {
              window.location.href = data.link;
            }
            notification.close();
          };
        } catch (error) {
          console.error("❌ Error showing notification:", error);
        }
      } else {
        console.warn("⚠️ Notification permission not granted, cannot show notification");
        console.warn("   Current permission:", Notification.permission);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);


  // LOAD PROJECTS (realtime)
  useEffect(() => {
    if (!userUID) return;

    const q = query(collection(db, "projects"), where("users", "array-contains", userUID));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProjects(list);
    });

    return () => unsub();
  }, [userUID]);

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
      await updateDoc(doc(db, "projects", selectedProject.id), { users: assignedUsers });
      setShowAssignModal(false);
      Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Users Assigned" });
    } catch (err) {
      console.error(err);
      Swal.fire({ toast: true, position: "top-end", icon: "error", title: "Failed" });
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
