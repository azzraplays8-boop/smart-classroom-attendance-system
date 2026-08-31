/* ═══════════════════════════════════════════════════════════
   KATAGA Portal - Organization Settings
   KATAGA Portal organization management dashboard.
   Frontend UI/UX only. All backend logic, APIs, save, upload, and
   localStorage behavior preserved exactly as-is.
   ═══════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaBuilding,
  FaClock,
  FaGraduationCap,
  FaQrcode,
  FaPalette,
  FaBell,
  FaCog,
  FaDatabase,
  FaUserShield,
  FaCheck,
  FaUpload,
  FaTrash,
  FaGlobe,
  FaRegClock,
  FaHourglassHalf,
  FaUserCheck,
  FaPhoneAlt,
  FaEnvelope,
  FaGlobeAsia,
  FaStamp,
  FaCalendarAlt,
FaFileImport,
  FaFileExport,
  FaExclamationTriangle,
  FaSyncAlt,
  FaMapMarkerAlt,
  FaUserLock,
  FaUserEdit,
  FaCalendarWeek,
  FaCopy,
  FaCheckCircle,
  FaDownload,
  FaUndo,
  FaServer,
  FaIdCard,
  FaLayerGroup,
  FaBolt,
  FaInfoCircle,
} from "react-icons/fa";
import "../styles/Settings.css";
import translations from "../data/translations.js";
import { useOrgLabels } from "../config/labels";
import { useSettings } from "../context/SettingsContext";
import { APP_VERSION } from "../constants";
import { authFetch } from "../services/apiClient";
import UserManagement from "./UserManagement";

const DEFAULT_PRIMARY_COLOR = "#4f46e5";
const LOCAL_PREFS_KEY = "app_system_prefs";

const PRESET_COLORS = [
  "#4f46e5", "#2563eb", "#0ea5e9", "#059669", "#16a34a",
  "#d97706", "#ea580c", "#dc2626", "#db2777", "#7c3aed",
  "#0f172a", "#64748b",
];

/**
 * Persisted settings — sent to the existing PUT /settings endpoint.
 * The backend route upserts any keys it receives, so adding new fields
 * is safe without touching backend code.
 */
const DEFAULT_SETTINGS = {
  orgName: "", orgLogo: "", orgAddress: "", orgEmail: "", orgContact: "", orgWebsite: "",
  attendanceStartTime: "07:30", lateCutoffTime: "08:00", attendanceEndTime: "17:00",
  autoMarkAbsent: true, timezone: "(UTC+08:00) Asia/Manila", gracePeriod: "None", attendanceMode: "QR + Manual",
  orgYear: "", semester: "1st", defaultDepartments: "", defaultCourses: "", defaultSections: "",
  studentNumberFormat: "", positionLevels: "", dateFormat: "YYYY-MM-DD", timeFormat: "h:mm A",
  maintenanceMode: false, autoBackup: true, logRetention: "30 days",
  systemName: "", footerText: "",
  theme: "light", primaryColor: DEFAULT_PRIMARY_COLOR, language: "en",
};

/**
 * Frontend-only preferences — persisted to localStorage ONLY.
 * Never sent to any API. Used for QR, notifications and brand-asset placeholders.
 */
const DEFAULT_LOCAL_PREFS = {
  qrTheme: "default", qrRefreshInterval: "60", qrType: "dynamic", qrLogoOnQR: true,
  qrErrorCorrection: "M", qrSize: "300", qrScreenshotProtection: false,
  notifAttendanceAlerts: true, notifLateAlerts: true, notifAbsentAlerts: true,
  notifEmailNotifications: false, notifSystemUpdates: true, notifPushNotifications: false,
  sidebarLogo: "", favicon: "", loginBackground: "",
};

// ── DOM helpers ─────────────────────────────────────────
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.setAttribute("data-theme", window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}
function applyPrimaryColor(color) {
  document.documentElement.style.setProperty("--primary-2", color);
}
function getThemeFromStorage() { return localStorage.getItem("app_theme"); }
function getPrimaryColorFromStorage() { return localStorage.getItem("app_primaryColor"); }
function getLanguageFromStorage() { return localStorage.getItem("app_language"); }

let systemThemeListener = null;
function setupSystemThemeListener(callback) {
  if (systemThemeListener) systemThemeListener.mql.removeEventListener("change", systemThemeListener.handler);
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e) => callback(e.matches ? "dark" : "light");
  mql.addEventListener("change", handler);
  systemThemeListener = { mql, handler };
}
function teardownSystemThemeListener() {
  if (systemThemeListener) {
    systemThemeListener.mql.removeEventListener("change", systemThemeListener.handler);
    systemThemeListener = null;
  }
}

// ── Section definitions ─────────────────────────────────
const SECTIONS = [
  { id: "organization", label: "Organization", subtitle: "Identity, contact and academic term", icon: FaBuilding },
  { id: "attendance", label: "Attendance Rules", subtitle: "Windows, grace periods and marking rules", icon: FaClock },
  { id: "academic", label: "Academic Configuration", subtitle: "Departments, courses, sections and formats", icon: FaGraduationCap },
  { id: "qr", label: "QR Attendance", subtitle: "QR behavior, theme and security", icon: FaQrcode },
  { id: "branding", label: "Branding", subtitle: "Theme, colors, language and brand assets", icon: FaPalette },
  { id: "notifications", label: "Notifications", subtitle: "Alert and notification preferences", icon: FaBell },
  { id: "system", label: "System", subtitle: "Formats, maintenance and storage", icon: FaCog },
  { id: "backup", label: "Backup & Restore", subtitle: "Export, import and restore settings", icon: FaDatabase },
  { id: "roles", label: "User Roles", subtitle: "Role management and permissions", icon: FaUserShield },
];

const FUTURE_ATTENDANCE_FEATURES = [
  { icon: FaHourglassHalf, title: "QR Expiration Time", desc: "Auto-invalidate QR codes after a set duration" },
  { icon: FaCopy, title: "Duplicate Scan Protection", desc: "Block multiple scans from the same code" },
  { icon: FaMapMarkerAlt, title: "GPS Verification", desc: "Restrict check-in to a geographic radius" },
  { icon: FaUserLock, title: "Face Verification", desc: "Biometric identity confirmation on scan" },
  { icon: FaUserEdit, title: "Manual Override", desc: "Allow authorized manual time adjustments" },
  { icon: FaCalendarWeek, title: "Weekend Attendance", desc: "Enable attendance on Saturdays and Sundays" },
  { icon: FaCalendarAlt, title: "Holiday Attendance", desc: "Define holiday schedules and exceptions" },
];

const NOTIF_OPTIONS = [
  { key: "notifAttendanceAlerts", icon: FaCheckCircle, title: "Attendance Alerts", desc: "Notify when attendance records are created or updated" },
  { key: "notifLateAlerts", icon: FaClock, title: "Late Alerts", desc: "Notify when participants are marked late" },
  { key: "notifAbsentAlerts", icon: FaExclamationTriangle, title: "Absent Alerts", desc: "Notify when participants are marked absent" },
  { key: "notifEmailNotifications", icon: FaEnvelope, title: "Email Notifications", desc: "Send summaries and alerts via email" },
  { key: "notifSystemUpdates", icon: FaSyncAlt, title: "System Updates", desc: "Announce maintenance and new features" },
  { key: "notifPushNotifications", icon: FaBell, title: "Push Notifications", desc: "Deliver real-time alerts to connected devices" },
];

function normalizeAcademicSettingsForStorage(rawSettings = {}) {
  const readListValue = (...values) => {
    for (const value of values) {
      if (value == null) continue;
      const entries = Array.isArray(value) ? value : String(value).split(",");
      const cleaned = entries
        .map((entry) => String(entry).trim())
        .filter(Boolean);
      if (cleaned.length) return cleaned.join(", ");
    }
    return "";
  };

  const academicYear = rawSettings.academicYear ?? rawSettings.schoolYear ?? rawSettings.orgYear ?? "";
  const semester = rawSettings.semester ?? rawSettings.academicSemester ?? "1st";
  // IMPORTANT: the fields the Settings form actually edits (defaultDepartments,
  // defaultSections, positionLevels, defaultCourses) MUST take priority over
  // their mirror fields (departmentOptions, sectionOptions, yearLevelOptions).
  // The mirror fields are only fallbacks for legacy saved data — otherwise the
  // stale mirror value silently overwrites the user's new edits on save.
  const departmentValue = readListValue(
    rawSettings.defaultDepartments,
    rawSettings.departmentOptions,
    rawSettings.defaultCourses,
    rawSettings.courseOptions
  );
  const sectionValue = readListValue(rawSettings.defaultSections, rawSettings.sectionOptions);
  const yearValue = readListValue(rawSettings.positionLevels, rawSettings.yearLevelOptions);

  return {
    ...rawSettings,
    academicYear,
    orgYear: academicYear,
    semester,
    departmentOptions: departmentValue,
    defaultDepartments: departmentValue,
    courseOptions: readListValue(rawSettings.defaultCourses, rawSettings.courseOptions),
    defaultCourses: readListValue(rawSettings.defaultCourses, rawSettings.courseOptions),
    sectionOptions: sectionValue,
    defaultSections: sectionValue,
    // Keep yearLevelOptions as a plain comma-separated STRING so it round-trips
    // through the backend settings table (which stores values as strings)
    // without losing data.
    yearLevelOptions: yearValue,
    positionLevels: yearValue,
  };
}

function Settings() {
  const orgLabels = useOrgLabels();
  const { refreshSettings } = useSettings();

  // ── State ──────────────────────────────────────────────
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [localPrefs, setLocalPrefs] = useState(() => {
    try {
      const stored = localStorage.getItem(LOCAL_PREFS_KEY);
      if (stored) return { ...DEFAULT_LOCAL_PREFS, ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return { ...DEFAULT_LOCAL_PREFS };
  });
  const [activeSection, setActiveSection] = useState("organization");
  const [saving, setSaving] = useState({});
  const [toast, setToast] = useState({ kind: "success", message: "", visible: false });

  const fileInputRef = useRef(null);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ── Dirty tracking ────────────────────────────────────
  const isDirty = useMemo(() => {
    if (!savedSnapshot) return false;
    return JSON.stringify(settings) !== JSON.stringify(savedSnapshot);
  }, [settings, savedSnapshot]);

  // ── Toast ──────────────────────────────────────────────
  const showToast = useCallback((kind, message) => {
    setToast({ kind, message, visible: true });
    window.setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 2800);
  }, []);

  // ── Apply local preferences immediately ───────────────
  const applyLocalPreferences = useCallback((prefs) => {
    if (prefs.theme) {
      applyTheme(prefs.theme);
      localStorage.setItem("app_theme", prefs.theme);
      if (prefs.theme === "system") {
        setupSystemThemeListener(() => applyTheme("system"));
      } else {
        teardownSystemThemeListener();
      }
    }
    if (prefs.primaryColor) {
      applyPrimaryColor(prefs.primaryColor);
      localStorage.setItem("app_primaryColor", prefs.primaryColor);
    }
    if (prefs.language) {
      localStorage.setItem("app_language", prefs.language);
    }
  }, []);

  // ── Load settings ──────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setLoading(true);
    const storedTheme = getThemeFromStorage();
    const storedColor = getPrimaryColorFromStorage();
    const storedLang = getLanguageFromStorage();

    if (storedTheme || storedColor || storedLang) {
      const p = {};
      if (storedTheme) p.theme = storedTheme;
      if (storedColor) p.primaryColor = storedColor;
      if (storedLang) p.language = storedLang;
      applyLocalPreferences(p);
    }

    try {
      const res = await authFetch("/settings");
      const data = await res.json();
      if (res.ok && data.settings) {
        const mergedTheme = data.settings.theme || storedTheme || "light";
        const mergedColor = data.settings.primaryColor || storedColor || DEFAULT_PRIMARY_COLOR;
        const mergedLang = data.settings.language || storedLang || "en";
        const baseSettings = normalizeAcademicSettingsForStorage({ ...settingsRef.current, ...data.settings });
        const next = {
          ...settingsRef.current,
          ...baseSettings,
          autoMarkAbsent: data.settings.autoMarkAbsent === "true" || data.settings.autoMarkAbsent === true,
          maintenanceMode: data.settings.maintenanceMode === "true" || data.settings.maintenanceMode === true,
          autoBackup: data.settings.autoBackup === "true" || data.settings.autoBackup === true,
          theme: mergedTheme,
          primaryColor: mergedColor,
          language: mergedLang,
        };
        setSettings(next);
        setSavedSnapshot(next);
        // Sync academic config to the global SettingsContext localStorage
        // so that ALL pages (Participant forms, reports, viewer pages, etc.)
        // pick up the updated values immediately.
        try {
          const storageCopy = { ...next };
          localStorage.setItem("app_org_settings", JSON.stringify(storageCopy));
        } catch {
          // ignore localStorage errors
        }
        applyLocalPreferences({ theme: mergedTheme, primaryColor: mergedColor, language: mergedLang });
      } else {
        const fallbackTheme = storedTheme || "light";
        const fallbackColor = storedColor || DEFAULT_PRIMARY_COLOR;
        const fallbackLang = storedLang || "en";
        applyLocalPreferences({ theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang });
        const next = { ...settingsRef.current, theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang };
        setSettings(next);
        setSavedSnapshot(next);
      }
    } catch {
      const fallbackTheme = storedTheme || "light";
      const fallbackColor = storedColor || DEFAULT_PRIMARY_COLOR;
      const fallbackLang = storedLang || "en";
      applyLocalPreferences({ theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang });
      const next = { ...settingsRef.current, theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang };
      setSettings(next);
      setSavedSnapshot(next);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyLocalPreferences]);

  useEffect(() => {
    loadSettings();
    return () => { teardownSystemThemeListener(); };
  }, [loadSettings]);

  // ── Save (existing logic preserved) ────────────────────
  const handleSave = async (sectionKeys) => {
    // Required field validation (preserved)
    const requiredFields = ["orgName", "orgAddress", "orgYear"];
    for (const key of requiredFields) {
      if (sectionKeys.includes(key) && !settings[key]?.trim()) {
        const fieldLabels = { orgName: "Organization Name", orgAddress: "Organization Address", orgYear: "Year / Term" };
        showToast("error", `${fieldLabels[key] || key} is required.`);
        return;
      }
    }

    const normalizedSettings = normalizeAcademicSettingsForStorage(settings);
    const payload = {};
    for (const key of sectionKeys) {
      payload[key] = normalizedSettings[key];
    }

    const savingKey = sectionKeys.length >= 10 ? "all" : sectionKeys[0];
    setSaving((prev) => ({ ...prev, [savingKey]: true }));
    try {
      const res = await authFetch("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save");
      showToast("success", "Settings saved successfully.");
      const canonicalSettings = normalizeAcademicSettingsForStorage(settings);
      setSavedSnapshot(canonicalSettings);
      await loadSettings();
      // Also immediately sync the updated academic config to the global
      // SettingsContext localStorage so that all pages (Participant forms,
      // reports, viewer pages, etc.) pick up the new values right away,
      // including after navigating away and back.
      try {
        localStorage.setItem("app_org_settings", JSON.stringify(canonicalSettings));
      } catch {
        // ignore localStorage errors
      }
      // Refresh the global SettingsContext so that all pages (Participant forms,
      // reports, viewer pages, etc.) immediately use the updated configuration.
      try {
        refreshSettings();
      } catch {
        // ignore refresh errors
      }
    } catch (err) {
      showToast("error", err?.message || "Failed to save settings.");
      console.error("[Settings Save Error]", err);
    } finally {
      setSaving((prev) => ({ ...prev, [savingKey]: false }));
    }
  };

  // ── Cancel (revert to last saved) ─────────────────────
  const handleCancel = () => {
    if (!savedSnapshot) return;
    const next = { ...savedSnapshot };
    setSettings(next);
    applyLocalPreferences({ theme: next.theme, primaryColor: next.primaryColor, language: next.language });
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("success", "Changes reverted.");
  };

  // ── Logo upload ───────────────────────────────────────
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setSettings((prev) => ({ ...prev, orgLogo: event.target.result }));
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setSettings((prev) => ({ ...prev, orgLogo: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Field change handler ──────────────────────────────
  const handleChange = (key, value) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      if (key === "theme") {
        applyTheme(value);
        localStorage.setItem("app_theme", value);
        if (value === "system") {
          setupSystemThemeListener(() => applyTheme("system"));
        } else {
          teardownSystemThemeListener();
        }
      }
      if (key === "primaryColor") {
        applyPrimaryColor(value);
        localStorage.setItem("app_primaryColor", value);
      }
      if (key === "language") {
        localStorage.setItem("app_language", value);
      }
      return updated;
    });
  };

  // ── Local preference change handler ───────────────────
  const handleLocalPrefChange = (key, value) => {
    setLocalPrefs((prev) => {
      const updated = { ...prev, [key]: value };
      localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  // ── Backup & Restore handlers ─────────────────────────
  const handleExportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "Settings exported successfully.");
  };

  const handleImportSettings = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          setSettings((prev) => ({ ...prev, ...imported }));
          showToast("success", "Settings imported. Review and save to persist.");
        } catch {
          showToast("error", "Invalid JSON file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleDownloadBackup = () => {
    const full = { settings, localPrefs, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("success", "Full backup downloaded.");
  };

  const handleRestoreDefaults = () => {
    if (!window.confirm("Restore all settings to defaults? This cannot be undone.")) return;
    setSettings({ ...DEFAULT_SETTINGS });
    setLocalPrefs({ ...DEFAULT_LOCAL_PREFS });
    localStorage.removeItem(LOCAL_PREFS_KEY);
    applyLocalPreferences({ theme: "light", primaryColor: DEFAULT_PRIMARY_COLOR, language: "en" });
    showToast("success", "Settings restored to defaults. Save to persist.");
  };

  // ── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <div className="sc-page">
        <div className="sc-hero">
          <div className="sc-hero-icon"><FaCog /></div>
          <div className="sc-hero-text">
            <h2 className="sc-hero-title">System Configuration</h2>
            <p className="sc-hero-subtitle">Loading configuration…</p>
          </div>
        </div>
        <div className="sc-loading">Loading settings…</div>
      </div>
    );
  }

  const activeSectionMeta = SECTIONS.find((s) => s.id === activeSection);

  // ── Section renderers ─────────────────────────────────
  const renderOrganization = () => (
    <div className="sc-stack">
      {/* Identity */}
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--indigo"><FaBuilding /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Organization Identity</h3>
            <p className="sc-card-subtitle">Name, logo, address and contact details</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-logo-card">
            <div className="sc-logo-preview">
              {settings.orgLogo ? (
                <img src={settings.orgLogo} alt="Organization Logo" />
              ) : (
                <span className="sc-logo-placeholder">{orgLabels.orgIcon || <FaBuilding />}</span>
              )}
            </div>
            <div className="sc-logo-meta">
              <span className="sc-logo-label">Organization Logo</span>
              <span className="sc-logo-hint">PNG, JPG, JPEG</span>
              <div className="sc-logo-actions">
                <label className="sc-upload-btn">
                  <FaUpload /> Choose File
                  <input type="file" ref={fileInputRef} accept="image/png,image/jpeg,image/jpg" onChange={handleLogoUpload} />
                </label>
                {settings.orgLogo && (
                  <button type="button" className="sc-upload-btn sc-upload-btn--danger" onClick={handleRemoveLogo}>
                    <FaTrash /> Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="sc-field">
            <label>Organization Name</label>
            <input type="text" className="ui-input" placeholder="Enter organization name" value={settings.orgName} onChange={(e) => handleChange("orgName", e.target.value)} />
          </div>
          <div className="sc-field">
            <label>Organization Address</label>
            <input type="text" className="ui-input" placeholder="Enter address" value={settings.orgAddress} onChange={(e) => handleChange("orgAddress", e.target.value)} />
          </div>
          <div className="sc-row">
            <div className="sc-field">
              <label><FaEnvelope className="sc-field-icon" /> Organization Email</label>
              <input type="email" className="ui-input" placeholder="admin@kataga.org" value={settings.orgEmail} onChange={(e) => handleChange("orgEmail", e.target.value)} />
            </div>
            <div className="sc-field">
              <label><FaPhoneAlt className="sc-field-icon" /> Contact Number</label>
              <input type="text" className="ui-input" placeholder="+63 2 1234 5678" value={settings.orgContact} onChange={(e) => handleChange("orgContact", e.target.value)} />
            </div>
          </div>
          <div className="sc-field">
            <label><FaGlobeAsia className="sc-field-icon" /> Website</label>
            <input type="url" className="ui-input" placeholder="https://kataga.org" value={settings.orgWebsite} onChange={(e) => handleChange("orgWebsite", e.target.value)} />
          </div>
        </div>
      </div>

      {/* School Seal placeholder */}
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--amber"><FaStamp /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">School Seal</h3>
            <p className="sc-card-subtitle">Official seal or emblem (coming soon)</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-placeholder-card">
            <FaStamp className="sc-placeholder-icon" />
            <span className="sc-placeholder-text">School seal upload will be available in a future update.</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAttendance = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--green"><FaClock /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Attendance Rules</h3>
            <p className="sc-card-subtitle">Time windows, grace periods and marking rules</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-group">
            <div className="sc-group-title"><FaRegClock /> Schedule</div>
            <div className="sc-row sc-row--3">
              <div className="sc-field">
                <label>Attendance Start</label>
                <input type="time" className="ui-input" value={settings.attendanceStartTime} onChange={(e) => handleChange("attendanceStartTime", e.target.value)} />
              </div>
              <div className="sc-field">
                <label>Late Cutoff</label>
                <input type="time" className="ui-input" value={settings.lateCutoffTime} onChange={(e) => handleChange("lateCutoffTime", e.target.value)} />
              </div>
              <div className="sc-field">
                <label>Attendance End</label>
                <input type="time" className="ui-input" value={settings.attendanceEndTime} onChange={(e) => handleChange("attendanceEndTime", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="sc-group">
            <div className="sc-group-title"><FaHourglassHalf /> Policies</div>
            <div className="sc-row">
              <div className="sc-field">
                <label>Grace Period</label>
                <select className="ui-select" value={settings.gracePeriod} onChange={(e) => handleChange("gracePeriod", e.target.value)}>
                  <option value="None">None</option>
                  <option value="5 minutes">5 minutes</option>
                  <option value="10 minutes">10 minutes</option>
                  <option value="15 minutes">15 minutes</option>
                  <option value="20 minutes">20 minutes</option>
                  <option value="30 minutes">30 minutes</option>
                </select>
              </div>
              <div className="sc-field">
                <label>Attendance Mode</label>
                <select className="ui-select" value={settings.attendanceMode} onChange={(e) => handleChange("attendanceMode", e.target.value)}>
                  <option value="QR Code Only">QR Code Only</option>
                  <option value="Manual Only">Manual Only</option>
                  <option value="QR + Manual">QR + Manual</option>
                </select>
              </div>
            </div>
          </div>

          <div className="sc-group">
            <div className="sc-group-title"><FaGlobe /> Timezone</div>
            <div className="sc-field">
              <select className="ui-select" value={settings.timezone} onChange={(e) => handleChange("timezone", e.target.value)}>
                <option value="(UTC+08:00) Asia/Manila">(UTC+08:00) Asia/Manila</option>
                <option value="(UTC+09:00) Tokyo">(UTC+09:00) Tokyo</option>
                <option value="(UTC+07:00) Bangkok">(UTC+07:00) Bangkok</option>
                <option value="(UTC+00:00) London">(UTC+00:00) London</option>
                <option value="(UTC-05:00) New York">(UTC-05:00) New York</option>
              </select>
            </div>
          </div>

          <div className="sc-group">
            <div className="sc-group-title"><FaUserCheck /> Auto Mark Absent</div>
            <div className="sc-toggle-row">
              <div className="sc-toggle-copy">
                <span className="sc-toggle-title">Auto Mark Absent</span>
                <span className="sc-toggle-desc">When enabled, participants without attendance after end time are automatically marked Absent.</span>
              </div>
              <label className="sc-switch">
                <input type="checkbox" checked={settings.autoMarkAbsent} onChange={(e) => handleChange("autoMarkAbsent", e.target.checked)} />
                <span className="sc-switch-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Future attendance features */}
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--violet"><FaBolt /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Advanced Features (Coming Soon)</h3>
            <p className="sc-card-subtitle">Future attendance capabilities — frontend placeholders only</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-feature-grid">
            {FUTURE_ATTENDANCE_FEATURES.map((f, i) => (
              <div key={i} className="sc-feature-card">
                <div className="sc-feature-icon"><f.icon /></div>
                <div className="sc-feature-meta">
                  <span className="sc-feature-title">{f.title}</span>
                  <span className="sc-feature-desc">{f.desc}</span>
                </div>
                <span className="sc-feature-badge">Soon</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderAcademic = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--amber"><FaGraduationCap /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Academic Term</h3>
            <p className="sc-card-subtitle">Current academic year and semester</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-row">
            <div className="sc-field">
              <label>Academic Year</label>
              <input type="text" className="ui-input" placeholder="e.g. 2024-2025" value={settings.orgYear} onChange={(e) => handleChange("orgYear", e.target.value)} />
            </div>
            <div className="sc-field">
              <label>Semester</label>
              <select className="ui-select" value={settings.semester} onChange={(e) => handleChange("semester", e.target.value)}>
                <option value="1st">1st Semester</option>
                <option value="2nd">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--blue"><FaLayerGroup /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Departments & Courses</h3>
            <p className="sc-card-subtitle">Manage department list, default courses and sections</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-field">
            <label>Department List</label>
            <input type="text" className="ui-input" placeholder="e.g. Engineering, Marketing, IT" value={settings.defaultDepartments} onChange={(e) => handleChange("defaultDepartments", e.target.value)} />
            <div className="sc-field-hint">Comma-separated list of departments</div>
          </div>
          <div className="sc-field">
            <label>Default Courses</label>
            <input type="text" className="ui-input" placeholder="e.g. BSIT, BSCS, BSBio" value={settings.defaultCourses} onChange={(e) => handleChange("defaultCourses", e.target.value)} />
            <div className="sc-field-hint">Comma-separated (frontend placeholder)</div>
          </div>
          <div className="sc-field">
            <label>Default Sections</label>
            <input type="text" className="ui-input" placeholder="e.g. A, B, C" value={settings.defaultSections} onChange={(e) => handleChange("defaultSections", e.target.value)} />
            <div className="sc-field-hint">Comma-separated (frontend placeholder)</div>
          </div>
        </div>
      </div>

      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--teal"><FaIdCard /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Identification Formats</h3>
            <p className="sc-card-subtitle">Member ID format and year levels (frontend placeholder)</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-row">
            <div className="sc-field">
              <label>Student Number Format</label>
              <input type="text" className="ui-input" placeholder="e.g. YYYY-XXXX" value={settings.studentNumberFormat} onChange={(e) => handleChange("studentNumberFormat", e.target.value)} />
            </div>
            <div className="sc-field">
              <label>Year Levels</label>
              <input type="text" className="ui-input" placeholder="e.g. 1st, 2nd, 3rd, 4th" value={settings.positionLevels} onChange={(e) => handleChange("positionLevels", e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderQR = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--indigo"><FaQrcode /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">QR Attendance Configuration</h3>
            <p className="sc-card-subtitle">QR theme, behavior and security settings</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-row">
            <div className="sc-field">
              <label>QR Theme</label>
              <select className="ui-select" value={localPrefs.qrTheme} onChange={(e) => handleLocalPrefChange("qrTheme", e.target.value)}>
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="brand">Brand Color</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="sc-field">
              <label>QR Type</label>
              <select className="ui-select" value={localPrefs.qrType} onChange={(e) => handleLocalPrefChange("qrType", e.target.value)}>
                <option value="static">Static QR</option>
                <option value="dynamic">Dynamic QR</option>
              </select>
            </div>
          </div>
          <div className="sc-row">
            <div className="sc-field">
              <label>Refresh Interval (seconds)</label>
              <input type="number" className="ui-input" min="10" max="600" value={localPrefs.qrRefreshInterval} onChange={(e) => handleLocalPrefChange("qrRefreshInterval", e.target.value)} />
            </div>
            <div className="sc-field">
              <label>Error Correction Level</label>
              <select className="ui-select" value={localPrefs.qrErrorCorrection} onChange={(e) => handleLocalPrefChange("qrErrorCorrection", e.target.value)}>
                <option value="L">Low (L)</option>
                <option value="M">Medium (M)</option>
                <option value="Q">Quartile (Q)</option>
                <option value="H">High (H)</option>
              </select>
            </div>
          </div>
          <div className="sc-row">
            <div className="sc-field">
              <label>QR Size (px)</label>
              <input type="number" className="ui-input" min="100" max="1000" step="50" value={localPrefs.qrSize} onChange={(e) => handleLocalPrefChange("qrSize", e.target.value)} />
            </div>
            <div className="sc-field sc-field--toggle">
              <label>&nbsp;</label>
              <div className="sc-toggle-row">
                <div className="sc-toggle-copy">
                  <span className="sc-toggle-title">Institution Logo on QR</span>
                  <span className="sc-toggle-desc">Display organization logo in the center of QR codes</span>
                </div>
                <label className="sc-switch">
                  <input type="checkbox" checked={localPrefs.qrLogoOnQR} onChange={(e) => handleLocalPrefChange("qrLogoOnQR", e.target.checked)} />
                  <span className="sc-switch-slider" />
                </label>
              </div>
            </div>
          </div>
          <div className="sc-group">
            <div className="sc-group-title"><FaShieldAlt /> Security</div>
            <div className="sc-toggle-row">
              <div className="sc-toggle-copy">
                <span className="sc-toggle-title">Screenshot Protection</span>
                <span className="sc-toggle-desc">Prevent QR code from being captured via screenshot</span>
              </div>
              <label className="sc-switch">
                <input type="checkbox" checked={localPrefs.qrScreenshotProtection} onChange={(e) => handleLocalPrefChange("qrScreenshotProtection", e.target.checked)} />
                <span className="sc-switch-slider" />
              </label>
            </div>
          </div>
          <div className="sc-placeholder-banner">
            <FaInfoCircle /> QR Attendance settings are frontend-only. Backend integration coming soon.
          </div>
        </div>
      </div>
    </div>
  );

  const renderBranding = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--violet"><FaPalette /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Theme & Appearance</h3>
            <p className="sc-card-subtitle">System-wide theme, colors and language</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-field">
            <label>Theme Mode</label>
            <div className="sc-theme-grid">
              {[
                { value: "light", icon: "☀️", label: "Light", desc: "Bright and clean interface." },
                { value: "dark", icon: "🌙", label: "Dark", desc: "Dark and low-glare interface." },
                { value: "system", icon: "💻", label: "System Default", desc: "Match your device preference." },
              ].map((opt) => (
                <button key={opt.value} type="button" className={`sc-theme-card${settings.theme === opt.value ? " selected" : ""}`} onClick={() => handleChange("theme", opt.value)}>
                  <div className="sc-theme-card-preview" data-theme-preview={opt.value}>
                    <span className="sc-theme-card-icon">{opt.icon}</span>
                    <span className="sc-theme-card-swatch" />
                  </div>
                  <div className="sc-theme-card-meta">
                    <span className="sc-theme-card-label">{opt.label}</span>
                    <span className="sc-theme-card-desc">{opt.desc}</span>
                  </div>
                  {settings.theme === opt.value && <span className="sc-theme-card-check"><FaCheck /></span>}
                </button>
              ))}
            </div>
          </div>

          <div className="sc-field">
            <label>Primary Color</label>
            <div className="sc-swatches">
              {PRESET_COLORS.map((color) => (
                <button key={color} type="button" className={`sc-swatch${settings.primaryColor.toLowerCase() === color.toLowerCase() ? " selected" : ""}`} style={{ background: color }} onClick={() => handleChange("primaryColor", color)} aria-label={color}>
                  {settings.primaryColor.toLowerCase() === color.toLowerCase() && <FaCheck />}
                </button>
              ))}
              <label className={`sc-swatch sc-swatch--custom${!PRESET_COLORS.some((c) => c.toLowerCase() === settings.primaryColor.toLowerCase()) ? " selected" : ""}`}>
                <span>🎨</span>
                <input type="color" value={settings.primaryColor} onChange={(e) => handleChange("primaryColor", e.target.value)} aria-label="Custom color" />
              </label>
            </div>
          </div>

          <div className="sc-field">
            <label>Language</label>
            <div className="sc-language-grid">
              {[
                { value: "en", label: "🇺🇸 English" },
                { value: "fil", label: "🇵🇭 Filipino" },
              ].map((l) => (
                <button key={l.value} type="button" className={`sc-language-card${settings.language === l.value ? " selected" : ""}`} onClick={() => handleChange("language", l.value)}>
                  <span>{l.label}</span>
                  {settings.language === l.value && <FaCheck />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--indigo"><FaTools /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">System Branding</h3>
            <p className="sc-card-subtitle">Organization branding and assets</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-row">
            <div className="sc-field">
              <label>System Name</label>
              <input type="text" className="ui-input" placeholder="My Institution" value={settings.systemName} onChange={(e) => handleChange("systemName", e.target.value)} />
            </div>
            <div className="sc-field">
              <label>Footer Text</label>
              <input type="text" className="ui-input" placeholder="© 2025 My Institution" value={settings.footerText} onChange={(e) => handleChange("footerText", e.target.value)} />
            </div>
          </div>
          <div className="sc-placeholder-banner">
            <FaInfoCircle /> Sidebar logo, favicon, login background and live preview will be available in a future update.
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--green"><FaBell /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Notification Preferences</h3>
            <p className="sc-card-subtitle">Choose what updates you receive</p>
          </div>
        </div>
        <div className="sc-card-body">
          {NOTIF_OPTIONS.map((n, i) => (
            <div key={n.key}>
              {i > 0 && <div className="sc-divider" />}
              <div className="sc-toggle-row">
                <div className="sc-toggle-copy">
                  <span className="sc-toggle-title"><n.icon className="sc-toggle-icon" /> {n.title}</span>
                  <span className="sc-toggle-desc">{n.desc}</span>
                </div>
                <label className="sc-switch">
                  <input type="checkbox" checked={localPrefs[n.key]} onChange={(e) => handleLocalPrefChange(n.key, e.target.checked)} />
                  <span className="sc-switch-slider" />
                </label>
              </div>
            </div>
          ))}
          <div className="sc-placeholder-banner" style={{ marginTop: 16 }}>
            <FaInfoCircle /> Notification preferences are frontend-only. Backend delivery coming soon.
          </div>
        </div>
      </div>
    </div>
  );

  const renderSystem = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--slate"><FaCog /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">System Preferences</h3>
            <p className="sc-card-subtitle">Timezone, date/time formats and maintenance</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-group">
            <div className="sc-group-title"><FaGlobe /> Regional Settings</div>
            <div className="sc-field">
              <label>Timezone</label>
              <select className="ui-select" value={settings.timezone} onChange={(e) => handleChange("timezone", e.target.value)}>
                <option value="(UTC+08:00) Asia/Manila">(UTC+08:00) Asia/Manila</option>
                <option value="(UTC+09:00) Tokyo">(UTC+09:00) Tokyo</option>
                <option value="(UTC+07:00) Bangkok">(UTC+07:00) Bangkok</option>
                <option value="(UTC+00:00) London">(UTC+00:00) London</option>
                <option value="(UTC-05:00) New York">(UTC-05:00) New York</option>
              </select>
            </div>
            <div className="sc-row">
              <div className="sc-field">
                <label>Date Format</label>
                <select className="ui-select" value={settings.dateFormat} onChange={(e) => handleChange("dateFormat", e.target.value)}>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MMM DD, YYYY">MMM DD, YYYY</option>
                </select>
              </div>
              <div className="sc-field">
                <label>Time Format</label>
                <select className="ui-select" value={settings.timeFormat} onChange={(e) => handleChange("timeFormat", e.target.value)}>
                  <option value="h:mm A">12-hour (h:mm A)</option>
                  <option value="HH:mm">24-hour (HH:mm)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="sc-group">
            <div className="sc-group-title"><FaShieldAlt /> Maintenance</div>
            <div className="sc-toggle-row">
              <div className="sc-toggle-copy">
                <span className="sc-toggle-title">Maintenance Mode</span>
                <span className="sc-toggle-desc">When enabled, only administrators can access the system</span>
              </div>
              <label className="sc-switch">
                <input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => handleChange("maintenanceMode", e.target.checked)} />
                <span className="sc-switch-slider" />
              </label>
            </div>
            <div className="sc-toggle-row">
              <div className="sc-toggle-copy">
                <span className="sc-toggle-title">Auto Backup</span>
                <span className="sc-toggle-desc">Automatically create system backups periodically</span>
              </div>
              <label className="sc-switch">
                <input type="checkbox" checked={settings.autoBackup} onChange={(e) => handleChange("autoBackup", e.target.checked)} />
                <span className="sc-switch-slider" />
              </label>
            </div>
            <div className="sc-field">
              <label>Log Retention</label>
              <select className="ui-select" value={settings.logRetention} onChange={(e) => handleChange("logRetention", e.target.value)}>
                <option value="7 days">7 days</option>
                <option value="30 days">30 days</option>
                <option value="90 days">90 days</option>
                <option value="1 year">1 year</option>
                <option value="forever">Forever</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--indigo"><FaServer /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">System Information</h3>
            <p className="sc-card-subtitle">Version and storage details</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-info-grid">
            <div className="sc-info-item">
              <span className="sc-info-label">System Version</span>
              <span className="sc-info-value">{APP_VERSION}</span>
            </div>
            <div className="sc-info-item">
              <span className="sc-info-label">Cache Management</span>
              <span className="sc-info-value">
                <button type="button" className="sc-link-btn" onClick={() => { localStorage.clear(); showToast("success", "Cache cleared. Reload the page."); }}>
                  <FaTrashAlt /> Clear Cache
                </button>
              </span>
            </div>
            <div className="sc-info-item">
              <span className="sc-info-label">Storage Usage</span>
              <span className="sc-info-value">
                <div className="sc-storage-bar">
                  <div className="sc-storage-bar-fill" style={{ width: `${Math.min(Math.round((new Blob([JSON.stringify(localStorage)]).size / 5242880) * 100), 100)}%` }} />
                </div>
                <span className="sc-storage-text">{(new Blob([JSON.stringify(localStorage)]).size / 1024).toFixed(1)} KB / 5 MB</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBackup = () => (
    <div className="sc-stack">
      <div className="sc-card sc-backup-hero">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--amber"><FaDatabase /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">Backup & Restore</h3>
            <p className="sc-card-subtitle">Export, import and restore system settings</p>
          </div>
        </div>
        <div className="sc-card-body">
          <div className="sc-backup-grid">
            <button type="button" className="sc-backup-btn" onClick={handleExportSettings}>
              <FaFileExport className="sc-backup-btn-icon" />
              <span className="sc-backup-btn-title">Export Settings</span>
              <span className="sc-backup-btn-desc">Download settings as JSON</span>
            </button>
            <button type="button" className="sc-backup-btn" onClick={handleImportSettings}>
              <FaFileImport className="sc-backup-btn-icon" />
              <span className="sc-backup-btn-title">Import Settings</span>
              <span className="sc-backup-btn-desc">Upload a JSON settings file</span>
            </button>
            <button type="button" className="sc-backup-btn" onClick={handleDownloadBackup}>
              <FaDownload className="sc-backup-btn-icon" />
              <span className="sc-backup-btn-title">Download Backup</span>
              <span className="sc-backup-btn-desc">Full backup with preferences</span>
            </button>
            <button type="button" className="sc-backup-btn sc-backup-btn--danger" onClick={handleRestoreDefaults}>
              <FaUndo className="sc-backup-btn-icon" />
              <span className="sc-backup-btn-title">Restore Defaults</span>
              <span className="sc-backup-btn-desc">Reset all settings to factory</span>
            </button>
          </div>
          <div className="sc-placeholder-banner" style={{ marginTop: 16 }}>
            <FaInfoCircle /> Backup operations are frontend-only. Server-side backup integration coming soon.
          </div>
        </div>
      </div>
    </div>
  );

const renderRoles = () => (
    <div className="sc-stack">
      <div className="sc-card">
        <div className="sc-card-header">
          <div className="sc-card-icon sc-card-icon--indigo"><FaUserShield /></div>
          <div className="sc-card-heading">
            <h3 className="sc-card-title">User Roles</h3>
            <p className="sc-card-subtitle">Assign roles, manage users, and approve pending registrations</p>
          </div>
        </div>
        <div className="sc-card-body sc-card-body--flush">
          <UserManagement />
        </div>
      </div>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "organization": return renderOrganization();
      case "attendance": return renderAttendance();
      case "academic": return renderAcademic();
      case "qr": return renderQR();
      case "branding": return renderBranding();
      case "notifications": return renderNotifications();
      case "system": return renderSystem();
      case "backup": return renderBackup();
      case "roles": return renderRoles();
      default: return renderOrganization();
    }
  };

  // ── Main Render ────────────────────────────────────────
  return (
    <div className="sc-page">
      {toast.visible && (
        <div className={`sc-toast sc-toast--${toast.kind}`}>
          <span className="sc-toast-icon">{toast.kind === "success" ? "✓" : "✕"}</span>
          <span className="sc-toast-message">{toast.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="sc-hero">
        <div className="sc-hero-icon" aria-hidden="true"><FaCog /></div>
        <div className="sc-hero-text">
          <h2 className="sc-hero-title">System Configuration</h2>
          <p className="sc-hero-subtitle">
            Manage organization settings, attendance rules, branding, QR behavior, notifications and system preferences.
          </p>
        </div>
      </div>

      <div className="sc-layout">
        {/* Left Sidebar */}
        <aside className="sc-nav">
          <nav className="sc-nav-inner" aria-label="System Configuration sections">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`sc-nav-item${activeSection === s.id ? " active" : ""}`}
                  onClick={() => setActiveSection(s.id)}
                >
                  <span className="sc-nav-icon"><Icon /></span>
                  <span className="sc-nav-label">{s.label}</span>
                  {activeSection === s.id && <span className="sc-nav-indicator" />}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Content */}
        <section className="sc-content">
          <div className="sc-content-header">
            <h3 className="sc-content-title">{activeSectionMeta.label}</h3>
            <p className="sc-content-subtitle">{activeSectionMeta.subtitle}</p>
          </div>
          {renderSection()}
        </section>
      </div>

      {/* Floating Save Bar */}
      {isDirty && (
        <div className="sc-savebar-wrap">
          <div className="sc-savebar">
            <div className="sc-savebar-info">
              <span className="sc-savebar-dot" />
              <span className="sc-savebar-text">You have unsaved changes.</span>
            </div>
            <div className="sc-savebar-actions">
              <button type="button" className="ui-btn ui-btn-secondary sc-savebar-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary sc-savebar-btn"
                disabled={saving.all}
                onClick={() => handleSave(Object.keys(settings))}
              >
                {saving.all ? "Saving All…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
