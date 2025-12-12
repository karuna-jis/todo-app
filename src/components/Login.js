import React, { useState, useEffect } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import googleLogo from "../img/google.png";
import { auth, db } from "./firebase.js";
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Helper function to check if email exists in Firestore
  const checkEmailInFirestore = async (userEmail) => {
    const q = query(collection(db, "users"), where("email", "==", userEmail));
    const snap = await getDocs(q);
    return !snap.empty;
  };

  // Check if user is already authenticated (persistent login)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // User is already logged in, check if they exist in Firestore
        try {
          const exists = await checkEmailInFirestore(user.email);
          if (exists) {
            // User is authenticated and exists in Firestore, redirect to dashboard
            console.log("✅ User already authenticated, redirecting to dashboard");
            navigate("/dashboard");
          } else {
            // User authenticated but not in Firestore, sign them out
            console.log("⚠️ User not in Firestore, signing out");
            await auth.signOut();
          }
        } catch (error) {
          console.error("Error checking user in Firestore:", error);
        }
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Check for redirect result on component mount
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          setLoading(true);
          const user = result.user;
          const exists = await checkEmailInFirestore(user.email);

          if (!exists) {
            Swal.fire({
              toast: true,
              position: "top-end",
              icon: "error",
              title: "Your Google Account is not allowed to login!",
            });
            setLoading(false);
            return;
          }

          navigate("/dashboard");
        }
      } catch (error) {
        console.error("Redirect result error:", error);
        setLoading(false);
      }
    };

    checkRedirectResult();
  }, [navigate]);

  const handleGoogleLogin = async () => {
    // Prevent multiple simultaneous clicks
    if (loading) return;
    
    setLoading(true);
    const provider = new GoogleAuthProvider();
    
    // Add additional scopes if needed
    provider.addScope('profile');
    provider.addScope('email');
    
    // Set custom parameters
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    try {
      // Try popup first (better UX)
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const exists = await checkEmailInFirestore(user.email);

      if (!exists) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "error",
          title: "Your Google Account is not allowed to login!",
        });
        setLoading(false);
        await auth.signOut(); // Sign out if not authorized
        return;
      }

      navigate("/dashboard");
    } catch (error) {
      console.error("Google sign-in error:", error);
      
      // Handle specific error types
      if (error.code === 'auth/popup-blocked') {
        // Popup was blocked, fallback to redirect
        Swal.fire({
          icon: 'info',
          title: 'Popup Blocked',
          text: 'Please allow popups for this site, or we will redirect you to Google sign-in.',
          confirmButtonText: 'Continue with Redirect',
          showCancelButton: true,
          cancelButtonText: 'Cancel'
        }).then((result) => {
          if (result.isConfirmed) {
            signInWithRedirect(auth, provider);
            // Note: setLoading will be handled by redirect result check
          } else {
            setLoading(false);
          }
        });
      } else if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "info",
          title: "Sign-in cancelled",
          timer: 2000
        });
        setLoading(false);
      } else if (error.code === 'auth/network-request-failed') {
        // Network error
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "error",
          title: "Network error. Please check your connection.",
        });
        setLoading(false);
      } else if (error.code === 'auth/unauthorized-domain') {
        // Domain not authorized in Firebase Console
        Swal.fire({
          icon: 'error',
          title: 'Configuration Error',
          text: 'This domain is not authorized. Please contact the administrator.',
        });
        setLoading(false);
      } else {
        // Generic error - try redirect as fallback
        Swal.fire({
          icon: 'warning',
          title: 'Sign-in Issue',
          text: 'Popup sign-in failed. Redirecting to Google sign-in...',
          timer: 2000,
          showConfirmButton: false
        }).then(() => {
          signInWithRedirect(auth, provider);
        });
      }
    }
  };

  return (
    <div
      className="login-container-responsive"
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1f4037, #99f2c8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className="p-4 p-md-5 shadow-lg login-card-responsive"
        style={{
          width: "100%",
          maxWidth: "450px",
          borderRadius: "20px",
          backdropFilter: "blur(15px)",
          background: "rgba(255, 255, 255, 0.15)",
          border: "1px solid rgba(255, 255, 255, 0.3)",
          color: "white",
          animation: "fadeIn 0.8s ease",
        }}
      >
        <h2 className="fw-bold text-center mb-3 mb-md-4 login-title-responsive">Login</h2>

        <div className="text-center">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="btn w-100 d-flex align-items-center justify-content-center fw-bold login-button-responsive"
            style={{
              background: "rgba(255,255,255,0.9)",
              border: "none",
              padding: "12px",
              borderRadius: "12px",
              fontSize: "1.1rem",
              color: "#2a8c7b",
              transition: "0.3s",
              position: "relative",
            }}
            onMouseOver={(e) => (e.currentTarget.style.transform = "scale(1.03)")}
            onMouseOut={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {!loading ? (
              <>
                <img
                  src={googleLogo}
                  alt="Google"
                  className="google-logo-responsive"
                  style={{ width: "30px", marginRight: "15px"}}
                />
                <span className="login-button-text">Sign in with Google</span>
              </>
            ) : (
              <div
                className="spinner-border"
                role="status"
                style={{ width: "25px", height: "25px", color: "#2a8c7b" }}
              ></div>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spinLogo {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
