// Global Notification Context
// Manages notification popups across all pages

import React, { createContext, useContext, useState, useCallback } from "react";
import NotificationPopup from "../components/NotificationPopup";

const NotificationContext = createContext();

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider");
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  const showNotification = useCallback((notification) => {
    // Generate unique ID based on notification content to prevent duplicates
    const taskId = notification.data?.taskId || "";
    const projectId = notification.data?.projectId || "";
    const timestamp = notification.data?.timestamp || Date.now();
    
    // Create unique ID: taskId + projectId + timestamp (if same task, same ID)
    const uniqueId = taskId && projectId 
      ? `${projectId}-${taskId}-${timestamp}`
      : Date.now() + Math.random();
    
    const newNotification = {
      id: uniqueId,
      ...notification,
    };

    // Prevent duplicate notifications (same taskId + projectId within 2 seconds)
    setNotifications((prev) => {
      // Check if this notification already exists (same taskId + projectId)
      if (taskId && projectId) {
        const existing = prev.find(n => {
          const nTaskId = n.data?.taskId || "";
          const nProjectId = n.data?.projectId || "";
          return nTaskId === taskId && nProjectId === projectId;
        });
        
        if (existing) {
          console.log("⚠️ Duplicate notification prevented:", taskId);
          return prev; // Don't add duplicate
        }
      }
      
      return [...prev, newNotification];
    });
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {/* Render all active notifications */}
      <div className="notification-popup-container">
        {notifications.map((notification) => (
          <NotificationPopup
            key={notification.id}
            notification={notification}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

