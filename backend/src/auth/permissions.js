/**
 * RBAC permission helpers.
 *
 * Fetches the permission keys for a given role from the user_permissions
 * table. Super Admin is treated as having full access (handled by the
 * authorizePermission middleware, so this returns [] to keep tokens small).
 */

/**
 * Get the list of permission keys for a role.
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} role - e.g. 'administrator', 'moderator', 'encoder', 'viewer', 'teacher'
 * @returns {Promise<string[]>} Array of permission keys
 */
export async function getRolePermissions(pool, role) {
  if (role === "super_admin") return [];

  try {
    const [rows] = await pool.query(
      `SELECT p.permission_key AS permissionKey
         FROM user_permissions p
         INNER JOIN user_roles r ON r.id = p.role_id
        WHERE r.role_key = ?`,
      [role]
    );
    return rows.map((r) => r.permissionKey);
  } catch (err) {
    // If the RBAC tables don't exist yet (e.g. migration hasn't run),
    // fall back to a safe minimal set to avoid breaking the app.
    console.error("[permissions] Failed to load permissions for role:", role, err?.message);
    return [];
  }
}

/**
 * Load a full authenticated user object (including org + permissions)
 * by their email or username. Used by login.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} identifier - email or username
 * @returns {Promise<Object|null>} user object (password included) or null
 */
export async function findUserForAuth(pool, identifier) {
  const [users] = await pool.query(
    `SELECT u.id, u.email, u.username, u.password, u.full_name, u.role,
            u.is_active, u.account_status, u.organization_id,
            o.name AS organization_name, o.org_code AS organization_code
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.email = ? OR u.username = ?`,
    [identifier, identifier]
  );

  if (!users || users.length === 0) return null;

  const user = users[0];
  user.permissions = await getRolePermissions(pool, user.role);
  return user;
}

/**
 * Load a full authenticated user object by ID. Used by /auth/me.
 */
export async function findUserByIdForAuth(pool, id) {
  const [users] = await pool.query(
    `SELECT u.id, u.email, u.username, u.full_name, u.role,
            u.is_active, u.account_status, u.organization_id,
            o.name AS organization_name, o.org_code AS organization_code
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = ?`,
    [id]
  );

  if (!users || users.length === 0) return null;

  const user = users[0];
  user.permissions = await getRolePermissions(pool, user.role);
  return user;
}
