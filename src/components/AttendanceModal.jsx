import React, { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import Swal from "sweetalert2";

const AttendanceModal = ({ show, onClose, userEmail, userId }) => {
  const [loginTime, setLoginTime] = useState("");
  const [logoutTime, setLogoutTime] = useState("");
  const [breaks, setBreaks] = useState([]);
  const [activeBreak, setActiveBreak] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // Set current time as login time when modal opens for the first time (only if loginTime is empty)
  useEffect(() => {
    if (show && !hasInitialized && !loginTime) {
      const now = new Date();
      const timeString = now.toTimeString().slice(0, 5); // HH:MM format
      setLoginTime(timeString);
      setHasInitialized(true);
    }
    // Don't reset when modal closes - preserve state
  }, [show, hasInitialized, loginTime]);

  const handleStartBreak = () => {
    if (activeBreak) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "warning",
        title: "Please end current break first",
        timer: 2000,
      });
      return;
    }

    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    const newBreak = {
      start: timeString,
      end: null,
      type: "lunch", // Default type
    };
    setActiveBreak(newBreak);
    setBreaks([...breaks, newBreak]);
  };

  const handleEndBreak = () => {
    if (!activeBreak) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "warning",
        title: "No active break to end",
        timer: 2000,
      });
      return;
    }

    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    
    const updatedBreaks = breaks.map((b, index) => {
      if (index === breaks.length - 1 && !b.end) {
        return { ...b, end: timeString };
      }
      return b;
    });

    setBreaks(updatedBreaks);
    setActiveBreak(null);
  };

  const parseTime = (timeString) => {
    const [hours, minutes] = timeString.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  const calculateTotalBreakMinutes = () => {
    return breaks.reduce((total, b) => {
      if (b.start && b.end) {
        const start = parseTime(b.start);
        const end = parseTime(b.end);
        const diff = (end - start) / (1000 * 60); // minutes
        return total + Math.max(0, diff);
      }
      return total;
    }, 0);
  };

  const calculateTotalWorkMinutes = () => {
    if (!loginTime || !logoutTime) return 0;
    
    const login = parseTime(loginTime);
    const logout = parseTime(logoutTime);
    
    // Handle case where logout is next day
    if (logout < login) {
      logout.setDate(logout.getDate() + 1);
    }
    
    const totalMinutes = (logout - login) / (1000 * 60);
    const breakMinutes = calculateTotalBreakMinutes();
    
    return Math.max(0, totalMinutes - breakMinutes);
  };

  const handleSubmit = async () => {
    if (!loginTime || !logoutTime) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "warning",
        title: "Please fill in login and logout times",
        timer: 2000,
      });
      return;
    }

    // Check if there's an active break
    if (activeBreak) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "warning",
        title: "Please end your break before submitting",
        timer: 2000,
      });
      return;
    }

    setSubmitting(true);

    try {
      // Check if attendance already exists for today
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const attendanceQuery = query(
        collection(db, "attendance"),
        where("userId", "==", userId),
        where("date", "==", today)
      );
      
      const existingDocs = await getDocs(attendanceQuery);
      if (!existingDocs.empty) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "warning",
          title: "Attendance already submitted for today",
          timer: 2000,
        });
        setSubmitting(false);
        return;
      }

      const totalWorkMinutes = calculateTotalWorkMinutes();
      const completedBreaks = breaks.filter(b => b.start && b.end);

      await addDoc(collection(db, "attendance"), {
        userId,
        userEmail,
        date: today,
        loginTime,
        logoutTime,
        breaks: completedBreaks,
        totalWorkMinutes: Math.round(totalWorkMinutes),
        createdAt: serverTimestamp(),
      });

      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Attendance submitted successfully",
        timer: 2000,
      });

      // Reset state after successful submission
      setLoginTime("");
      setLogoutTime("");
      setBreaks([]);
      setActiveBreak(null);
      setHasInitialized(false);
      onClose();
    } catch (error) {
      console.error("Error submitting attendance:", error);
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "error",
        title: "Failed to submit attendance",
        text: error.message,
        timer: 3000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    // Warn user if there's an active break
    if (activeBreak) {
      Swal.fire({
        title: "Active Break Detected",
        text: "You have an active break. Do you want to close without ending it?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, Close",
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          // User confirmed, close modal but keep state for next time
          onClose();
        }
      });
    } else {
      // No active break, safe to close
      onClose();
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
      tabIndex="-1"
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Mark Attendance</h5>
            <button
              type="button"
              className="btn-close"
              onClick={handleClose}
              disabled={submitting}
            ></button>
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label fw-bold">Login Time</label>
              <input
                type="time"
                className="form-control"
                value={loginTime}
                onChange={(e) => setLoginTime(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold">Break Section</label>
              <div className="d-flex gap-2 mb-2">
                <button
                  className="btn btn-outline-primary flex-fill"
                  onClick={handleStartBreak}
                  disabled={submitting || activeBreak !== null}
                >
                  Start Break
                </button>
                <button
                  className="btn btn-outline-danger flex-fill"
                  onClick={handleEndBreak}
                  disabled={submitting || activeBreak === null}
                >
                  End Break
                </button>
              </div>
              {activeBreak && (
                <div className="alert alert-info mb-0">
                  Break started at {activeBreak.start}
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label fw-bold">Logout Time</label>
              <input
                type="time"
                className="form-control"
                value={logoutTime}
                onChange={(e) => setLogoutTime(e.target.value)}
                disabled={submitting}
              />
            </div>

            {breaks.length > 0 && (
              <div className="mb-3">
                <label className="form-label fw-bold">Break Summary</label>
                <div className="border rounded p-2" style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {breaks.map((b, index) => (
                    <div key={index} className="small mb-1">
                      {b.start} - {b.end || "Active"}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceModal;

