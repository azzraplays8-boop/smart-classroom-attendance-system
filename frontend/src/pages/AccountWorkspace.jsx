import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiUser,
  FiSettings,
  FiShield,
  FiSun,
  FiBell,
  FiMonitor,
  FiInfo,
  FiCheck,
  FiEdit2,
  FiKey,
  FiSmartphone,
  FiClock,
  FiLogOut,
  FiMail,
  FiAlertTriangle,
  FiBarChart2,
  FiSave,
  FiX,
  FiCode,
  FiCpu,
  FiUsers,
  FiLayers,
  FiZap,
  FiRefreshCw,
  FiTerminal,
  FiVolume2,
} from "react-icons/fi";
import "../styles/AccountWorkspace.css";
import { useAuth } from "../hooks/useAuth";
import { useSettings } from "../context/SettingsContext";
import { useOrgLabels } from "../config/labels";
import {
  APP_VERSION,
  APP_SHORT_NAME,
  APP_NAME,
  APP_TAGLINE,
} from "../constants";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  administrator: "Administrator",
  teacher: "Teacher",
};

const DEFAULT_PRIMARY_COLOR = "#4f46e5";

const PRESET_COLORS = [
  "#4f46e5", // Indigo (default)
  "#2563eb", // Blue
  "#0ea5e9", // Sky
  "#059669", // Emerald
  "#16a34a", // Green
  "#d97706", // Amber
  "#ea580c", // Orange
  "#dc2626", // Red
  "#db2777", // Pink
  "#7c3aed", // Violet
  "#0f172a", // Slate
  "#64748b", // Gray
];

// ── DOM helpers (identical pattern to Settings page) ──
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", prefersDark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

function applyPrimaryColor(color) {
  document.documentElement.style.setProperty("--primary-2", color || DEFAULT_PRIMARY_COLOR);
}

function getStoredTheme() {
  return localStorage.getItem("app_theme") || "light";
}

function getStoredPrimaryColor() {
  return localStorage.getItem("app_primaryColor") || DEFAULT_PRIMARY_COLOR;
}

// ── Section definitions ──────────────────────────────
const SECTIONS = [
  { id: "profile", label: "Profile", icon: FiUser, subtitle: "Your identity and personal details" },
  { id: "account", label: "Account Settings", icon: FiSettings, subtitle: "Username, email, language and timezone" },
  { id: "security", label: "Security", icon: FiShield, subtitle: "Password, two-factor authentication and login safety" },
  { id: "appearance", label: "Appearance", icon: FiSun, subtitle: "Theme, colors and interface preferences" },
  { id: "notifications", label: "Notifications", icon: FiBell, subtitle: "Choose what updates you receive" },
  { id: "sessions", label: "Sessions", icon: FiMonitor, subtitle: "Manage devices where you are signed in" },
  { id: "about", label: "About", icon: FiInfo, subtitle: "Application version and organization info" },
];

function AccountWorkspace() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const labels = useOrgLabels();

  const [activeSection, setActiveSection] = useState("profile");
  const [toast, setToast] = useState(null);

  // ── Profile edit state ─────────────────────────────
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    email: "",
  });

  // ── Account settings state ─────────────────────────
  const [accountForm, setAccountForm] = useState({
    username: "",
    email: "",
    language: "en",
    timezone: "(UTC+08:00) Asia/Manila",
    emailNotifs: true,
  });

  // ── Appearance state ───────────────────────────────
  const [appearance, setAppearance] = useState({
    theme: getStoredTheme(),
    primaryColor: getStoredPrimaryColor(),
    sidebarStyle: "default",
    compactMode: false,
    animations: true,
  });

  // ── Notifications state ────────────────────────────
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    attendanceAlerts: true,
    reportAlerts: true,
    announcements: false,
  });

  // ── Session/security mock data (frontend only) ─────
  const recentSessions = useMemo(
    () => [
      { id: 1, device: "Windows Desktop", browser: "Chrome 122", location: "Manila, PH", ip: "192.168.1.101", lastActive: "Active now", current: true },
      { id: 2, device: "iPhone 15", browser: "Safari 17", location: "Manila, PH", ip: "192.168.1.102", lastActive: "2 hours ago", current: false },
      { id: 3, device: "MacBook Pro", browser: "Firefox 123", location: "Quezon City, PH", ip: "192.168.1.103", lastActive: "Yesterday", current: false },
    ],
    []
  );

  const loginHistory = useMemo(
    () => [
      { id: 1, device: "Windows Desktop · Chrome", location: "Manila, PH", ip: "192.168.1.101", time: "Today, 08:42 AM", status: "success" },
      { id: 2, device: "iPhone 15 · Safari", location: "Manila, PH", ip: "192.168.1.102", time: "Yesterday, 06:15 PM", status: "success" },
      { id: 3, device: "MacBook Pro · Firefox", location: "Quezon City, PH", ip: "192.168.1.103", time: "Mar 12, 09:30 AM", status: "success" },
    ],
    []
  );

  const devices = useMemo(
    () => [
      { id: 1, name: "Windows Desktop", type: "laptop", os: "Windows 11", added: "Mar 10, 2025", current: true },
      { id: 2, name: "iPhone 15", type: "mobile", os: "iOS 17.4", added: "Feb 28, 2025", current: false },
      { id: 3, name: "MacBook Pro", type: "laptop", os: "macOS 14.3", added: "Jan 15, 2025", current: false },
    ],
    []
  );

  // ── Initialize forms from user/settings when available ──
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        fullName: prev.fullName || user.full_name || "",
        email: prev.email || user.email || "",
      }));
      setAccountForm((prev) => ({
        ...prev,
        username: prev.username || user.username || "",
        email: prev.email || user.email || "",
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (settings.language) {
      setAccountForm((prev) => ({ ...prev, language: prev.language || settings.language }));
    }
    if (settings.timezone) {
      setAccountForm((prev) => ({ ...prev, timezone: prev.timezone || settings.timezone }));
    }
    if (settings.primaryColor) {
      setAppearance((prev) => ({ ...prev, primaryColor: prev.primaryColor || settings.primaryColor }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.language, settings.timezone, settings.primaryColor]);

  // ── Toast helper ───────────────────────────────────
  const showToast = useCallback((message, kind = "success") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  if (!user) return null;

  const initials = (user.full_name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const roleLabel = ROLE_LABELS[user.role] || user.role;
  const orgName =
    settings.organizationName ||
    labels.orgLabel ||
    "—";
  const activeMeta = SECTIONS.find((s) => s.id === activeSection);

  // ── Handlers ───────────────────────────────────────
  const handleSaveProfile = () => {
    if (!profileForm.fullName.trim()) {
      showToast("Full name is required.", "error");
      return;
    }
    setEditingProfile(false);
    showToast("Profile updated successfully.");
  };

  const handleSaveAccount = () => {
    if (!accountForm.username.trim() || !accountForm.email.trim()) {
      showToast("Username and email are required.", "error");
      return;
    }
    showToast("Account settings saved.");
  };

  const handleThemeChange = (theme) => {
    setAppearance((prev) => ({ ...prev, theme }));
    applyTheme(theme);
    localStorage.setItem("app_theme", theme);
  };

  const handlePrimaryColorChange = (color) => {
    setAppearance((prev) => ({ ...prev, primaryColor: color }));
    applyPrimaryColor(color);
    localStorage.setItem("app_primaryColor", color);
  };

  const handleToggle = (setter, key) => {
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSignOutOthers = () => {
    showToast("All other devices have been signed out.");
  };

  const handleChangePassword = () => {
    showToast("Password change is handled by your administrator.");
  };

  // ── Renderers ──────────────────────────────────────
  const renderProfile = () => (
    <div className="aw-stack">
      {/* Hero identity card */}
      <div className="aw-card aw-profile-hero">
        <div className="aw-avatar aw-avatar--xl">{initials}</div>
        <div className="aw-profile-hero-info">
          <div className="aw-profile-hero-name">{user.full_name || "User"}</div>
          <div className={`aw-role-badge aw-role-badge--${user.role}`}>
            <span className="aw-role-dot" />
            {roleLabel}
          </div>
          <div className="aw-profile-hero-email">{user.email || ""}</div>
        </div>
        <button
          type="button"
          className="ui-btn ui-btn-secondary aw-edit-btn"
          onClick={() => setEditingProfile((prev) => !prev)}
        >
          <FiEdit2 size={15} />
          {editingProfile ? "Cancel" : "Edit Profile"}
        </button>
      </div>

      {editingProfile ? (
        <div className="aw-card">
          <div className="aw-card-header">
            <div className="aw-card-icon aw-card-icon--indigo"><FiEdit2 /></div>
            <div className="aw-card-heading">
              <h3 className="aw-card-title">Edit Profile</h3>
              <p className="aw-card-subtitle">Update your personal information</p>
            </div>
          </div>
          <div className="aw-card-body">
            <div className="aw-field">
              <label>Full Name</label>
              <input
                type="text"
                className="ui-input"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="Enter full name"
              />
            </div>
            <div className="aw-field">
              <label>Email Address</label>
              <input
                type="email"
                className="ui-input"
                value={profileForm.email}
                onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="Enter email"
              />
            </div>
            <div className="aw-card-actions">
              <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setEditingProfile(false)}>
                <FiX size={15} />
                Cancel
              </button>
              <button type="button" className="ui-btn ui-btn-primary" onClick={handleSaveProfile}>
                <FiSave size={15} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="aw-card">
          <div className="aw-card-header">
            <div className="aw-card-icon aw-card-icon--indigo"><FiUser /></div>
            <div className="aw-card-heading">
              <h3 className="aw-card-title">Personal Information</h3>
              <p className="aw-card-subtitle">Your account identity details</p>
            </div>
          </div>
          <div className="aw-card-body">
            <div className="aw-info-grid">
              <div className="aw-info-item">
                <span className="aw-info-label">Full Name</span>
                <span className="aw-info-value">{user.full_name || "—"}</span>
              </div>
              <div className="aw-info-item">
                <span className="aw-info-label">Email</span>
                <span className="aw-info-value">{user.email || "—"}</span>
              </div>
              <div className="aw-info-item">
                <span className="aw-info-label">Role</span>
                <span className="aw-info-value">{roleLabel}</span>
              </div>
              <div className="aw-info-item">
                <span className="aw-info-label">Organization</span>
                <span className="aw-info-value">{orgName}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderAccount = () => (
    <div className="aw-stack">
      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--blue"><FiSettings /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Account Information</h3>
            <p className="aw-card-subtitle">Manage your login identity and locale preferences</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-row">
            <div className="aw-field">
              <label>Username</label>
              <input
                type="text"
                className="ui-input"
                value={accountForm.username}
                onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Enter username"
              />
            </div>
            <div className="aw-field">
              <label>Email</label>
              <input
                type="email"
                className="ui-input"
                value={accountForm.email}
                onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="Enter email"
              />
            </div>
          </div>
          <div className="aw-row">
            <div className="aw-field">
              <label>Language</label>
              <select
                className="ui-select"
                value={accountForm.language}
                onChange={(e) => setAccountForm((f) => ({ ...f, language: e.target.value }))}
              >
                <option value="en">🇺🇸 English</option>
                <option value="fil">🇵🇭 Filipino</option>
              </select>
            </div>
            <div className="aw-field">
              <label>Timezone</label>
              <select
                className="ui-select"
                value={accountForm.timezone}
                onChange={(e) => setAccountForm((f) => ({ ...f, timezone: e.target.value }))}
              >
                <option value="(UTC+08:00) Asia/Manila">(UTC+08:00) Asia/Manila</option>
                <option value="(UTC+09:00) Tokyo">(UTC+09:00) Tokyo</option>
                <option value="(UTC+07:00) Bangkok">(UTC+07:00) Bangkok</option>
                <option value="(UTC+00:00) London">(UTC+00:00) London</option>
                <option value="(UTC-05:00) New York">(UTC-05:00) New York</option>
              </select>
            </div>
          </div>
          <div className="aw-card-actions">
            <button type="button" className="ui-btn ui-btn-primary" onClick={handleSaveAccount}>
              <FiSave size={15} />
              Save Changes
            </button>
          </div>
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--violet"><FiBell /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Notification Preferences</h3>
            <p className="aw-card-subtitle">Default preferences for new notifications</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-toggle-row">
            <div className="aw-toggle-copy">
              <span className="aw-toggle-title">Email Notifications</span>
              <span className="aw-toggle-desc">Receive email updates about your account</span>
            </div>
            <label className="aw-switch">
              <input
                type="checkbox"
                checked={accountForm.emailNotifs}
                onChange={() => setAccountForm((f) => ({ ...f, emailNotifs: !f.emailNotifs }))}
              />
              <span className="aw-switch-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div className="aw-stack">
      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--red"><FiKey /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Password &amp; Authentication</h3>
            <p className="aw-card-subtitle">Keep your account secure</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-toggle-row">
            <div className="aw-toggle-copy">
              <span className="aw-toggle-title">Change Password</span>
              <span className="aw-toggle-desc">Update the password used to sign in to your account</span>
            </div>
            <button type="button" className="ui-btn ui-btn-secondary" onClick={handleChangePassword}>
              <FiKey size={15} />
              Change Password
            </button>
          </div>
          <div className="aw-divider" />
          <div className="aw-toggle-row">
            <div className="aw-toggle-copy">
              <span className="aw-toggle-title">Two-Factor Authentication</span>
              <span className="aw-toggle-desc">Add an extra layer of security to your account</span>
            </div>
            <span className="aw-coming-soon">Coming Soon</span>
          </div>
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--green"><FiMonitor /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Active Login Sessions</h3>
            <p className="aw-card-subtitle">Devices currently signed in to your account</p>
          </div>
        </div>
        <div className="aw-card-body aw-no-gap">
          {recentSessions.map((s) => (
            <div className="aw-list-item" key={s.id}>
              <div className="aw-list-icon">
{s.current ? <FiMonitor /> : s.device.includes("iPhone") ? <FiSmartphone /> : <FiMonitor />}
              </div>
              <div className="aw-list-copy">
                <span className="aw-list-title">{s.device} {s.current && <span className="aw-current-badge">Current</span>}</span>
                <span className="aw-list-subtitle">{s.browser} · {s.location} · {s.ip}</span>
              </div>
              <span className="aw-list-meta">{s.lastActive}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--amber"><FiClock /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Recent Login History</h3>
            <p className="aw-card-subtitle">Last sign-ins to your account</p>
          </div>
        </div>
        <div className="aw-card-body aw-no-gap">
          {loginHistory.map((h) => (
            <div className="aw-list-item" key={h.id}>
              <div className="aw-list-icon aw-list-icon--success"><FiCheck /></div>
              <div className="aw-list-copy">
                <span className="aw-list-title">{h.device}</span>
                <span className="aw-list-subtitle">{h.location} · {h.ip}</span>
              </div>
              <span className="aw-list-meta">{h.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--slate"><FiSmartphone /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Device Management</h3>
            <p className="aw-card-subtitle">Manage devices that have access to your account</p>
          </div>
        </div>
        <div className="aw-card-body aw-no-gap">
          {devices.map((d) => (
            <div className="aw-list-item" key={d.id}>
              <div className="aw-list-icon">
                {d.type === "mobile" ? <FiSmartphone /> : <FiMonitor />}
              </div>
              <div className="aw-list-copy">
                <span className="aw-list-title">{d.name} {d.current && <span className="aw-current-badge">Current</span>}</span>
                <span className="aw-list-subtitle">{d.os} · Added {d.added}</span>
              </div>
              {!d.current && (
                <button type="button" className="aw-link-btn" onClick={() => showToast(`${d.name} has been removed.`)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div className="aw-stack">
      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--violet"><FiSun /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Theme</h3>
            <p className="aw-card-subtitle">Choose how the application looks</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-field">
            <label>Theme Mode</label>
            <div className="aw-theme-grid">
              {[
                { value: "light", icon: "☀️", label: "Light", desc: "Bright and clean" },
                { value: "dark", icon: "🌙", label: "Dark", desc: "Low-glare interface" },
                { value: "system", icon: "💻", label: "System", desc: "Match your device" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`aw-theme-card${appearance.theme === opt.value ? " selected" : ""}`}
                  onClick={() => handleThemeChange(opt.value)}
                >
                  <div className="aw-theme-preview" data-preview={opt.value}>
                    <span className="aw-theme-icon">{opt.icon}</span>
                    <span className="aw-theme-swatch" />
                  </div>
                  <div className="aw-theme-meta">
                    <span className="aw-theme-label">{opt.label}</span>
                    <span className="aw-theme-desc">{opt.desc}</span>
                  </div>
                  {appearance.theme === opt.value && (
                    <span className="aw-theme-check"><FiCheck /></span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="aw-field">
            <label>Primary Color</label>
            <div className="aw-swatches">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`aw-swatch${appearance.primaryColor.toLowerCase() === color.toLowerCase() ? " selected" : ""}`}
                  style={{ background: color }}
                  onClick={() => handlePrimaryColorChange(color)}
                  aria-label={color}
                >
                  {appearance.primaryColor.toLowerCase() === color.toLowerCase() && <FiCheck />}
                </button>
              ))}
              <label className={`aw-swatch aw-swatch--custom${!PRESET_COLORS.some((c) => c.toLowerCase() === appearance.primaryColor.toLowerCase()) ? " selected" : ""}`}>
                <span>🎨</span>
                <input
                  type="color"
                  value={appearance.primaryColor}
                  onChange={(e) => handlePrimaryColorChange(e.target.value)}
                  aria-label="Custom color"
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--indigo"><FiLayers /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Layout &amp; Interface</h3>
            <p className="aw-card-subtitle">Adjust navigation and density</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-field">
            <label>Sidebar Style</label>
            <div className="aw-sidebar-style-grid">
              {[
                { value: "default", label: "Default", icon: "▦" },
                { value: "compact", label: "Compact", icon: "▤" },
                { value: "minimal", label: "Minimal", icon: "▣" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`aw-style-card${appearance.sidebarStyle === opt.value ? " selected" : ""}`}
                  onClick={() => setAppearance((p) => ({ ...p, sidebarStyle: opt.value }))}
                >
                  <span className="aw-style-icon">{opt.icon}</span>
                  <span className="aw-style-label">{opt.label}</span>
                  {appearance.sidebarStyle === opt.value && <FiCheck className="aw-style-check" />}
                </button>
              ))}
            </div>
          </div>
          <div className="aw-toggle-row">
            <div className="aw-toggle-copy">
              <span className="aw-toggle-title">Compact Mode</span>
              <span className="aw-toggle-desc">Reduce spacing to fit more content</span>
            </div>
            <label className="aw-switch">
              <input
                type="checkbox"
                checked={appearance.compactMode}
                onChange={() => handleToggle(setAppearance, "compactMode")}
              />
              <span className="aw-switch-slider" />
            </label>
          </div>
          <div className="aw-toggle-row">
            <div className="aw-toggle-copy">
              <span className="aw-toggle-title">Animations</span>
              <span className="aw-toggle-desc">Enable smooth transitions and effects</span>
            </div>
            <label className="aw-switch">
              <input
                type="checkbox"
                checked={appearance.animations}
                onChange={() => handleToggle(setAppearance, "animations")}
              />
              <span className="aw-switch-slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="aw-card">
      <div className="aw-card-header">
        <div className="aw-card-icon aw-card-icon--green"><FiBell /></div>
        <div className="aw-card-heading">
          <h3 className="aw-card-title">Notification Settings</h3>
          <p className="aw-card-subtitle">Choose what updates you want to receive</p>
        </div>
      </div>
      <div className="aw-card-body">
        <div className="aw-toggle-row">
          <div className="aw-toggle-copy">
            <span className="aw-toggle-title"><FiMail className="aw-toggle-icon" /> Email Notifications</span>
            <span className="aw-toggle-desc">Account and system updates via email</span>
          </div>
          <label className="aw-switch">
            <input
              type="checkbox"
              checked={notifications.emailNotifications}
              onChange={() => handleToggle(setNotifications, "emailNotifications")}
            />
            <span className="aw-switch-slider" />
          </label>
        </div>
        <div className="aw-divider" />
        <div className="aw-toggle-row">
          <div className="aw-toggle-copy">
            <span className="aw-toggle-title"><FiAlertTriangle className="aw-toggle-icon" /> Attendance Alerts</span>
            <span className="aw-toggle-desc">Get notified when attendance is marked</span>
          </div>
          <label className="aw-switch">
            <input
              type="checkbox"
              checked={notifications.attendanceAlerts}
              onChange={() => handleToggle(setNotifications, "attendanceAlerts")}
            />
            <span className="aw-switch-slider" />
          </label>
        </div>
        <div className="aw-divider" />
        <div className="aw-toggle-row">
          <div className="aw-toggle-copy">
            <span className="aw-toggle-title"><FiBarChart2 className="aw-toggle-icon" /> Report Alerts</span>
            <span className="aw-toggle-desc">Receive reports and analytics updates</span>
          </div>
          <label className="aw-switch">
            <input
              type="checkbox"
              checked={notifications.reportAlerts}
              onChange={() => handleToggle(setNotifications, "reportAlerts")}
            />
            <span className="aw-switch-slider" />
          </label>
        </div>
        <div className="aw-divider" />
        <div className="aw-toggle-row">
          <div className="aw-toggle-copy">
            <span className="aw-toggle-title"><FiVolume2 className="aw-toggle-icon" /> Announcements</span>
            <span className="aw-toggle-desc">System announcements and updates</span>
          </div>
          <label className="aw-switch">
            <input
              type="checkbox"
              checked={notifications.announcements}
              onChange={() => handleToggle(setNotifications, "announcements")}
            />
            <span className="aw-switch-slider" />
          </label>
        </div>
      </div>
    </div>
  );

  const renderSessions = () => (
    <div className="aw-stack">
      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--green"><FiMonitor /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Current Device</h3>
            <p className="aw-card-subtitle">The device you are currently using</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-current-device-card">
            <div className="aw-current-device-icon">
              <FiMonitor size={32} />
            </div>
            <div className="aw-current-device-info">
              <span className="aw-current-device-name">This Device</span>
              <span className="aw-current-device-detail">Windows 11 · Chrome 122</span>
              <span className="aw-current-device-detail">Manila, PH · 192.168.1.101</span>
            </div>
            <span className="aw-current-badge aw-current-badge--lg">Active Now</span>
          </div>
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--amber"><FiSmartphone /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">Other Logged-In Devices</h3>
            <p className="aw-card-subtitle">Devices with access to your account</p>
          </div>
        </div>
        <div className="aw-card-body aw-no-gap">
          {devices.filter((d) => !d.current).map((d) => (
            <div className="aw-list-item" key={d.id}>
              <div className="aw-list-icon">
                {d.type === "mobile" ? <FiSmartphone /> : <FiMonitor />}
              </div>
              <div className="aw-list-copy">
                <span className="aw-list-title">{d.name}</span>
                <span className="aw-list-subtitle">{d.os} · Added {d.added}</span>
              </div>
              <button type="button" className="aw-link-btn" onClick={() => showToast(`${d.name} has been removed.`)}>
                Remove
              </button>
            </div>
          ))}
          {devices.filter((d) => !d.current).length === 0 && (
            <div className="aw-empty-state">No other devices logged in.</div>
          )}
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-body">
          <button type="button" className="ui-btn ui-btn-danger aw-sign-out-btn" onClick={handleSignOutOthers}>
            <FiLogOut size={15} />
            Sign Out from All Other Devices
          </button>
        </div>
      </div>
    </div>
  );

  const renderAbout = () => (
    <div className="aw-stack">
      <div className="aw-card">
        <div className="aw-card-header">
          <div className="aw-card-icon aw-card-icon--indigo"><FiInfo /></div>
          <div className="aw-card-heading">
            <h3 className="aw-card-title">About {APP_NAME}</h3>
            <p className="aw-card-subtitle">Application details and credits</p>
          </div>
        </div>
        <div className="aw-card-body">
          <div className="aw-about-grid">
            <div className="aw-about-item">
              <FiCode className="aw-about-icon" />
              <div className="aw-about-content">
                <span className="aw-about-label">Application Version</span>
                <span className="aw-about-value">{APP_VERSION}</span>
              </div>
            </div>
            <div className="aw-about-item">
              <FiCpu className="aw-about-icon" />
              <div className="aw-about-content">
                <span className="aw-about-label">Build Number</span>
                <span className="aw-about-value">2025.03.14</span>
              </div>
            </div>
            <div className="aw-about-item">
              <FiUsers className="aw-about-icon" />
              <div className="aw-about-content">
                <span className="aw-about-label">Organization</span>
                <span className="aw-about-value">{orgName}</span>
              </div>
            </div>
            <div className="aw-about-item">
              <FiZap className="aw-about-icon" />
              <div className="aw-about-content">
                <span className="aw-about-label">Developer Credits</span>
                <span className="aw-about-value">Built with ❤️ by the {APP_SHORT_NAME} Team</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-body aw-about-footer">
          <div className="aw-about-footer-brand">
            <span className="aw-about-footer-name">{APP_NAME}</span>
            <span className="aw-about-footer-tagline">{APP_TAGLINE}</span>
          </div>
          <span className="aw-about-footer-copy">© {new Date().getFullYear()} {APP_SHORT_NAME}. All rights reserved.</span>
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "profile": return renderProfile();
      case "account": return renderAccount();
      case "security": return renderSecurity();
      case "appearance": return renderAppearance();
      case "notifications": return renderNotifications();
      case "sessions": return renderSessions();
      case "about": return renderAbout();
      default: return renderProfile();
    }
  };

  // ── Main Render ────────────────────────────────────
  return (
    <div className="aw-page">
      {toast && (
        <div className={`aw-toast aw-toast--${toast.kind}`}>
          <span className="aw-toast-icon">{toast.kind === "success" ? "✓" : "✕"}</span>
          <span className="aw-toast-message">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="aw-hero">
        <div className="aw-hero-avatar">{initials}</div>
        <div className="aw-hero-text">
          <h2 className="aw-hero-title">Account Workspace</h2>
          <p className="aw-hero-subtitle">
            Manage your profile, preferences, security, and more.
          </p>
        </div>
      </div>

      <div className="aw-layout">
        {/* Left sidebar nav */}
        <aside className="aw-nav">
          <nav className="aw-nav-inner" aria-label="Account sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`aw-nav-item${activeSection === s.id ? " active" : ""}`}
                  onClick={() => setActiveSection(s.id)}
                >
                  <span className="aw-nav-icon"><Icon /></span>
                  <span className="aw-nav-label">{s.label}</span>
                  {activeSection === s.id && <span className="aw-nav-indicator" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right content */}
        <section className="aw-content">
          <div className="aw-content-header">
            <h3 className="aw-content-title">{activeMeta.label}</h3>
            <p className="aw-content-subtitle">{activeMeta.subtitle}</p>
          </div>
          {renderSection()}
        </section>
      </div>
    </div>
  );
}

export default AccountWorkspace;
