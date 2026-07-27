/**
 * Register Page - Smart Classroom Attendance System
 *
 * First registered user becomes Super Administrator.
 * Subsequent registrations become Administrator.
 */
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  FiEye,
  FiEyeOff,
  FiLoader,
  FiUserPlus,
  FiArrowLeft,
} from "react-icons/fi";
import "./Register.css";

export default function Register() {
  const { register, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (error) setError("");
  };

  const validate = () => {
    const errors = {};

    if (!formData.full_name.trim()) {
      errors.full_name = "Full name is required.";
    }

    if (!formData.username.trim()) {
      errors.username = "Username is required.";
    } else if (!/^[a-zA-Z0-9_]{3,30}$/.test(formData.username.trim())) {
      errors.username =
        "Username must be 3-30 characters and can only contain letters, numbers, and underscores.";
    }

    if (!formData.email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    if (!formData.password) {
      errors.password = "Password is required.";
    } else if (formData.password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }

    if (!formData.confirm_password) {
      errors.confirm_password = "Please confirm your password.";
    } else if (formData.password !== formData.confirm_password) {
      errors.confirm_password = "Passwords do not match.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const user = await register({
        full_name: formData.full_name.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirm_password: formData.confirm_password,
      });
      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err.response?.data?.message ||
        err.message ||
        "Registration failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (label, name, type, placeholder, options = {}) => {
    const isPassword = type === "password";
    const showState =
      name === "password" ? showPassword : showConfirmPassword;
    const toggleShow =
      name === "password"
        ? () => setShowPassword(!showPassword)
        : () => setShowConfirmPassword(!showConfirmPassword);

    return (
      <div className="register-field">
        <label className="register-label" htmlFor={`register-${name}`}>
          {label}
        </label>
        <div className={isPassword ? "register-password-wrapper" : undefined}>
          <input
            id={`register-${name}`}
            name={name}
            type={
              isPassword ? (showState ? "text" : "password") : type || "text"
            }
            className={`register-input${fieldErrors[name] ? " register-input-error" : ""}${isPassword ? " register-password-input" : ""}`}
            placeholder={placeholder}
            value={formData[name]}
            onChange={handleChange}
            autoComplete={options.autoComplete || "off"}
            autoFocus={options.autoFocus}
            disabled={isSubmitting}
          />
          {isPassword && (
            <button
              type="button"
              className="register-password-toggle"
              onClick={toggleShow}
              aria-label={showState ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showState ? <FiEyeOff size={18} /> : <FiEye size={18} />}
            </button>
          )}
        </div>
        {fieldErrors[name] && (
          <span className="register-field-error">{fieldErrors[name]}</span>
        )}
      </div>
    );
  };

  return (
    <div className="register-page">
      <div className="register-bg-decoration" />
      <div className="register-container">
        <div className="register-branding">
          <div className="register-logo-area">
            <div className="register-logo-icon">
              <span className="register-logo-text">SA</span>
            </div>
            <h1 className="register-school-name">Smart Attendance</h1>
            <p className="register-school-subtitle">Management Platform</p>
          </div>
          <div className="register-branding-info">
            <h3 className="register-branding-title">First Account?</h3>
            <p className="register-branding-desc">
              The first registered account automatically becomes{" "}
              <strong>Super Administrator</strong> with full system access.
            </p>
            <p className="register-branding-desc">
              Subsequent accounts are created as{" "}
              <strong>Administrator</strong> by default.
            </p>
          </div>
        </div>
        <div className="register-form-panel">
          <div className="register-form-wrapper">
            <div className="register-form-header">
              <Link to="/login" className="register-back-link">
                <FiArrowLeft size={16} />
                Back to Login
              </Link>
              <h2 className="register-form-title">Create Account</h2>
              <p className="register-form-subtitle">
                Register to access the attendance management platform
              </p>
            </div>

            {error && (
              <div className="register-error" role="alert">
                <span className="register-error-icon">!</span>
                <span>{error}</span>
              </div>
            )}

            <form
              className="register-form"
              onSubmit={handleSubmit}
              noValidate
            >
              {renderField(
                "Full Name",
                "full_name",
                "text",
                "Enter your full name",
                { autoFocus: true, autoComplete: "name" }
              )}
              {renderField(
                "Username",
                "username",
                "text",
                "Choose a username",
                { autoComplete: "username" }
              )}
              {renderField(
                "Email",
                "email",
                "email",
                "Enter your email address",
                { autoComplete: "email" }
              )}
              {renderField(
                "Password",
                "password",
                "password",
                "Minimum 8 characters"
              )}
              {renderField(
                "Confirm Password",
                "confirm_password",
                "password",
                "Re-enter your password"
              )}

              <button
                type="submit"
                className="register-submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <FiLoader className="register-spinner" size={18} />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <FiUserPlus size={18} />
                    Create Account
                  </>
                )}
              </button>
            </form>

            <p className="register-footer-text">
              Already have an account?{" "}
              <Link to="/login" className="register-footer-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

