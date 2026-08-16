/**
 * AuthContext provides authentication state and actions to the entire app.
 *
 * Features:
 * - Store user + token on successful login
 * - Persist across page refreshes (localStorage for "Remember Me", sessionStorage otherwise)
 * - Auto-restore auth on mount & validate token with backend
 * - Provide login/logout actions
 * - Track loading state while restoring
 * - Enterprise RBAC: role-based route access + permission-based checks
 */
import { createContext, useCallback, useEffect, useState } from "react";
import authService from "../services/authService";
import { clearStoredAuth, getStoredAuthToken } from "../services/apiClient";

export const AuthContext = createContext(null);

/**
 * Role-based permission & route definitions.
 * Maps each role to the routes/pages they can access and the permission keys.
 */
export const ROLE_LABELS = {
  super_admin: "Super Admin",
  administrator: "Administrator",
  teacher: "Teacher",
  moderator: "Moderator",
  encoder: "Encoder",
  viewer: "Viewer",
};

export const PERMISSIONS = {
  super_admin: {
    label: "Super Admin",
    routes: [
      "dashboard",
      "participants",
      "attendance",
      "attendance-history",
      "qr-management",
      "reports",
      "settings",
      "user-management",
      "organizations",
    ],
    canAccess: (route) => true, // Full access
  },
  administrator: {
    label: "Administrator",
    routes: [
      "dashboard",
      "participants",
      "attendance",
      "attendance-history",
      "qr-management",
      "reports",
      "settings",
      "user-management",
    ],
    canAccess: (route) => !["super_admin", "organizations"].includes(route),
  },
  teacher: {
    label: "Teacher",
    routes: ["dashboard", "attendance", "attendance-history", "account"],
    canAccess: (route) =>
      ["dashboard", "attendance", "attendance-history", "account"].includes(route),
  },
  moderator: {
    label: "Moderator",
    routes: ["dashboard", "participants", "attendance", "attendance-history", "reports", "account"],
    canAccess: (route) =>
      ["dashboard", "participants", "attendance", "attendance-history", "reports", "account"].includes(route),
  },
  encoder: {
    label: "Encoder",
    routes: ["dashboard", "participants", "attendance", "attendance-history", "account"],
    canAccess: (route) =>
      ["dashboard", "participants", "attendance", "attendance-history", "account"].includes(route),
  },
  viewer: {
    label: "Viewer",
    routes: ["dashboard", "my-attendance", "account"],
    canAccess: (route) => ["dashboard", "my-attendance", "account"].includes(route),
  },
};

/**
 * Check if a user has permission to access a given route.
 * @param {Object} user - User object with role property
 * @param {string} route - Route name to check (e.g. "participants", "settings")
 * @returns {boolean}
 */
export function canAccessRoute(user, route) {
  if (!user || !user.role) return false;
  const rolePermissions = PERMISSIONS[user.role];
  if (!rolePermissions) return false;
  return rolePermissions.canAccess(route);
}

/**
 * Check if a user has a given permission key.
 * Super Admin bypasses all permission checks.
 * @param {Object} user - User object with role + permissions
 * @param {string} permission - e.g. "manage_users"
 * @returns {boolean}
 */
export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (!user.permissions) return false;
  return user.permissions.includes(permission);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true); // true while restoring auth

  /**
   * Restore authentication from storage on mount.
   * Validates the token by calling GET /auth/me.
   * If the token is invalid/expired, clears auth state.
   */
  useEffect(() => {
    const storedToken = getStoredAuthToken();
    const storedUser =
      localStorage.getItem("auth_user") || sessionStorage.getItem("auth_user");

    if (!storedToken || !storedUser) {
      setLoading(false);
      return;
    }

    // Temporarily set token so axios interceptor can use it
    setToken(storedToken);

    // Validate token by fetching current user from backend
    authService
      .getMe()
      .then((data) => {
        // Token is valid — restore user
        setUser(data.user);
      })
      .catch(() => {
        // Token is invalid or expired — clear everything
        clearStoredAuth();
        setToken(null);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  /**
   * Login with email/username and password.
   * Stores token in localStorage (if rememberMe) or sessionStorage.
   *
   * @param {string} email - Email or username
   * @param {string} password - Plain text password
   * @param {boolean} rememberMe - Persist across sessions
   * @returns {Promise<Object>} User data
   */
  const login = useCallback(async (email, password, rememberMe = false) => {
    const data = await authService.login(email, password);

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("auth_token", data.token);
    storage.setItem("auth_user", JSON.stringify(data.user));

    setToken(data.token);
    setUser(data.user);

    return data.user;
  }, []);

  /**
   * Register a new account.
   * First user becomes Super Admin (auto-login). Others become pending approval (no login).
   *
   * @param {Object} data - { full_name, username, email, password, confirm_password, invitation_code }
   * @returns {Promise<Object>} { user, pending }
   */
  const register = useCallback(async (data) => {
    const result = await authService.register(data);

    // Only auto-login if a token is returned (first user / Super Admin)
    if (result.token && result.user) {
      const storage = localStorage;
      storage.setItem("auth_token", result.token);
      storage.setItem("auth_user", JSON.stringify(result.user));
      setToken(result.token);
      setUser(result.user);
    }

    return result;
  }, []);

  /**
   * Logout: clear stored auth and reset state.
   */
  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      // Silently ignore logout API errors
    }

    clearStoredAuth();

    setToken(null);
    setUser(null);
  }, []);

  /**
   * Update the user in context (e.g. after profile edit).
   * Also updates storage.
   */
  const updateUser = useCallback(
    (updatedUser) => {
      setUser(updatedUser);
      const storage = localStorage.getItem("auth_token")
        ? localStorage
        : sessionStorage;
      storage.setItem("auth_user", JSON.stringify(updatedUser));
    },
    []
  );

  /**
   * Refresh the current user data from the backend.
   */
  const refreshUser = useCallback(async () => {
    try {
      const data = await authService.getMe();
      setUser(data.user);
      const storage = localStorage.getItem("auth_token")
        ? localStorage
        : sessionStorage;
      storage.setItem("auth_user", JSON.stringify(data.user));
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    register,
    updateUser,
    refreshUser,
    canAccessRoute,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
