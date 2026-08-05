/**
 * JWT Authentication Middleware
 *
 * Verifies the Bearer token from the Authorization header,
 * extracts the user, and attaches it to req.user.
 *
 * Also provides role-based access control helpers.
 */
import jwt from "jsonwebtoken";

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
 * Verify that a valid JWT is present in the Authorization header.
 * If valid, attaches the decoded payload to req.user.
 * If invalid, returns 401.
 *
 * req.user = { id, email, username, role, full_name, organization_id,
 *              account_status, permissions }
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role, full_name, organization_id, account_status, permissions }
    if (!req.user.permissions) req.user.permissions = [];
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token has expired. Please login again." });
    }
    return res.status(401).json({ message: "Invalid token. Please login again." });
  }
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
 * Generate a JWT token for a user.
 *
 * @param {Object} user - User object from database
 * @returns {string} Signed JWT
 */
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
