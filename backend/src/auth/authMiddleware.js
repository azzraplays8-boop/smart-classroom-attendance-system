/**
 * JWT Authentication Middleware
 *
 * Verifies the Bearer token from the Authorization header,
 * extracts the user, and attaches it to req.user.
 *
 * Also provides role-based access control helpers.
 */
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "smart-attendance-jwt-secret-dev-only";

/**
 * Verify that a valid JWT is present in the Authorization header.
 * If valid, attaches the decoded payload to req.user.
 * If invalid, returns 401.
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required. No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role, full_name }
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
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "7d", // Token valid for 7 days
  });
}
