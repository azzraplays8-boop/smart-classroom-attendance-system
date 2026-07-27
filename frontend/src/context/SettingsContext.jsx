/**
 * SettingsContext - Organization Settings Provider
 * 
 * Provides organization-wide settings to all components.
 * Settings include: organization name, type, labels, theme, attendance config, etc.
 * 
 * This is a frontend-only context. Settings are persisted to backend via the Settings page,
 * but for immediate use, defaults are applied and overridden with localStorage values.
 * 
 * In the future, this will read from a database-backed API.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEFAULT_ORG_SETTINGS } from "../config/organizationDefaults";

export const SettingsContext = createContext(null);

const STORAGE_KEY = "app_org_settings";

// ── LocalStorage helpers ─────────────────────────────
function loadFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveToStorage(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

// ── Theme DOM helpers ────────────────────────────────
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
  document.documentElement.style.setProperty("--primary-2", color || "#4f46e5");
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    // Initialize with localStorage values merged over defaults
    const stored = loadFromStorage();
    return { ...DEFAULT_ORG_SETTINGS, ...stored };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Apply theme and primary color on load and when they change
  useEffect(() => {
    applyTheme(settings.theme);
    applyPrimaryColor(settings.primaryColor);
  }, [settings.theme, settings.primaryColor]);

  /**
   * Update individual settings fields.
   * Merges with existing settings and persists to localStorage.
   */
  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      saveToStorage(updated);
      return updated;
    });
  }, []);

  /**
   * Reset all settings to defaults.
   */
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_ORG_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Reload settings from storage (useful after backend sync).
   */
  const refreshSettings = useCallback(() => {
    const stored = loadFromStorage();
    if (stored) {
      setSettings((prev) => ({ ...prev, ...stored }));
    }
  }, []);

  const value = {
    settings,
    loading,
    error,
    updateSettings,
    resetSettings,
    refreshSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Hook to access settings context.
 */
export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

export default SettingsContext;

