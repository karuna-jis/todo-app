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

  const showNotification = useCallback((message) => {
    if (!message) return;

    const taskId = message.taskId || "";
    const projectId = message.projectId || "";
    const timestamp = message.timestamp || Date.now();
    
    const uniqueId = taskId && projectId 
      ? `${projectId}-${taskId}-${timestamp}`
      : Date.now() + Math.random();
    
    const newNotification = {
      id: uniqueId,
      notification: {
        title: message.title || "New Task Added",
        body: message.body || "",
      },
      data: {
        projectId: message.projectId || "",
        projectName: message.projectName || "",
        taskId: message.taskId || "",
        taskName: message.taskName || "",
        createdBy: message.addedBy || message.createdBy || "",
        createdByName: message.addedByName || message.createdByName || "",
        link: message.link || "",
      },
    };

    setNotifications((prev) => {
      if (taskId && projectId) {
        const existing = prev.find(n => {
          const nTaskId = n.data?.taskId || "";
          const nProjectId = n.data?.projectId || "";
          return nTaskId === taskId && nProjectId === projectId;
        });
        if (existing) return prev;
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
