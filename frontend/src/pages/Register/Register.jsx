/**
 * KATAGA Portal Register
 *
 * First registered user becomes Super Administrator (auto-approved, no org required).
 * Subsequent registrations require a valid invitation code and become Pending Approval.
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
  FiCheckCircle,
  FiClock,
  FiMail,
  FiLock,
  FiUser,
  FiUsers,
  FiKey,
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
    invitation_code: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false); // true after pending registration submitted

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

    // NOTE: The invitation code is OPTIONAL for the first registered account
    // (which becomes the sole Super Admin). The backend decides whether a code
    // is required based on whether a user already exists. If this is not the
    // first user and no code was provided, the backend returns a clear error.

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const result = await register({
        full_name: formData.full_name.trim(),
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirm_password: formData.confirm_password,
        invitation_code: formData.invitation_code.trim(),
      });

      // If the registration is pending approval, show the pending screen
      if (result.pending) {
        setPending(true);
        return;
      }

      // Otherwise (first user / Super Admin), navigate to dashboard
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
    const showState = name === "password" ? showPassword : showConfirmPassword;
    const toggleShow = name === "password"
      ? () => setShowPassword(!showPassword)
      : () => setShowConfirmPassword(!showConfirmPassword);

    return (
      <div className="register-field">
        <label className="register-label" htmlFor={`register-${name}`}>
          {label}
        </label>
        <div className="register-inputwrap">
          {options.icon && <span className="register-ic">{options.icon}</span>}
          <input
            id={`register-${name}`}
            name={name}
            type={isPassword ? (showState ? "text" : "password") : type || "text"}
            className={`register-input${fieldErrors[name] ? " register-input-error" : ""}${isPassword ? " register-passwordinput" : ""}${options.icon ? " register-input-withicon" : ""}`}
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
              className="register-passwordtoggle"
              onClick={toggleShow}
              aria-label={showState ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showState ? <FiEyeOff size={18} /> : <FiEye size={18} />}
            </button>
          )}
        </div>
        {fieldErrors[name] && (
          <span className="register-fielderror">{fieldErrors[name]}</span>
        )}
      </div>
    );
  };

  // ── Pending approval success screen ─────────────────────
  if (pending) {
    return (
      <div className="register-page">
        <div className="register-card">
          <aside className="register-panel">
            <div className="register-brand">
              <div className="register-brandmark"><span>K</span></div>
              <div className="register-brandtext">
                <h1 className="register-brandname">KATAGA Portal</h1>
                <p className="register-brandtag">Kapatiran ng Talino at Galing</p>
              </div>
            </div>
            <p className="register-panelfoot">Secure access · Administrator-managed</p>
          </aside>
          <div className="register-main">
            <div className="register-form-inner register-pending-wrap">
              <div className="register-pending-ic">
                <FiClock size={36} />
              </div>
              <h2 className="register-pending-title">Account Pending Approval</h2>
              <p className="register-pending-desc">
                Your registration has been submitted successfully. An administrator
                will review your account and assign your role before you can access
                the portal.
              </p>
              <div className="register-pending-note">
                <FiCheckCircle size={16} />
                <span>You will be able to log in once your account is approved.</span>
              </div>
              <Link to="/login" className="register-submit register-pending-link">
                <FiArrowLeft size={17} />
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="register-page">
      <div className="register-card">
        <aside className="register-panel">
          <div className="register-brand">
            <div className="register-brandmark"><span>K</span></div>
            <div className="register-brandtext">
              <h1 className="register-brandname">KATAGA Portal</h1>
              <p className="register-brandtag">Kapatiran ng Talino at Galing</p>
            </div>
          </div>

          <div className="register-about">
            <h3 className="register-about-title">Join KATAGA</h3>
            <p className="register-about-text">
              Register to become a member of the Kapatiran ng Talino at Galing
              organizational portal.
            </p>
            <div className="register-approval">
              <FiClock size={15} />
              <span>
                Your account may require <strong>administrator approval</strong>{" "}
                before you can sign in.
              </span>
            </div>
          </div>

          <p className="register-panelfoot">Secure · Invitation-based · Member Portal</p>
        </aside>

        <div className="register-main">
          <div className="register-form-inner">
            <div className="register-head">
              <Link to="/login" className="register-back">
                <FiArrowLeft size={15} />
                Back to Login
              </Link>
              <h2 className="register-title">Create Your Account</h2>
              <p className="register-subtitle">Join KATAGA and get started</p>
            </div>

            {error && (
              <div className="register-alert" role="alert">
                <span className="register-alert-ic">!</span>
                <span>{error}</span>
              </div>
            )}

            <form className="register-form" onSubmit={handleSubmit} noValidate>
              {renderField("Full Name", "full_name", "text", "Enter your full name",
                { autoFocus: true, autoComplete: "name", icon: <FiUser size={15} /> })}
              {renderField("Username", "username", "text", "Choose a username",
                { autoComplete: "username", icon: <FiUsers size={15} /> })}
              {renderField("Email", "email", "email", "Enter your email address",
                { autoComplete: "email", icon: <FiMail size={15} /> })}
              {renderField("Password", "password", "password", "Minimum 8 characters",
                { icon: <FiLock size={15} /> })}
              {renderField("Confirm Password", "confirm_password", "password", "Re-enter your password",
                { icon: <FiLock size={15} /> })}
              {renderField("Invitation Code", "invitation_code", "text",
                "Required for non-first accounts (optional for first Super Admin)",
                { icon: <FiKey size={15} /> })}
              <button type="submit" className="register-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <FiLoader className="register-spinner" size={18} />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FiUserPlus size={17} />
                    Submit Registration
                  </>
                )}
              </button>
            </form>

            <p className="register-links">
              Already have an account?{" "}
              <Link to="/login" className="register-link">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

