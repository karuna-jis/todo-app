// ProjectBoard.js
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { auth, db } from "./firebase.js";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  where,
  updateDoc,
  doc,
  getDocs,
  arrayUnion,
} from "firebase/firestore";
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
} from "@mui/lab";
import { Paper, Card, CardContent, Typography, Box } from "@mui/material";

export default function ProjectBoard() {
  const { projectId, projectName } = useParams();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
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

  // Helper function to format timestamp
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
    const month = date.toLocaleString("en-US", { month: "short" });
    const time = date.toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${day} ${month}, ${time}`;
  };

  // markSeen() removed - now called only when Chat button is clicked in Dashboard

  // Real-time listener for tasks
  useEffect(() => {
    if (!projectId) return;

    const tasksColPath = collection(db, "projects", projectId, "tasks");
    const q = query(
      tasksColPath,
      orderBy("createdAt", "asc")
    );

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
  }, [projectId]);

  // Filter tasks by status (case-insensitive matching)
  const pendingTasks = tasks.filter(
    (t) => t.status?.toLowerCase() === "pending"
  );
  const inProgressTasks = tasks.filter(
    (t) => t.status?.toLowerCase() === "in progress" || t.status?.toLowerCase() === "progress"
  );
  const onHoldTasks = tasks.filter(
    (t) => t.status?.toLowerCase() === "on hold" || t.status?.toLowerCase() === "onhold"
  );
  const completedTasks = tasks.filter(
    (t) => t.status?.toLowerCase() === "completed"
  );

  // Render task card
  const renderTaskCard = (task) => (
    <TimelineItem key={task.id}>
      <TimelineSeparator>
        <TimelineDot color="success" />
        <TimelineConnector />
      </TimelineSeparator>
      <TimelineContent>
        <Paper
          elevation={2}
          style={{
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "12px",
            maxWidth: "100%",
          }}
        >
          <Typography variant="body2" style={{ fontWeight: 600, marginBottom: "8px" }}>
            {task.text || "No description"}
          </Typography>
          
          <Typography variant="caption" color="text.secondary" display="block" style={{ marginBottom: "4px" }}>
            Created By: <strong>{task.createdByName || "Unknown"}</strong>
          </Typography>
          
          <Typography variant="caption" color="text.secondary" display="block" style={{ marginBottom: "4px" }}>
            Updated By: <strong>{task.updatedBy || "Unknown"}</strong>
          </Typography>
          
          <Typography variant="caption" color="text.secondary" display="block">
            {formatTs(task.updatedAt)}
          </Typography>
        </Paper>
      </TimelineContent>
    </TimelineItem>
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", padding: "20px" }}>
      {/* Header */}
      <Box
        style={{
          backgroundColor: "#2a8c7b",
          color: "white",
          padding: "16px 20px",
          marginBottom: "20px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <Typography variant="h5" style={{ fontWeight: 600, marginBottom: "4px" }}>
            Board View
          </Typography>
          <Typography variant="body2" style={{ opacity: 0.9 }}>
            {projectName || "Project"}
          </Typography>
        </div>
        <button
          onClick={() => navigate(-1)}
          style={{
            backgroundColor: "white",
            color: "#2a8c7b",
            border: "none",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            fontSize: "20px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ←
        </button>
      </Box>

      {/* Board Columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
          gap: "20px",
          minHeight: "calc(100vh - 200px)",
        }}
        className="board-columns-container"
      >
        {/* Pending Column */}
        <Card
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 200px)",
            overflow: "hidden",
          }}
        >
          <CardContent
            style={{
              backgroundColor: "#eecf6aff",
              padding: "16px",
              borderBottom: "2px solid #d4a853",
            }}
          >
            <Typography variant="h6" style={{ fontWeight: 600, color: "#856404" }}>
              Pending
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {pendingTasks.length} task{pendingTasks.length !== 1 ? "s" : ""}
            </Typography>
          </CardContent>
          <CardContent
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
            }}
          >
            {pendingTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" style={{ textAlign: "center", padding: "20px" }}>
                No pending tasks
              </Typography>
            ) : (
              <Timeline position="right">
                {pendingTasks.map((task) => renderTaskCard(task))}
              </Timeline>
            )}
          </CardContent>
        </Card>

        {/* In Progress Column */}
        <Card
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 200px)",
            overflow: "hidden",
          }}
        >
          <CardContent
            style={{
              backgroundColor: "#9bc6f3ff",
              padding: "16px",
              borderBottom: "2px solid #6ba3d4",
            }}
          >
            <Typography variant="h6" style={{ fontWeight: 600, color: "#004085" }}>
              In Progress
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {inProgressTasks.length} task{inProgressTasks.length !== 1 ? "s" : ""}
            </Typography>
          </CardContent>
          <CardContent
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
            }}
          >
            {inProgressTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" style={{ textAlign: "center", padding: "20px" }}>
                No in-progress tasks
              </Typography>
            ) : (
              <Timeline position="right">
                {inProgressTasks.map((task) => renderTaskCard(task))}
              </Timeline>
            )}
          </CardContent>
        </Card>

        {/* On Hold Column */}
        <Card
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 200px)",
            overflow: "hidden",
          }}
        >
          <CardContent
            style={{
              backgroundColor: "#ffd93dff",
              padding: "16px",
              borderBottom: "2px solid #f0c020",
            }}
          >
            <Typography variant="h6" style={{ fontWeight: 600, color: "#856404" }}>
              On Hold
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {onHoldTasks.length} task{onHoldTasks.length !== 1 ? "s" : ""}
            </Typography>
          </CardContent>
          <CardContent
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
            }}
          >
            {onHoldTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" style={{ textAlign: "center", padding: "20px" }}>
                No on-hold tasks
              </Typography>
            ) : (
              <Timeline position="right">
                {onHoldTasks.map((task) => renderTaskCard(task))}
              </Timeline>
            )}
          </CardContent>
        </Card>

        {/* Completed Column */}
        <Card
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 200px)",
            overflow: "hidden",
          }}
        >
          <CardContent
            style={{
              backgroundColor: "#9bf294ff",
              padding: "16px",
              borderBottom: "2px solid #5cb85c",
            }}
          >
            <Typography variant="h6" style={{ fontWeight: 600, color: "#155724" }}>
              Completed
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {completedTasks.length} task{completedTasks.length !== 1 ? "s" : ""}
            </Typography>
          </CardContent>
          <CardContent
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px",
            }}
          >
            {completedTasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" style={{ textAlign: "center", padding: "20px" }}>
                No completed tasks
              </Typography>
            ) : (
              <Timeline position="right">
                {completedTasks.map((task) => renderTaskCard(task))}
              </Timeline>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

