// src/components/Dashboard.js
import React, { useEffect, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import Swal from "sweetalert2";
import { auth, db, secondaryAuth } from "./firebase";
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
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { useNavigate } from "react-router-dom";

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

  // UI page control
  const [activePage, setActivePage] = useState("dashboard");

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
    });

    return () => unsubscribe();
  }, [navigate]);

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
    const conf = window.confirm("Are you sure you want to delete this user?");
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
      <div className="w-100 text-center py-3" style={{ backgroundColor: "#2a8c7b" }}>
        <h1 className="text-white fw-bold display-4">Dashboard</h1>
      </div>

      <div className="row m-0">
        {/* SIDEBAR */}
        <div className="col-12 col-md-3 p-4" style={{ backgroundColor: "#e8e8e8", minHeight: "auto" }}>
          <div
            className="mb-4"
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

          <button className="btn w-100 mb-3 text-white fw-bold" style={{ backgroundColor: "#2a8c7b" }}>
            {userEmail}
          </button>

         

          {userRole === "admin" && (
            <div style={{ marginTop: 12 }}>
              <button
               className="btn w-100 mb-3 text-white fw-bold"
                onClick={() => setActivePage("users")}
                style={{ cursor: "pointer", padding: "10px", backgroundColor: "#2a8c7b"}}
              >
                👥 Users
              </button>

              <button
               className="btn w-100 mb-3 text-white fw-bold"
                onClick={() => setActivePage("dashboard")}
                style={{ cursor: "pointer", padding: "10px",backgroundColor: "#2a8c7b"  }}
              >
                📁 Projects
              </button>
               <button className="btn w-100 fw-bold text-white" style={{ backgroundColor: "black" }} onClick={handleLogout}>
            Logout
          </button>
            </div>
            
          )}
        </div>

        {/* MAIN SCREEN */}
        <div className="col-12 col-md-9 p-4" style={{ minHeight: "100vh" }}>
          {/* Conditional pages */}
          {activePage === "dashboard" && (
            <>
              {/* CREATE PROJECT */}
              {userRole === "admin" && (
                <div className="mb-4 p-3 shadow-sm bg-white">
                  <h5 className="mb-3">Create New Project</h5>

                  <div className="d-flex align-items-center mb-3">
                    <input
                      type="text"
                      className="form-control fs-5"
                      placeholder="Project Name"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      style={{ border: "2px solid #2a8c7b" }}
                    />

                    <button
                      className="btn ms-3 text-white fs-4"
                      onClick={addProject}
                      style={{
                        backgroundColor: "#2a8c7b",
                        borderRadius: "50%",
                        width: "56px",
                        height: "56px",
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* PROJECT LIST */}
              <div className="row">
                {projects.map((p) => (
                  <div key={p.id} className="col-md-4 col-sm-6 mb-4">
                    <div
                      className="card shadow-sm p-3"
                      style={{
                        borderRadius: "12px",
                        minHeight: "200px",
                        borderLeft: "6px solid #2a8c7b",
                      }}
                    >
                      {editId === p.id ? (
                        <input className="form-control fs-5 mb-2" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                      ) : (
                        <h5 style={{ fontFamily: "serif" }}>{p.name}</h5>
                      )}

                      {userRole === "admin" && (
                        <p className="text-muted mt-2">
                          <strong>Assigned:</strong>{" "}
                          {p.users?.map((uid) => {
                            const user = allUsers.find((u) => u.id === uid);
                            return user ? user.username || user.email : "Unknown";
                          }).join(", ") || "None"}
                        </p>
                      )}

                      <div className="mt-auto d-flex justify-content-between">
                        {editId === p.id ? (
                          <button className="btn btn-sm btn-primary" onClick={() => updateProject(p.id)}>
                            Save
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => {
                              setEditId(p.id);
                              setEditName(p.name || "");
                            }}
                          >
                            Edit
                          </button>
                        )}

                        <button className="btn btn-sm btn-outline-danger" onClick={() => deleteProject(p.id)}>
                          Delete
                        </button>

                        {userRole === "admin" && (
                          <button className="btn btn-sm btn-warning" onClick={() => openAssignModal(p)}>
                            Assign
                          </button>
                        )}

                        <button className="btn btn-sm text-white" style={{ backgroundColor: "#2a8c7b" }} onClick={() => handleView(p.id, p.name)}>
                          View
                        </button>
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
            <div className="p-3">
              <h3 className="mb-3">All Users</h3>

              {allUsers.length === 0 ? (
                <p>No users found.</p>
              ) : (
                <table className="table table-bordered">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {allUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.username}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteUser(user.id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ADD USER FLOAT BUTTON */}
      {userRole === "admin" && (
        <button
          onClick={() => setShowUserModal(true)}
          style={{
            position: "fixed",
            bottom: "25px",
            right: "25px",
            width: "60px",
            height: "60px",
            borderRadius: "50%",
            backgroundColor: "#2a8c7b",
            color: "white",
            fontSize: "32px",
            border: "none",
            boxShadow: "0px 4px 10px rgba(0,0,0,0.3)",
            zIndex: 9999,
          }}
        >
          +
        </button>
      )}

      {/* ADD USER MODAL */}
      {showUserModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ background: "rgba(0,0,0,0.5)", zIndex: 10000 }}>
          <div className="bg-white p-4 rounded shadow" style={{ width: "380px" }}>
            <h4 className="mb-3">Add New User</h4>

            <input type="text" className="form-control mb-2" placeholder="Username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            <input type="email" className="form-control mb-2" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />

            <select className="form-control mb-3" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>

            <div className="text-end">
              <button className="btn btn-secondary me-2" onClick={() => setShowUserModal(false)}>
                Cancel
              </button>

              <button className="btn btn-success" onClick={addNewUser}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL */}
      {showAssignModal && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ background: "rgba(0,0,0,0.5)", zIndex: 99999 }}>
          <div className="bg-white p-4 rounded shadow" style={{ width: "380px" }}>
            <h4 className="mb-3">Assign Users</h4>

            <div style={{ maxHeight: "200px", overflowY: "auto" }}>
              {allUsers.map((u) => (
                <div key={u.id} className="d-flex align-items-center mb-2">
                  <input type="checkbox" checked={assignedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} />
                  <span className="ms-2">{u.username || u.email}</span>
                </div>
              ))}
            </div>

            <div className="text-end mt-3">
              <button className="btn btn-secondary me-2" onClick={() => setShowAssignModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveAssignedUsers}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
