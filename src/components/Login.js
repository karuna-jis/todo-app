import React, { useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import googleLogo from "../img/google.png";
import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const checkEmailInFirestore = async (userEmail) => {
    const q = query(collection(db, "users"), where("email", "==", userEmail));
    const snap = await getDocs(q);
    return !snap.empty;
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const exists = await checkEmailInFirestore(user.email);

      if (!exists) {
        // alert("Your Google Account is not allowed to login!");
         Swal.fire({toast: true,position: "top-end", icon: "error", title: "Your Google Account is not allowed to login!", });
        setLoading(false);
        return;
      }

      navigate("/dashboard");
    } catch (error) {
      // alert("Google sign-in failed!");
       Swal.fire({toast: true,position: "top-end", icon: "error", title: "Google sign-in failed!", });
      setLoading(false);
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
        <h2 className="fw-bold text-center mb-3 mb-md-4 login-title-responsive">App Login</h2>

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
