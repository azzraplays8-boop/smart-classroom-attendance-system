/**
 * JWT Authentication Middleware
 *
 * Verifies the Bearer token from the Authorization header,
 * extracts the user, and attaches it to req.user.
 *
 * Also provides role-based access control helpers.
 *
 * IMPORTANT: After JWT signature verification, the middleware re-fetches the
 * user's current record from the database to ensure the account still exists
 * and is still active/approved. This prevents deleted or deactivated users
 * from continuing to use a previously-issued (still non-expired) JWT token.
 */
import jwt from "jsonwebtoken";
import { findUserByIdForAuth } from "./permissions.js";

// JWT_SECRET is required in production. Fail fast if it is missing rather than
// silently falling back to a hardcoded development secret.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required. Set it before starting the server.");
}

/**
 * Permission keys that map to the RBAC user_permissions table.
 * These are used by the `authorizePermission` middleware.
 */
export const PERMISSION_KEYS = {
  VIEW_DASHBOARD: "view_dashboard",
  MANAGE_USERS: "manage_users",
  MANAGE_ATTENDANCE: "manage_attendance",
  MANAGE_REPORTS: "manage_reports",
  MANAGE_PARTICIPANTS: "manage_participants",
  ENCODE_ATTENDANCE: "encode_attendance",
  VIEW_REPORTS: "view_reports",
  MANAGE_QR: "manage_qr",
  MANAGE_SETTINGS: "manage_settings",
};

/**
 * Maintenance-mode enforcement middleware factory.
 *
 * When the persisted `maintenanceMode` setting is enabled, only Super Admin
 * and Administrator accounts may access protected API routes. All other roles
 * (including Viewer) receive 503 so the frontend shows the Maintenance page.
 * The setting is read from the database on every request — no client-side
 * bypass is possible, and turning it off restores access immediately.
 *
 * @param {import('mysql2/promise').Pool} pool
 */
export function enforceMaintenanceMode(pool) {
  return async (req, res, next) => {
    try {
      const requestPath = (req.originalUrl || req.url || "").split("?")[0];
      if (requestPath === "/health" || requestPath === "/settings/public" || requestPath.endsWith("/settings/public")) {
        return next();
      }

      const [rows] = await pool.query(
        "SELECT setting_value FROM settings WHERE setting_key = 'maintenanceMode' LIMIT 1"
      );
      const raw = rows?.[0]?.setting_value;
      const enabled = raw === "true" || raw === true || raw === 1 || raw === "1";
      if (!enabled) return next();

      // This guard runs BEFORE each router's strict `authenticate`, so the
      // role is read from the JWT payload (if any). Admins continue on to
      // full authentication inside the router; every other role is blocked.
      let role = req.user?.role;
      if (!role) {
        const header = req.headers.authorization || "";
        if (header.startsWith("Bearer ")) {
          try {
            role = jwt.decode(header.slice(1).trim())?.role;
          } catch {
            role = undefined;
          }
        }
      }
      if (role === "super_admin" || role === "administrator") return next();

      return res.status(503).json({
        message: "System is under maintenance. Please try again later.",
        maintenanceMode: true,
      });
    } catch (err) {
      // Fail open: do not lock the whole system out if the check errors.
      console.error("[maintenance] check failed, allowing request:", err?.message || err);
      return next();
    }
  };
}

/**
 * Verify that a valid JWT is present in the Authorization header AND that the
 * corresponding user still exists and is active in the database.
 *
 * If valid, attaches the **fresh** user record (with current role, account_status,
 * and permissions) to req.user. If the token is valid but the user has been
 * deleted, deactivated, or is otherwise unauthorized, returns 401 so that no
 * protected route can be accessed with a stale credential.
 *
 * @param {import('mysql2/promise').Pool} pool - MySQL connection pool
 * @returns {Function} Express middleware
 *
 * req.user = { id, email, username, role, full_name, organization_id,
 *              account_status, is_active, permissions }
 */
export function authenticate(pool) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required. No token provided." });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token has expired. Please login again." });
      }
      return res.status(401).json({ message: "Invalid token. Please login again." });
    }

    // ── Re-verify the user's current status against the database ──
    // The JWT may be valid (signature + non-expired) but the user could have
    // been deleted, deactivated, or rejected since the token was issued.
    try {
      const user = await findUserByIdForAuth(pool, decoded.id);

      if (!user) {
        // User no longer exists (deleted or removed from DB)
        return res.status(401).json({
          message: "Account is no longer active/authorized. Please contact an administrator.",
        });
      }

      // Reject inactive / non-approved users
      const isActive = user.is_active === 1;
      if (
        !isActive ||
        user.account_status === "deactivated" ||
        user.account_status === "rejected" ||
        user.account_status === "pending"
      ) {
        return res.status(401).json({
          message: "Account is no longer active/authorized. Please contact an administrator.",
        });
      }

      // Attach the FRESH database record (not the stale JWT claims)
      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        full_name: user.full_name,
        organization_id: user.organization_id ?? null,
        account_status: user.account_status,
        is_active: user.is_active,
        permissions: user.permissions || [],
      };

      next();
    } catch (err) {
      // Fail-closed: if we cannot verify the user against the DB, deny access
      console.error("[authenticate] DB verification failed:", err?.message || err);
      return res.status(401).json({
        message: "Authentication failed. Please login again.",
      });
    }
  };
}

/**
 * Middleware factory that checks if the authenticated user has one of the allowed roles.
 * Must be used AFTER the `authenticate` middleware.
 *
 * @param  {...string} allowedRoles - e.g. "super_admin", "administrator"
 * @returns {Function} Express middleware
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied. You do not have the required permissions.",
      });
    }

    next();
  };
}

/**
 * Middleware factory that checks if the authenticated user has a specific
 * permission key. Super Admin bypasses all permission checks.
 * Must be used AFTER the `authenticate` middleware.
 *
 * @param {string|string[]} required - Permission key(s), e.g. PERMISSION_KEYS.MANAGE_USERS
 * @returns {Function} Express middleware
 */
export function authorizePermission(...required) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    // Super Admin has full access
    if (req.user.role === "super_admin") {
      return next();
    }

    const perms = req.user.permissions || [];
    const hasAll = required.every((perm) => perms.includes(perm));
    if (!hasAll) {
      return res.status(403).json({
        message: "Access denied. You do not have the required permissions.",
      });
    }

    next();
  };
}

/**
 * Middleware factory that checks if the authenticated user has AT LEAST ONE of
 * the given permission keys (OR semantics). Super Admin bypasses all checks.
 * Must be used AFTER the `authenticate` middleware.
 *
 * @param {string[]} required - Permission key(s), e.g. PERMISSION_KEYS.MANAGE_ATTENDANCE
 * @returns {Function} Express middleware
 */
export function authorizeAnyPermission(...required) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (req.user.role === "super_admin") {
      return next();
    }

    const perms = req.user.permissions || [];
    const hasAny = required.some((perm) => perms.includes(perm));
    if (!hasAny) {
      return res.status(403).json({
        message: "Access denied. You do not have the required permissions.",
      });
    }

    next();
  };
}

/**
 * Generate a JWT token for a user.
 *
 * @param {Object} user - User object from database
 * @returns {string} Signed JWT
 */
export async function isMaintenanceModeEnabled(pool) {
  try {
    const [rows] = await pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'maintenanceMode' LIMIT 1"
    );
    const value = rows?.[0]?.setting_value;
    if (value === undefined || value === null || value === "") return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  } catch {
    return false;
  }
}

export function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    full_name: user.full_name,
    organization_id: user.organization_id ?? null,
    account_status: user.account_status ?? "approved",
    permissions: user.permissions || [],
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d", // Token valid for 7 days
  });
}
