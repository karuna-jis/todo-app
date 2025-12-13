import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db, auth } from "../../components/firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { getDoc, doc } from "firebase/firestore";
import Swal from "sweetalert2";

const Attendance = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState("");
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigate("/");
          return;
        }

        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const role = userDocSnap.data().role || "user";
          setUserRole(role);
          
          if (role !== "admin") {
            Swal.fire({
              toast: true,
              position: "top-end",
              icon: "error",
              title: "Access denied. Admin only.",
              timer: 2000,
            });
            navigate("/dashboard");
            return;
          }
        } else {
          navigate("/dashboard");
          return;
        }
      } catch (error) {
        console.error("Error checking user role:", error);
        navigate("/dashboard");
      }
    };

    checkUserRole();
  }, [navigate]);

  useEffect(() => {
    if (userRole === "admin") {
      fetchAttendanceRecords();
    }
  }, [userRole, filterDate, filterEmail]);

  const fetchAttendanceRecords = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, "attendance"), orderBy("createdAt", "desc"));

      if (filterDate) {
        q = query(q, where("date", "==", filterDate));
      }

      const querySnapshot = await getDocs(q);
      const records = [];

      querySnapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() });
      });

      // Filter by email if provided
      let filteredRecords = records;
      if (filterEmail) {
        filteredRecords = records.filter((record) =>
          record.userEmail?.toLowerCase().includes(filterEmail.toLowerCase())
        );
      }

      setAttendanceRecords(filteredRecords);
    } catch (error) {
      console.error("Error fetching attendance records:", error);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Failed to fetch attendance records",
        text: error.message,
        timer: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleRowExpansion = (recordId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
    }
    setExpandedRows(newExpanded);
  };

  const formatTime = (timeString) => {
    if (!timeString) return "N/A";
    return timeString;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const calculateTotalBreakTime = (breaks) => {
    if (!breaks || breaks.length === 0) return "0 min";
    
    const totalMinutes = breaks.reduce((total, b) => {
      if (b.start && b.end) {
        const start = parseTime(b.start);
        const end = parseTime(b.end);
        const diff = (end - start) / (1000 * 60);
        return total + Math.max(0, diff);
      }
      return total;
    }, 0);

    if (totalMinutes < 60) {
      return `${Math.round(totalMinutes)} min`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${hours}h ${minutes}m`;
  };

  const parseTime = (timeString) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const formatWorkHours = (minutes) => {
    if (!minutes && minutes !== 0) return "N/A";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const getStatus = (record) => {
    if (record.logoutTime) {
      return <span className="badge bg-success">Completed</span>;
    }
    return <span className="badge bg-warning">Open</span>;
  };

  if (loading || userRole !== "admin") {
    return (
      <div className="container-fluid p-4">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid p-2 p-md-4">
      <div className="mb-3 mb-md-4">
        <h2 className="fw-bold" style={{ fontSize: isMobile ? "20px" : "24px" }}>Attendance Records</h2>
      </div>

      {/* Filters */}
      <div className="row mb-3 mb-md-4">
        <div className="col-12 col-md-6 mb-2 mb-md-0">
          <label className="form-label fw-bold" style={{ fontSize: isMobile ? "14px" : "16px" }}>Filter by Date</label>
          <input
            type="date"
            className="form-control"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            style={{ fontSize: isMobile ? "14px" : "16px" }}
          />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label fw-bold" style={{ fontSize: isMobile ? "14px" : "16px" }}>Filter by User Email</label>
          <input
            type="text"
            className="form-control"
            placeholder="Enter email..."
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            style={{ fontSize: isMobile ? "14px" : "16px" }}
          />
        </div>
      </div>

      {/* Mobile Card View */}
      {isMobile ? (
        <div className="row g-3">
          {attendanceRecords.length === 0 ? (
            <div className="col-12">
              <div className="text-center py-4">
                <p className="text-muted">No attendance records found</p>
              </div>
            </div>
          ) : (
            attendanceRecords.map((record) => (
              <div key={record.id} className="col-12">
                <div className="card shadow-sm">
                  <div className="card-body p-3">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div className="flex-grow-1">
                        <h6 className="fw-bold mb-1" style={{ fontSize: "14px", wordBreak: "break-word" }}>
                          {record.userEmail || "N/A"}
                        </h6>
                        <small className="text-muted">{formatDate(record.date)}</small>
                      </div>
                      <div>{getStatus(record)}</div>
                    </div>
                    
                    <hr className="my-2" />
                    
                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <small className="text-muted d-block">Login</small>
                        <strong style={{ fontSize: "13px" }}>{formatTime(record.loginTime)}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Logout</small>
                        <strong style={{ fontSize: "13px" }}>{formatTime(record.logoutTime)}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Break Time</small>
                        <strong style={{ fontSize: "13px" }}>{calculateTotalBreakTime(record.breaks)}</strong>
                      </div>
                      <div className="col-6">
                        <small className="text-muted d-block">Working Hours</small>
                        <strong style={{ fontSize: "13px" }}>{formatWorkHours(record.totalWorkMinutes)}</strong>
                      </div>
                    </div>

                    {record.breaks && record.breaks.length > 0 && (
                      <div className="mt-2">
                        <button
                          className="btn btn-sm btn-outline-primary w-100"
                          onClick={() => toggleRowExpansion(record.id)}
                          style={{ fontSize: "12px" }}
                        >
                          {expandedRows.has(record.id) ? "Hide" : "Show"} Breaks ({record.breaks.length})
                        </button>
                        {expandedRows.has(record.id) && (
                          <div className="mt-2 p-2 bg-light rounded">
                            <h6 className="fw-bold mb-2" style={{ fontSize: "13px" }}>Break Details:</h6>
                            {record.breaks.map((b, index) => (
                              <div key={index} className="mb-1" style={{ fontSize: "12px" }}>
                                <span className="badge bg-info me-2">
                                  {b.type || "Break"} {index + 1}
                                </span>
                                <span>
                                  {formatTime(b.start)} - {formatTime(b.end) || "Active"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Desktop Table View */
        <div className="table-responsive">
          <table className="table table-striped table-hover">
            <thead className="table-dark">
              <tr>
                <th>User Email</th>
                <th>Login Time</th>
                <th>Logout Time</th>
                <th>Break Time</th>
                <th>Total Working Hours</th>
                <th>Date</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecords.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-4">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                attendanceRecords.map((record) => (
                  <React.Fragment key={record.id}>
                    <tr>
                      <td style={{ wordBreak: "break-word", maxWidth: "200px" }}>{record.userEmail || "N/A"}</td>
                      <td>{formatTime(record.loginTime)}</td>
                      <td>{formatTime(record.logoutTime)}</td>
                      <td>{calculateTotalBreakTime(record.breaks)}</td>
                      <td>{formatWorkHours(record.totalWorkMinutes)}</td>
                      <td>{formatDate(record.date)}</td>
                      <td>{getStatus(record)}</td>
                      <td>
                        {record.breaks && record.breaks.length > 0 && (
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => toggleRowExpansion(record.id)}
                          >
                            {expandedRows.has(record.id) ? "Hide" : "Show"} Breaks
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(record.id) && record.breaks && record.breaks.length > 0 && (
                      <tr>
                        <td colSpan="8">
                          <div className="p-3 bg-light rounded">
                            <h6 className="fw-bold mb-2">Break Details:</h6>
                            {record.breaks.map((b, index) => (
                              <div key={index} className="mb-2">
                                <span className="badge bg-info me-2">
                                  {b.type || "Break"} {index + 1}
                                </span>
                                <span>
                                  {formatTime(b.start)} - {formatTime(b.end) || "Active"}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Attendance;

