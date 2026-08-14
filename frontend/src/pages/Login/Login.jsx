/**
 * KATAGA Portal Login
 */
import { useState } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  FiEye,
  FiEyeOff,
  FiLoader,
  FiLogIn,
  FiMail,
  FiLock,
  FiUsers,
  FiShield,
  FiCalendar,
  FiClipboard,
  FiBarChart2,
} from "react-icons/fi";
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
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const features = [
    { icon: <FiUsers size={17} />, label: "Member Management" },
    { icon: <FiShield size={17} />, label: "Officer Management" },
    { icon: <FiCalendar size={17} />, label: "Activities & Events" },
    { icon: <FiClipboard size={17} />, label: "Attendance & Participation" },
    { icon: <FiBarChart2 size={17} />, label: "Reports & Records" },
  ];

  return (
    <div className="login-page">
      <div className="login-bg-decoration" />
      <div className="login-card">
        {/* ── Left branding panel ── */}
        <div className="login-branding">
          <div className="login-brandhead">
            <div className="login-brandmark">
              <span>K</span>
            </div>
            <div className="login-brandtext">
              <h1 className="login-brandname">KATAGA Portal</h1>
              <p className="login-brandtagline">Kapatiran ng Talino at Galing</p>
            </div>
          </div>

          <div className="login-branddivider" />

          <div className="login-featurelist">
            <p className="login-featureheading">Organization Management Platform</p>
            {features.map((feature, i) => (
              <div className="login-feature" key={i}>
                <span className="login-featureicon">{feature.icon}</span>
                <span className="login-featurelabel">{feature.label}</span>
              </div>
            ))}
          </div>

          <p className="login-brandfoot">
            Secure member access · Administrator approval
          </p>
        </div>

        {/* ── Right form panel ── */}
        <div className="login-formpanel">
          <div className="login-formwrapper">
            <div className="login-formhead">
              <h2 className="login-formtitle">Welcome Back</h2>
              <p className="login-formsubtitle">
                Sign in to your KATAGA Portal account
              </p>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <span className="login-erroricon">!</span>
                <span>{error}</span>
              </div>
            )}

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <div className="login-field">
                <label className="login-label" htmlFor="login-email">
                  Email or Username
                </label>
                <div className="login-inputwrap">
                  <FiMail className="login-inputicon" size={18} />
                  <input
                    id="login-email"
                    type="text"
                    className="login-input login-inputwithicon"
                    placeholder="Enter your email or username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="login-field">
                <label className="login-label" htmlFor="login-password">
                  Password
                </label>
                <div className="login-inputwrap">
                  <FiLock className="login-inputicon" size={18} />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    className="login-input login-inputwithicon login-passwordinput"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="login-passwordtoggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>

              <div className="login-row">
                <label className="login-checkboxlabel">
                  <input
                    type="checkbox"
                    className="login-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span>Remember Me</span>
                </label>
              </div>

              <button
                type="submit"
                className="login-submitbtn"
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

            <p className="login-registerlink">
              Don&apos;t have an account?{" "}
              <Link to="/register" className="login-registerlink-text">
                Create one
              </Link>
            </p>
            <p className="login-footnote">
              KATAGA Portal · Organizational Management System
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

