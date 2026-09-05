/**
 * KATAGA Portal Register
 *
 * Registration form with automatic participant profile creation.
 * First registered user becomes Super Administrator (auto-approved, no org required).
 * Subsequent registrations require a valid invitation code and become Pending Approval.
 */
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { formatYearLevelLabel, parseList } from "../../hooks/useAcademicConfig";
import { API_BASE_URL } from "../../config/api";
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
  const [registrationAcademicConfig, setRegistrationAcademicConfig] = useState(null);
  const [academicConfigError, setAcademicConfigError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/settings/registration`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load registration options");
        return response.json();
      })
      .then(({ settings = {} }) => {
        if (!cancelled) {
          setRegistrationAcademicConfig(settings);
          setAcademicConfigError("");
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setAcademicConfigError(loadError.message || "Failed to load academic configuration.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const serverDepartments = registrationAcademicConfig
    ? parseList(
        registrationAcademicConfig.defaultDepartments || registrationAcademicConfig.departmentOptions
      )
    : [];
  const registrationSections = registrationAcademicConfig
    ? parseList(registrationAcademicConfig.defaultSections || registrationAcademicConfig.sectionOptions)
    : [];
  const serverYearLevels = registrationAcademicConfig
    ? parseList(
        registrationAcademicConfig.positionLevels ||
          registrationAcademicConfig.yearLevelOptions
      )
    : [];
  const registrationDepartments = serverDepartments;
  const registrationYearLevels = serverYearLevels;
  const registrationYearLevelLabels = registrationYearLevels.map(formatYearLevelLabel);

  const [formData, setFormData] = useState({
    // Personal Information
    first_name: "",
    middle_name: "",
    last_name: "",
    // Account Information
    username: "",
    email: "",
    password: "",
    confirm_password: "",
    invitation_code: "",
    // Participant Information
    participant_id: "",
    gender: "",
    date_of_birth: "",
    // Academic Information
    department: "",
    category: "",
    section: "",
    // Contact Information
    contact_number: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [pending, setPending] = useState(false);

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: "" }));
    }
    if (error) setError("");
  };

  const validate = () => {
    const errors = {};

    // Personal Information
    if (!formData.first_name.trim()) {
      errors.first_name = "First name is required.";
    }
    if (!formData.middle_name.trim()) {
      errors.middle_name = "Middle name is required.";
    }
    if (!formData.last_name.trim()) {
      errors.last_name = "Last name is required.";
    }

    // Account Information
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

    // Participant Information
    if (!formData.participant_id.trim()) {
      errors.participant_id = "Participant ID is required.";
    }
    if (!formData.gender.trim()) {
      errors.gender = "Gender is required.";
    }
    if (!formData.date_of_birth.trim()) {
      errors.date_of_birth = "Date of birth is required.";
    }

    // Academic Information
    if (!registrationAcademicConfig) {
      errors.academicConfig = "Academic configuration is still loading.";
    } else if (academicConfigError) {
      errors.academicConfig = "Academic configuration could not be loaded.";
    } else if (!formData.department.trim()) {
      errors.department = "Department/Group is required.";
    } else if (!registrationDepartments.includes(formData.department.trim())) {
      errors.department = "Select a department from the configured list.";
    }
    if (!formData.category.trim()) {
      errors.category = "Category is required.";
    } else if (!registrationYearLevelLabels.includes(formData.category.trim())) {
      errors.category = "Select a category from the configured list.";
    }
    if (registrationSections.length && !registrationSections.includes(formData.section.trim())) {
      errors.section = "Select a section from the configured list.";
    }

    // Contact Information
    if (!formData.contact_number.trim()) {
      errors.contact_number = "Contact number is required.";
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
      const result = await register({
        // Personal Information
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim(),
        last_name: formData.last_name.trim(),
        // Account Information
        username: formData.username.trim(),
        email: formData.email.trim(),
        password: formData.password,
        confirm_password: formData.confirm_password,
        invitation_code: formData.invitation_code.trim(),
        // Participant Information
        participant_id: formData.participant_id.trim(),
        gender: formData.gender.trim(),
        date_of_birth: formData.date_of_birth.trim(),
        // Academic Information
        department: formData.department.trim(),
        category: formData.category.trim(),
        group_name: formData.section.trim(),
        // Contact Information
        contact_number: formData.contact_number.trim(),
      });

      if (result.pending) {
        setPending(true);
        return;
      }

      navigate("/", { replace: true });
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Registration failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTextInput = (label, name, type, placeholder, options = {}) => {
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

  const renderSelect = (label, name, options, placeholder = "Select an option") => {
    return (
      <div className="register-field">
        <label className="register-label" htmlFor={`register-${name}`}>
          {label}
        </label>
        <div className="register-inputwrap">
          <select
            id={`register-${name}`}
            name={name}
            className={`register-input ${fieldErrors[name] ? "register-input-error" : ""}`}
            value={formData[name]}
            onChange={handleChange}
            disabled={isSubmitting}
          >
            <option value="">{placeholder}</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
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
              <p className="register-subtitle">Register and create your participant profile</p>
            </div>

            {error && (
              <div className="register-alert" role="alert">
                <span className="register-alert-ic">!</span>
                <span>{error}</span>
              </div>
            )}

            <form className="register-form" onSubmit={handleSubmit} noValidate>
              {/* PERSONAL INFORMATION */}
              <div className="register-section">
                <h3 className="register-section-title">Personal Information</h3>
                <div className="register-field-row register-field-row-3">
                  {renderTextInput("First Name", "first_name", "text", "Enter your first name",
                    { autoFocus: true, autoComplete: "given-name", icon: <FiUser size={15} /> })}
                  {renderTextInput("Middle Name", "middle_name", "text", "Enter your middle name",
                    { autoComplete: "additional-name" })}
                  {renderTextInput("Last Name", "last_name", "text", "Enter your last name",
                    { autoComplete: "family-name" })}
                </div>
              </div>

              {/* ACCOUNT INFORMATION */}
              <div className="register-section">
                <h3 className="register-section-title">Account Information</h3>
                <div className="register-field-row register-field-row-2">
                  {renderTextInput("Username", "username", "text", "Choose a username",
                    { autoComplete: "username", icon: <FiUsers size={15} /> })}
                  {renderTextInput("Email", "email", "email", "Enter your email address",
                    { autoComplete: "email", icon: <FiMail size={15} /> })}
                </div>
                <div className="register-field-row register-field-row-2">
                  {renderTextInput("Password", "password", "password", "Minimum 8 characters",
                    { icon: <FiLock size={15} /> })}
                  {renderTextInput("Confirm Password", "confirm_password", "password", "Re-enter your password",
                    { icon: <FiLock size={15} /> })}
                </div>
                {renderTextInput("Invitation Code", "invitation_code", "text",
                  "Required for non-first accounts (optional for first Super Admin)",
                  { icon: <FiKey size={15} /> })}
              </div>

              {/* PARTICIPANT INFORMATION */}
              <div className="register-section">
                <h3 className="register-section-title">Participant Information</h3>
                <div className="register-field-row register-field-row-3">
                  {renderTextInput("Participant ID", "participant_id", "text", "Enter participant ID (e.g., 2026-0001)",
                    { icon: <FiUser size={15} /> })}
                  {renderSelect("Gender", "gender", ["Male", "Female", "Other"])}
                  {renderTextInput("Date of Birth", "date_of_birth", "date", "")}
                </div>
              </div>

              {/* ACADEMIC INFORMATION */}
              <div className="register-section">
                <h3 className="register-section-title">Academic Information</h3>
                {academicConfigError && <div className="register-alert" role="alert"><span className="register-alert-ic">!</span><span>{academicConfigError}</span></div>}
                {!registrationAcademicConfig && !academicConfigError && <div className="register-alert" role="status"><FiLoader className="register-spinner" size={16} /><span>Loading academic configuration...</span></div>}
                <div className="register-field-row register-field-row-2">
                  {renderSelect("Department / Group", "department",
                    registrationDepartments,
                    "Select a department")}
                  {renderSelect("Category", "category",
                    registrationYearLevelLabels,
                    "Select a year level")}
                </div>
                {registrationSections.length > 0 && <div className="register-field-row register-field-row-2">
                  {renderSelect("Section", "section", registrationSections, "Select a section")}
                </div>}
              </div>

              {/* CONTACT INFORMATION */}
              <div className="register-section">
                <h3 className="register-section-title">Contact Information</h3>
                {renderTextInput("Contact Number", "contact_number", "tel", "Enter your contact number (e.g., 09123456789)",
                  { autoComplete: "tel" })}
              </div>

              <button type="submit" className="register-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <FiLoader className="register-spinner" size={18} />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FiUserPlus size={17} />
                    Create Account & Profile
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

