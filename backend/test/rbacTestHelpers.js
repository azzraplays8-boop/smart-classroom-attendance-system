/**
 * RBAC test helpers for attendance & data route tests.
 *
 * Provides:
 *   makeToken(role, extra) — generate a valid JWT for any role
 *   wrapPoolForAuth(pool, user) — wraps a stub pool so it can answer
 *     the `findUserByIdForAuth` / `getRolePermissions` queries that the
 *     `authenticate` middleware issues, returning the supplied user.
 *
 * Usage in a test:
 *
 *   const token = makeToken("administrator");
 *   const authedPool = wrapPoolForAuth(createStubPool(...), { id: 1, role: "administrator", ... });
 *   // mount router and send Authorization header with token
 */

import { generateToken } from "../src/auth/authMiddleware.js";

// Ensure JWT_SECRET is set for token generation
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = "test-secret-key-for-testing";
}

/**
 * Generate a valid JWT for the given role.
 * @param {"super_admin"|"administrator"|"viewer"|"moderator"|"encoder"|"teacher"} role
 * @param {Object} [extra]  Extra fields to merge into the user object
 * @returns {string} Signed JWT
 */
export function makeToken(role = "administrator", extra = {}) {
  return generateToken({
    id: 1,
    email: `${role}@test.local`,
    username: `test_${role}`,
    role,
    full_name: `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
    organization_id: 1,
    account_status: "approved",
    is_active: 1,
    permissions: role === "super_admin" ? [] : rolePermissionMap[role] || [],
    ...extra,
  });
}

/**
 * Permission keys assigned per role (matching the RBAC seed).
 */
const rolePermissionMap = {
  administrator: [
    "view_dashboard", "manage_users", "manage_attendance", "manage_reports",
    "manage_participants", "view_reports", "manage_qr", "manage_settings",
  ],
  moderator: ["view_dashboard", "manage_attendance", "manage_participants", "view_reports"],
  encoder: ["view_dashboard", "encode_attendance", "manage_participants"],
  viewer: ["view_dashboard", "view_reports"],
  teacher: [],
};

/**
 * Wrap a stub pool so it can respond to the authentication queries that
 * `findUserByIdForAuth` and `getRolePermissions` execute.
 *
 * @param {Object} pool             Original stub pool with query(sql, params)
 * @param {string} [role]           Role to use for the auth user (default "administrator")
 * @param {Object} [userOverride]   Additional properties to merge into the auth user row
 * @returns {Object}                Pool wrapper
 */
export function wrapPoolForAuth(pool, role = "administrator", userOverride = {}) {
  const defaultUser = {
    id: 1,
    email: "test@test.local",
    username: "testuser",
    full_name: "Test User",
    role,
    organization_id: 1,
    account_status: "approved",
    is_active: 1,
    organization_name: "Test Org",
    organization_code: "TST",
  };
  const authUser = { ...defaultUser, ...userOverride };
  // Ensure role from userOverride takes precedence
  if (userOverride.role) authUser.role = userOverride.role;
  authUser.role = role || authUser.role;

  return {
    async query(sql, params) {
      const sqlStr = String(sql);

      // Auth: findUserByIdForAuth — SELECT ... FROM users u ... WHERE u.id = ?
      if (sqlStr.includes("WHERE u.id = ?") && Array.isArray(params) && params.length === 1) {
        return [[authUser]];
      }

      // Auth: getRolePermissions — SELECT ... FROM user_permissions ...
      if (sqlStr.includes("FROM user_permissions")) {
        const perms = rolePermissionMap[authUser.role] || [];
        return [perms.map((key) => ({ permissionKey: key }))];
      }

      // Delegates to the original stub pool
      return pool.query(sql, params);
    },
  };
}