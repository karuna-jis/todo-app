import React from "react";
import "../node_modules/bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useNavigate
} from "react-router-dom";

import { NotificationProvider } from "./contexts/NotificationContext";
import Login from "./components/Login.js";
import Dashboard from "./components/Dashboard.js";
import ViewTaskPage from "./components/ViewTaskPage.js";
import ProjectBoard from "./components/ProjectBoard.js";

function App() {
  return (
    <NotificationProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/view/:projectId/:projectName" element={<ViewTaskPage />} />
          <Route path="/board/:projectId/:projectName" element={<ProjectBoard />} />
        </Routes>
      </Router>
    </NotificationProvider>
  );
}

export default App;
