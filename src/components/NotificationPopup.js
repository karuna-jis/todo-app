// WhatsApp-style Notification Popup Component
// Shows custom popup notifications at top-right corner

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NotificationPopup.css";

const NotificationPopup = ({ notification, onClose }) => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Slide in animation
    setTimeout(() => setIsVisible(true), 10);

    // Auto-close after 5 seconds
    const autoCloseTimer = setTimeout(() => {
      handleClose();
    }, 5000);

    return () => {
      clearTimeout(autoCloseTimer);
    };
  }, []);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300); // Match CSS animation duration
  };

  const handleClick = () => {
    if (notification?.data?.link) {
      // Navigate to the link
      navigate(notification.data.link);
    }
    handleClose();
  };

  if (!notification) return null;

  const title = notification.notification?.title || notification.data?.title || "New Task Created";
  const body = notification.notification?.body || notification.data?.body || "A new task has been created";
  const projectName = notification.data?.projectName || "";
  const createdByName = notification.data?.createdByName || "";

  return (
    <div
      className={`notification-popup ${isVisible && !isClosing ? "visible" : ""} ${isClosing ? "closing" : ""}`}
      onClick={handleClick}
    >
      <div className="notification-popup-content">
        <div className="notification-popup-header">
          <div className="notification-popup-icon">
            <i className="bi bi-bell-fill"></i>
          </div>
          <div className="notification-popup-title-group">
            <div className="notification-popup-title">{title}</div>
            {projectName && (
              <div className="notification-popup-project">{projectName}</div>
            )}
          </div>
          <button
            className="notification-popup-close"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            <i className="bi bi-x"></i>
          </button>
        </div>
        <div className="notification-popup-body">
          {createdByName && (
            <div className="notification-popup-author">
              <i className="bi bi-person-fill"></i> {createdByName}
            </div>
          )}
          <div className="notification-popup-message">{body}</div>
        </div>
      </div>
    </div>
  );
};

export default NotificationPopup;

