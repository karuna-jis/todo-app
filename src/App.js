import React, { useEffect, useState } from "react";
import "../node_modules/bootstrap/dist/css/bootstrap.min.css";
import "./App.css";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation
} from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./components/firebase";

import { NotificationProvider } from "./contexts/NotificationContext";
import Login from "./components/Login.js";
import Dashboard from "./components/Dashboard.js";
import ViewTaskPage from "./components/ViewTaskPage.js";
import ProjectBoard from "./components/ProjectBoard.js";
import { initializeBadge } from "./utils/badge";

// Protected Route Component - redirects to dashboard if user is authenticated
function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return null; // Or a loading spinner
  }

  // If user is authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Private Route Component - redirects to login if user is not authenticated
function PrivateRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return null; // Or a loading spinner
  }

  // If user is not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

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
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Login />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/view/:projectId/:projectName" 
            element={
              <PrivateRoute>
                <ViewTaskPage />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/board/:projectId/:projectName" 
            element={
              <PrivateRoute>
                <ProjectBoard />
              </PrivateRoute>
            } 
          />
        </Routes>
      </NotificationProvider>
    </Router>
  );
}

export default App;
