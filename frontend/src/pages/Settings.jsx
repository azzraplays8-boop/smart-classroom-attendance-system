import { useCallback, useEffect, useRef, useState } from "react";
import "../styles/Settings.css";
import translations from "../data/translations.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/$/, "");

const DEFAULT_PRIMARY_COLOR = "#4f46e5";

// ── DOM helpers ─────────────────────────────────────────
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
  document.documentElement.style.setProperty("--primary-2", color);
}

function getThemeFromStorage() {
  return localStorage.getItem("app_theme") || null;
}

function getPrimaryColorFromStorage() {
  return localStorage.getItem("app_primaryColor") || null;
}

function getLanguageFromStorage() {
  return localStorage.getItem("app_language") || null;
}

// ── Media query listener for system theme ───────────────
let systemThemeListener = null;

function setupSystemThemeListener(callback) {
  if (systemThemeListener) {
    systemThemeListener.mql.removeEventListener("change", systemThemeListener.handler);
  }
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = (e) => {
    callback(e.matches ? "dark" : "light");
  };
  mql.addEventListener("change", handler);
  systemThemeListener = { mql, handler };
}

function teardownSystemThemeListener() {
  if (systemThemeListener) {
    systemThemeListener.mql.removeEventListener("change", systemThemeListener.handler);
    systemThemeListener = null;
  }
}

function Settings() {
  // ── State ──────────────────────────────────────────────
  const [settings, setSettings] = useState({
    schoolName: "",
    schoolLogo: "",
    schoolAddress: "",
    attendanceStartTime: "07:30",
    lateCutoffTime: "08:00",
    attendanceEndTime: "17:00",
    autoMarkAbsent: true,
    timezone: "(UTC+08:00) Asia/Manila",
    gracePeriod: "None",
    attendanceMode: "QR + Manual",
    schoolYear: "",
    semester: "1st",
    defaultCourses: "",
    theme: "light",
    primaryColor: DEFAULT_PRIMARY_COLOR,
    language: "en",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [toast, setToast] = useState({ kind: "success", message: "", visible: false });

  const fileInputRef = useRef(null);

  // ── Translation helper ────────────────────────────────
  const t = useCallback(
    (key) => {
      const lang = settings.language || "en";
      return translations[lang]?.[key] ?? translations.en[key] ?? key;
    },
    [settings.language]
  );

  // ── Toast ──────────────────────────────────────────────
  const showToast = useCallback((kind, message) => {
    setToast({ kind, message, visible: true });
    window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 2800);
  }, []);

  // ── Apply local preferences immediately ───────────────
  const applyLocalPreferences = useCallback((prefs) => {
    if (prefs.theme) {
      applyTheme(prefs.theme);
      localStorage.setItem("app_theme", prefs.theme);
      if (prefs.theme === "system") {
        setupSystemThemeListener((resolved) => {
          applyTheme("system");
        });
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

    // 1. Load from localStorage first (instant)
    const storedTheme = getThemeFromStorage();
    const storedColor = getPrimaryColorFromStorage();
    const storedLang = getLanguageFromStorage();
    if (storedTheme || storedColor || storedLang) {
      const localPrefs = {};
      if (storedTheme) localPrefs.theme = storedTheme;
      if (storedColor) localPrefs.primaryColor = storedColor;
      if (storedLang) localPrefs.language = storedLang;
      applyLocalPreferences(localPrefs);
    }

    // 2. Load from backend
    try {
      const res = await fetch(`${API_BASE_URL}/settings`);
      const data = await res.json();
      if (res.ok && data.settings) {
        const mergedTheme = data.settings.theme || storedTheme || "light";
        const mergedColor = data.settings.primaryColor || storedColor || DEFAULT_PRIMARY_COLOR;
        const mergedLang = data.settings.language || storedLang || "en";

        setSettings((prev) => ({
          ...prev,
          ...data.settings,
          autoMarkAbsent: data.settings.autoMarkAbsent === "true" || data.settings.autoMarkAbsent === true,
          theme: mergedTheme,
          primaryColor: mergedColor,
          language: mergedLang,
        }));

        applyLocalPreferences({
          theme: mergedTheme,
          primaryColor: mergedColor,
          language: mergedLang,
        });
      } else {
        // Apply localStorage / defaults if backend fails
        const fallbackTheme = storedTheme || "light";
        const fallbackColor = storedColor || DEFAULT_PRIMARY_COLOR;
        const fallbackLang = storedLang || "en";
        applyLocalPreferences({ theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang });
        setSettings((prev) => ({ ...prev, theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang }));
      }
    } catch (err) {
      // Network error — use localStorage defaults
      const fallbackTheme = storedTheme || "light";
      const fallbackColor = storedColor || DEFAULT_PRIMARY_COLOR;
      const fallbackLang = storedLang || "en";
      applyLocalPreferences({ theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang });
      setSettings((prev) => ({ ...prev, theme: fallbackTheme, primaryColor: fallbackColor, language: fallbackLang }));
    } finally {
      setLoading(false);
    }
  }, [applyLocalPreferences]);

  useEffect(() => {
    loadSettings();
    return () => {
      teardownSystemThemeListener();
    };
  }, [loadSettings]);

  // ── Save section ──────────────────────────────────────
  const handleSave = async (sectionKeys) => {
    // Validate required fields
    const requiredFields = ["schoolName", "schoolAddress", "schoolYear"];
    for (const key of requiredFields) {
      if (sectionKeys.includes(key) && !settings[key]?.trim()) {
        const fieldLabels = {
          schoolName: t("schoolName"),
          schoolAddress: t("schoolAddress"),
          schoolYear: t("schoolYear"),
        };
        showToast("error", `${fieldLabels[key] || key} is required.`);
        return;
      }
    }

    const payload = {};
    for (const key of sectionKeys) {
      payload[key] = settings[key];
    }

    // Determine the saving key — "all" for Save All, otherwise use the first key
    const savingKey = sectionKeys.length >= 10 ? "all" : sectionKeys[0];
    setSaving((prev) => ({ ...prev, [savingKey]: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Settings Backend Error]", data.message || data.errorCode || "Unknown error");
        throw new Error(data.message || "Failed to save");
      }
      showToast("success", t("settingsSaved"));

      // Reload settings from backend after successful save
      await loadSettings();
    } catch (err) {
      showToast("error", err?.message || t("failedToSave"));
      console.error("[Settings Save Error]", err);
    } finally {
      setSaving((prev) => ({ ...prev, [savingKey]: false }));
    }
  };

  // ── Logo upload ───────────────────────────────────────
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setSettings((prev) => ({ ...prev, schoolLogo: event.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setSettings((prev) => ({ ...prev, schoolLogo: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Field change handler ──────────────────────────────
  const handleChange = (key, value) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };

      // Apply theme immediately on selection
      if (key === "theme") {
        applyTheme(value);
        localStorage.setItem("app_theme", value);
        if (value === "system") {
          setupSystemThemeListener((resolved) => {
            applyTheme("system");
          });
        } else {
          teardownSystemThemeListener();
        }
      }

      // Apply primary color immediately on selection
      if (key === "primaryColor") {
        applyPrimaryColor(value);
        localStorage.setItem("app_primaryColor", value);
      }

      // Apply language immediately on selection
      if (key === "language") {
        localStorage.setItem("app_language", value);
      }

      return updated;
    });
  };

  // ── Loading state ─────────────────────────────────────
  if (loading) {
    return (
      <div className="settings-page">
        <h2>{t("settings")}</h2>
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted-2)" }}>
          {t("loadingSettings")}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────
  return (
    <div className="settings-page">
      {/* Toast */}
      {toast.visible && (
        <div className="settings-toast">
          <div
            style={{
              background: toast.kind === "success" ? "#dcfce7" : "#fee2e2",
              color: toast.kind === "success" ? "#166534" : "#991b1b",
              border: toast.kind === "success" ? "1px solid #86efac" : "1px solid #fca5a5",
              padding: "12px 14px",
              borderRadius: 12,
              fontWeight: 800,
              boxShadow: "0 12px 40px rgba(2,6,23,0.25)",
              maxWidth: 420,
            }}
          >
            {toast.message}
          </div>
        </div>
      )}

      <h2>{t("settings")}</h2>

      <div className="settings-grid">
        {/* ═══════════════ 1. School Information ═══════════════ */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="card-icon blue">🏫</div>
            <h3>{t("schoolInfo")}</h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-field">
              <label>{t("schoolName")}</label>
              <input
                type="text"
                className="ui-input"
                placeholder={t("enterSchoolName")}
                value={settings.schoolName}
                onChange={(e) => handleChange("schoolName", e.target.value)}
              />
            </div>
            <div className="settings-field">
              <label>{t("schoolLogo")}</label>
              <div className="settings-logo-upload">
                <div className="settings-logo-preview">
                  {settings.schoolLogo ? (
                    <img src={settings.schoolLogo} alt="School Logo" />
                  ) : (
                    <span className="logo-placeholder">🏫</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <label className="logo-upload-btn">
                    {t("chooseFile")}
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleLogoUpload}
                    />
                  </label>
                  {settings.schoolLogo && (
                    <button
                      type="button"
                      className="logo-upload-btn"
                      onClick={handleRemoveLogo}
                      style={{ color: "var(--danger)", borderColor: "#fecaca" }}
                    >
                      {t("remove")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="settings-field">
              <label>{t("schoolAddress")}</label>
              <input
                type="text"
                className="ui-input"
                placeholder={t("enterSchoolAddress")}
                value={settings.schoolAddress}
                onChange={(e) => handleChange("schoolAddress", e.target.value)}
              />
            </div>
          </div>
          <div className="settings-card-actions">
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving.schoolName}
              onClick={() => handleSave(["schoolName", "schoolLogo", "schoolAddress"])}
            >
              {saving.schoolName ? t("saving") : t("save")}
            </button>
          </div>
        </div>

        {/* ═══════════════ 2. Attendance Configuration ═══════════════ */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="card-icon green">⏰</div>
            <h3>{t("attendanceSettings")}</h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-field">
              <label>{t("timeZone")}</label>
              <select
                className="ui-select"
                value={settings.timezone}
                onChange={(e) => handleChange("timezone", e.target.value)}
              >
                <option value="(UTC+08:00) Asia/Manila">{t("tzManila")}</option>
                <option value="(UTC+09:00) Tokyo">{t("tzTokyo")}</option>
                <option value="(UTC+07:00) Bangkok">{t("tzBangkok")}</option>
                <option value="(UTC+00:00) London">{t("tzLondon")}</option>
                <option value="(UTC-05:00) New York">{t("tzNewYork")}</option>
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-field">
                <label>{t("attendanceStartTime")}</label>
                <input
                  type="time"
                  className="ui-input"
                  value={settings.attendanceStartTime}
                  onChange={(e) => handleChange("attendanceStartTime", e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>{t("lateCutoffTime")}</label>
                <input
                  type="time"
                  className="ui-input"
                  value={settings.lateCutoffTime}
                  onChange={(e) => handleChange("lateCutoffTime", e.target.value)}
                />
              </div>
            </div>
            <div className="settings-field">
              <label>{t("attendanceEndTime")}</label>
              <input
                type="time"
                className="ui-input"
                value={settings.attendanceEndTime}
                onChange={(e) => handleChange("attendanceEndTime", e.target.value)}
              />
            </div>
            <div className="settings-checkbox">
              <input
                type="checkbox"
                id="autoMarkAbsent"
                checked={settings.autoMarkAbsent}
                onChange={(e) => handleChange("autoMarkAbsent", e.target.checked)}
              />
              <label htmlFor="autoMarkAbsent">
                {t("autoMarkAbsent")}
              </label>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted-2)", margin: "-8px 0 16px 0", lineHeight: 1.5 }}>
              {t("autoMarkAbsentDesc")}
            </p>
            <div className="settings-row">
              <div className="settings-field">
                <label>{t("gracePeriod")}</label>
                <select
                  className="ui-select"
                  value={settings.gracePeriod}
                  onChange={(e) => handleChange("gracePeriod", e.target.value)}
                >
                  <option value="None">{t("graceNone")}</option>
                  <option value="5 minutes">{t("grace5")}</option>
                  <option value="10 minutes">{t("grace10")}</option>
                  <option value="15 minutes">{t("grace15")}</option>
                  <option value="20 minutes">{t("grace20")}</option>
                  <option value="30 minutes">{t("grace30")}</option>
                </select>
              </div>
              <div className="settings-field">
                <label>{t("attendanceMode")}</label>
                <select
                  className="ui-select"
                  value={settings.attendanceMode}
                  onChange={(e) => handleChange("attendanceMode", e.target.value)}
                >
                  <option value="QR Code Only">{t("qrOnly")}</option>
                  <option value="Manual Only">{t("manualOnly")}</option>
                  <option value="QR + Manual">{t("qrManual")}</option>
                </select>
              </div>
            </div>
          </div>
          <div className="settings-card-actions">
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving.attendanceStartTime}
              onClick={() =>
                handleSave(["timezone", "attendanceStartTime", "lateCutoffTime", "attendanceEndTime", "autoMarkAbsent", "gracePeriod", "attendanceMode"])
              }
            >
              {saving.attendanceStartTime ? t("saving") : t("save")}
            </button>
          </div>
        </div>

        {/* ═══════════════ 3. Academic Settings ═══════════════ */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="card-icon amber">📚</div>
            <h3>{t("academicInfo")}</h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-row">
              <div className="settings-field">
                <label>{t("schoolYear")}</label>
                <input
                  type="text"
                  className="ui-input"
                  placeholder={t("enterSchoolYear")}
                  value={settings.schoolYear}
                  onChange={(e) => handleChange("schoolYear", e.target.value)}
                />
              </div>
              <div className="settings-field">
                <label>{t("semester")}</label>
                <select
                  className="ui-select"
                  value={settings.semester}
                  onChange={(e) => handleChange("semester", e.target.value)}
                >
                  <option value="1st">{t("semester1st")}</option>
                  <option value="2nd">{t("semester2nd")}</option>
                  <option value="Summer">{t("semesterSummer")}</option>
                </select>
              </div>
            </div>
            <div className="settings-field">
              <label>{t("defaultCourseList")}</label>
              <input
                type="text"
                className="ui-input"
                placeholder={t("defaultCoursePlaceholder")}
                value={settings.defaultCourses}
                onChange={(e) => handleChange("defaultCourses", e.target.value)}
              />
              <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>
                {t("commaSeparated")}
              </div>
            </div>
          </div>
          <div className="settings-card-actions">
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving.schoolYear}
              onClick={() => handleSave(["schoolYear", "semester", "defaultCourses"])}
            >
              {saving.schoolYear ? t("saving") : t("save")}
            </button>
          </div>
        </div>

        {/* ═══════════════ 4. System Preferences ═══════════════ */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="card-icon purple">🎨</div>
            <h3>{t("systemPreferences")}</h3>
          </div>
          <div className="settings-card-body">
            <div className="settings-field">
              <label>{t("theme")}</label>
              <div className="theme-options">
                {["light", "dark", "system"].map((tVal) => (
                  <label
                    key={tVal}
                    className={`theme-option${settings.theme === tVal ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={tVal}
                      checked={settings.theme === tVal}
                      onChange={(e) => handleChange("theme", e.target.value)}
                    />
                    {tVal === "light" ? t("light") : tVal === "dark" ? t("dark") : t("systemDefault")}
                  </label>
                ))}
              </div>
            </div>
            <div className="settings-field">
              <label>{t("primaryColor")}</label>
              <input
                type="color"
                className="ui-input"
                value={settings.primaryColor}
                onChange={(e) => handleChange("primaryColor", e.target.value)}
                style={{ maxWidth: 120 }}
              />
            </div>
            <div className="settings-field">
              <label>{t("language")}</label>
              <div className="language-options">
                {[
                  { value: "en", label: "🇺🇸 English" },
                  { value: "fil", label: "🇵🇭 Filipino" },
                ].map((l) => (
                  <label
                    key={l.value}
                    className={`theme-option${settings.language === l.value ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="language"
                      value={l.value}
                      checked={settings.language === l.value}
                      onChange={(e) => handleChange("language", e.target.value)}
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="settings-card-actions">
            <button
              type="button"
              className="ui-btn ui-btn-primary"
              disabled={saving.theme}
              onClick={() => handleSave(["theme", "primaryColor", "language"])}
            >
              {saving.theme ? t("saving") : t("save")}
            </button>
          </div>
        </div>

        {/* ═══════════════ 5. Administrator ═══════════════ */}
        <div className="settings-card">
          <div className="settings-card-header">
            <div className="card-icon slate">👤</div>
            <h3>{t("administrator")}</h3>
          </div>
          <div className="settings-card-body">
            <div className="admin-info-grid">
              <span className="admin-label">{t("name")}</span>
              <span className="admin-value">{t("adminName")}</span>
              <span className="admin-label">{t("role")}</span>
              <span className="admin-value">{t("adminRole")}</span>
              <span className="admin-label">{t("email")}</span>
              <span className="admin-value">{t("adminEmail")}</span>
            </div>
          </div>
          <div className="settings-card-actions">
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => showToast("success", t("passwordComingSoon"))}
            >
              {t("changePassword")}
            </button>
          </div>
        </div>

        {/* ═══════════════ 6. Save All Settings ═══════════════ */}
        <div
          className="settings-card"
          style={{
            background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)",
            border: "2px solid var(--primary-2)",
          }}
        >
          <div className="settings-card-header">
            <div className="card-icon blue" style={{ background: "var(--primary-2)", color: "#fff" }}>
              💾
            </div>
            <h3 style={{ color: "var(--primary-2)" }}>{t("saveAllSettings")}</h3>
          </div>
          <div className="settings-card-body">
            <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>
              {t("saveAllDesc")}
            </p>
          </div>
          <div className="settings-card-actions">
            <button
              type="button"
              className="ui-btn ui-btn-success"
              disabled={saving.all}
              onClick={() => handleSave(Object.keys(settings))}
              style={{ minWidth: 180 }}
            >
              {saving.all ? t("savingAll") : t("saveAllSettings")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;

