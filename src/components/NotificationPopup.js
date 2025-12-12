// WhatsApp-style Notification Popup Component
// Shows custom popup notifications at top-right corner

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NotificationPopup.css";
import { clearAppBadge } from "../utils/badge";

const NotificationPopup = ({ notification, onClose }) => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // Play notification sound (WhatsApp-style)
    const playNotificationSound = () => {
      try {
        // Create audio element for notification sound
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGW67+efTQ8MTqfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBhluu/nn00PDE6n4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC');
        audio.volume = 0.7; // Set volume (0.0 to 1.0)
        audio.play().catch(err => {
          console.log("Could not play notification sound:", err);
          // Fallback: Use Web Audio API for simple beep
          try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800; // Higher pitch like WhatsApp
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
          } catch (audioErr) {
            console.log("Could not play fallback sound:", audioErr);
          }
        });
      } catch (error) {
        console.log("Sound playback error:", error);
      }
    };

    // Play sound immediately when notification appears
    playNotificationSound();

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
    // Clear badge when notification is clicked
    clearAppBadge().catch((error) => {
      console.error("[NotificationPopup] Error clearing badge:", error);
    });

    if (notification?.data?.link) {
      // Navigate to the link
      navigate(notification.data.link);
    }
    handleClose();
  };

  if (!notification) return null;

  // Extract notification data - check both notification and data fields
  // FCM sends all data values as strings, so we handle them properly
  const title = notification.notification?.title || notification.data?.title || "New Task Created";
  const body = notification.notification?.body || notification.data?.body || "A new task has been created";
  const projectName = notification.data?.projectName || "";
  
  // User information - check multiple possible fields
  const createdByName = notification.data?.createdByName || notification.data?.addedByName || "";
  const createdByEmail = notification.data?.createdBy || notification.data?.addedBy || ""; // User email
  
  // Task content - check multiple possible fields
  const taskName = notification.data?.taskName || notification.data?.taskText || notification.data?.text || "";
  
  console.log("📋 NotificationPopup - Extracted data:", {
    title,
    body,
    projectName,
    createdByName,
    createdByEmail,
    taskName,
    fullData: notification.data
  });

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
          {/* Show user email and name */}
          {(createdByEmail || createdByName) && (
            <div className="notification-popup-author">
              <i className="bi bi-person-fill"></i> 
              {createdByName ? (
                <span>{createdByName} {createdByEmail && <span className="notification-popup-email">({createdByEmail})</span>}</span>
              ) : (
                <span>{createdByEmail}</span>
              )}
            </div>
          )}
          {/* Show task content */}
          <div className="notification-popup-message">
            {taskName ? (
              <>
                <strong>Task:</strong> {taskName}
              </>
            ) : (
              body
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationPopup;

