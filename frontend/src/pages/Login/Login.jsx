/**
 * Login Page - Smart Classroom Attendance System
 */
import { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { FiEye, FiEyeOff, FiLoader, FiLogIn } from "react-icons/fi";
import "./Login.css";

export default function Login() {
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email or username.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);

    try {
      await login(email.trim(), password, rememberMe);
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err.response?.data?.message || err.message || "Login failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-decoration" />
      <div className="login-container">
        <div className="login-branding">
          <div className="login-logo-area">
            <div className="login-logo-icon">
              <span className="login-logo-text">SA</span>
            </div>
            <h1 className="login-school-name">Smart Attendance</h1>
            <p className="login-school-subtitle">Management Platform</p>
          </div>
          <div className="login-branding-features">
            <div className="login-feature-item">
              <span className="login-feature-icon">{String.fromCharCode(10003)}</span>
              <span>Entity Management</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-icon">{String.fromCharCode(10003)}</span>
              <span>QR Code Generation</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-icon">{String.fromCharCode(10003)}</span>
              <span>Attendance Tracking</span>
            </div>
            <div className="login-feature-item">
              <span className="login-feature-icon">{String.fromCharCode(10003)}</span>
              <span>Reports &amp; Analytics</span>
            </div>
          </div>
        </div>
        <div className="login-form-panel">
          <div className="login-form-wrapper">
            <div className="login-form-header">
              <h2 className="login-form-title">Welcome Back</h2>
              <p className="login-form-subtitle">Sign in to your account to continue</p>
            </div>
            {error && (
              <div className="login-error" role="alert">
                <span className="login-error-icon">!</span>
                <span>{error}</span>
              </div>
            )}
            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="login-field">
                <label className="login-label" htmlFor="login-email">
                  Email or Username
                </label>
                <input
                  id="login-email"
                  type="text"
                  className="login-input"
                  placeholder="Enter your email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>
              <div className="login-field">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                <div className="login-password-wrapper">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="login-input login-password-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>
              <div className="login-row">
                <label className="login-checkbox-label">
                  <input
                    type="checkbox"
                    className="login-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span className="login-checkbox-text">Remember Me</span>
                </label>
              </div>
              <button
                type="submit"
                className="login-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <FiLoader className="login-spinner" size={18} />
                    Signing in...
                  </>
                ) : (
                  <>
                    <FiLogIn size={18} />
                    Sign In
                  </>
                )}
              </button>
            </form>
            <p className="login-footer-text">
              Smart Attendance Management Platform v2.0
            </p>
            <p className="login-register-link">
              Don&apos;t have an account?{" "}
              <Link to="/register" className="login-register-link-text">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
