import React, { useEffect } from "react";
import "../node_modules/bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import {
  BrowserRouter as Router,
  Routes,
  Route
} from "react-router-dom";

import { NotificationProvider } from "./contexts/NotificationContext";
import Login from "./components/Login.js";
import Dashboard from "./components/Dashboard.js";
import ViewTaskPage from "./components/ViewTaskPage.js";
import ProjectBoard from "./components/ProjectBoard.js";
import { initializeBadge } from "./utils/badge";

function App() {
  // Initialize badge on app launch
  useEffect(() => {
    initializeBadge().catch((error) => {
      console.error("[App] Error initializing badge:", error);
    });
  }, []);

  return (
    <Router>
      <NotificationProvider>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/view/:projectId/:projectName" element={<ViewTaskPage />} />
          <Route path="/board/:projectId/:projectName" element={<ProjectBoard />} />
        </Routes>
      </NotificationProvider>
    </Router>
  );
}

export default App;
