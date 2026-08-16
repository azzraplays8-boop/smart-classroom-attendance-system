/**
 * Authentication & User Management Routes — Enterprise RBAC
 *
 * POST   /auth/register        - Register (first user = approved Super Admin;
 *                                 others require invitation code -> pending approval)
 * POST   /auth/login           - Login with email/username + password (return org + permissions)
 * POST   /auth/logout          - Logout
 * GET    /auth/me              - Get current authenticated user (with org + permissions)
 * GET    /auth/users           - List all users (Admin+)
 * POST   /auth/users           - Create a new user (Admin+)
 * PUT    /auth/users/:id       - Update a user (Admin+) incl. role & organization
 * DELETE /auth/users/:id       - Delete a user (Admin+)
 * PUT    /auth/users/:id/reset-password - Reset password (Admin+)
 * PUT    /auth/users/:id/status - Activate/Deactivate (Admin+)
 * PUT    /auth/users/:id/role  - Assign/change role (Admin+)
 * PUT    /auth/users/:id/organization - Assign organization (Admin+)
 * GET    /auth/pending         - List pending registrations (Admin+)
 * POST   /auth/pending/:id/approve - Approve pending registration (Admin+)
 * POST   /auth/pending/:id/reject  - Reject pending registration (Admin+)
 * GET    /auth/roles           - List roles + permissions
 */
import express from "express";
import bcrypt from "bcryptjs";
import { authenticate, authorize, generateToken, authorizePermission, PERMISSION_KEYS } from "../auth/authMiddleware.js";
import { findUserForAuth, findUserByIdForAuth, getRolePermissions } from "../auth/permissions.js";

const SALT_ROUNDS = 12;

// Roles that can be assigned by an administrator (NOT super_admin).
const ASSIGNABLE_ROLES = ["administrator", "teacher", "moderator", "encoder", "viewer"];

function parseNameParts(fullName) {
  const clean = String(fullName ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return { firstName: "", middleName: "", lastName: "" };

  const parts = clean.split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
  if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function buildParticipantIdentifier(userId, username, fullName) {
  const base = `${String(username || fullName || "member").replace(/[^a-zA-Z0-9]+/g, "").slice(0, 16) || "member"}`.toUpperCase();
  return `${base}-${String(userId).padStart(6, "0")}`;
}

async function ensureParticipantLink(connection, userId, email, fullName, username) {
  const [existingRows] = await connection.query(
    `SELECT id, participant_identifier AS participantIdentifier, user_id AS userId
       FROM participants
      WHERE user_id = ? OR LOWER(email) = LOWER(?)
      ORDER BY id ASC
      LIMIT 1`,
    [userId, String(email || "").trim()]
  );

  if (existingRows && existingRows.length > 0) {
    return existingRows[0];
  }

  const [nameColumnResult] = await connection.query(
    `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'participants'
        AND COLUMN_NAME = 'name'`
  );
  const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;

  const nameParts = parseNameParts(fullName);
  const participantIdentifier = buildParticipantIdentifier(userId, username, fullName);
  let uniqueIdentifier = participantIdentifier;
  let suffix = 1;

  while (true) {
    const [dupRows] = await connection.query(
      "SELECT id FROM participants WHERE participant_identifier = ? LIMIT 1",
      [uniqueIdentifier]
    );

    if (!dupRows || dupRows.length === 0) break;

    uniqueIdentifier = `${participantIdentifier}-${suffix}`;
    suffix += 1;
  }

  const insertSql = hasNameColumn
    ? `INSERT INTO participants (
          participant_identifier,
          qr_code,
          name,
          last_name,
          first_name,
          middle_name,
          gender,
          date_of_birth,
          email,
          user_id,
          contact_number,
          department,
          level,
          group_name,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    : `INSERT INTO participants (
          participant_identifier,
          qr_code,
          last_name,
          first_name,
          middle_name,
          gender,
          date_of_birth,
          email,
          user_id,
          contact_number,
          department,
          level,
          group_name,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const fullNameDisplay = `${nameParts.firstName} ${nameParts.middleName} ${nameParts.lastName}`.replace(/\s+/g, " ").trim();
  const insertParams = hasNameColumn
    ? [
        uniqueIdentifier,
        uniqueIdentifier,
        fullNameDisplay,
        nameParts.lastName || "",
        nameParts.firstName || "",
        nameParts.middleName || "",
        "",
        null,
        String(email || "").trim().toLowerCase(),
        userId,
        "",
        "",
        "",
        "",
        "Active",
      ]
    : [
        uniqueIdentifier,
        uniqueIdentifier,
        nameParts.lastName || "",
        nameParts.firstName || "",
        nameParts.middleName || "",
        "",
        null,
        String(email || "").trim().toLowerCase(),
        userId,
        "",
        "",
        "",
        "",
        "Active",
      ];

  const [insertResult] = await connection.query(insertSql, insertParams);

  return {
    id: insertResult.insertId,
    participantIdentifier: uniqueIdentifier,
    userId,
  };
}

export default function authRouter({ pool }) {
  const router = express.Router();

  // ─────────────────────────────────────────────
  // Helper: validate invitation code and resolve organization
  // ─────────────────────────────────────────────
  async function resolveInvitationCode(code) {
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) {
      return { error: "Invitation code is required." };
    }

    const [rows] = await pool.query(
      `SELECT id, organization_id, code, expires_at, max_uses, used_count, status
         FROM organization_invitation_codes
        WHERE code = ?`,
      [normalizedCode]
    );

    if (!rows || rows.length === 0) {
      return { error: "Invalid invitation code." };
    }

    const invite = rows[0];

    if (invite.status !== "active") {
      return { error: "This invitation code is disabled." };
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { error: "This invitation code has expired." };
    }

    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
      return { error: "This invitation code has reached its maximum number of uses." };
    }

    return { invite };
  }

  // ─────────────────────────────────────────────
  // POST /auth/register
  // ─────────────────────────────────────────────
  router.post("/register", async (req, res) => {
    try {
      const { full_name, username, email, password, confirm_password, invitation_code } = req.body;

      // --- Validate required fields ---
      if (!full_name || !full_name.trim()) {
        return res.status(400).json({ message: "Full name is required." });
      }
      if (!username || !username.trim()) {
        return res.status(400).json({ message: "Username is required." });
      }
      if (!email || !email.trim()) {
        return res.status(400).json({ message: "Email is required." });
      }
      if (!password) {
        return res.status(400).json({ message: "Password is required." });
      }
      if (!confirm_password) {
        return res.status(400).json({ message: "Confirm password is required." });
      }

      // --- Validate password length ---
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long." });
      }

      // --- Validate confirm password ---
      if (password !== confirm_password) {
        return res.status(400).json({ message: "Passwords do not match." });
      }

      // --- Validate email format ---
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: "Please provide a valid email address." });
      }

      // --- Validate username format (alphanumeric + underscores, 3-30 chars) ---
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(username.trim())) {
        return res.status(400).json({ message: "Username must be 3-30 characters and can only contain letters, numbers, and underscores." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username.trim().toLowerCase();

      // --- Check for existing email or username ---
      const [emailCheck] = await pool.query("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
      if (emailCheck.length > 0) {
        return res.status(409).json({ message: "An account with this email already exists." });
      }

      const [usernameCheck] = await pool.query("SELECT id FROM users WHERE username = ?", [normalizedUsername]);
      if (usernameCheck.length > 0) {
        return res.status(409).json({ message: "This username is already taken." });
      }

      // --- Determine if this is the first user (Super Admin) ---
      const [userCount] = await pool.query("SELECT COUNT(*) AS count FROM users");
      const isFirstUser = Number(userCount[0].count) === 0;

      let role;
      let accountStatus;
      let organizationId = null;
      let resolvedInvite = null;

      if (isFirstUser) {
        // First user becomes the sole Super Admin, auto-approved, no org required.
        role = "super_admin";
        accountStatus = "approved";
      } else {
        // Subsequent registrations require a valid invitation code and become pending.
        const result = await resolveInvitationCode(invitation_code);
        if (result.error) {
          return res.status(400).json({ message: result.error });
        }
        resolvedInvite = result.invite;
        organizationId = resolvedInvite.organization_id;
        role = "viewer"; // placeholder role until admin assigns one on approval
        accountStatus = "pending";
      }

      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        // --- Hash password and create user ---
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        const [result] = await connection.query(
          `INSERT INTO users (email, username, password, full_name, role, is_active, account_status, organization_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [normalizedEmail, normalizedUsername, hashedPassword, full_name.trim(), role,
           isFirstUser ? 1 : 0, accountStatus, organizationId]
        );

        const newUserId = result.insertId;

        // --- Create the linked participant profile atomically to avoid duplicate records.
        const existingParticipant = await ensureParticipantLink(
          connection,
          newUserId,
          normalizedEmail,
          full_name.trim(),
          normalizedUsername
        );

        // --- If used an invitation code, increment its use count ---
        if (resolvedInvite) {
          await connection.query(
            `UPDATE organization_invitation_codes SET used_count = used_count + 1 WHERE id = ?`,
            [resolvedInvite.id]
          );

          // Create a pending registration record
          await connection.query(
            `INSERT INTO pending_registrations (user_id, organization_id, claimed_invitation_code, status, requested_role)
             VALUES (?, ?, ?, 'pending', 'viewer')`,
            [newUserId, resolvedInvite.organization_id, resolvedInvite.code]
          );
        }

        await connection.commit();

        // --- Load the created user (with permissions) ---
        const createdUser = await findUserByIdForAuth(pool, newUserId);

        if (isFirstUser) {
          const token = generateToken(createdUser);
          return res.status(201).json({
            message: "Super Administrator account created successfully. You are now the system Super Admin.",
            token,
            user: createdUser,
            participant: existingParticipant,
          });
        }

        // Pending users do NOT get a token (cannot log in until approved).
        return res.status(201).json({
          message: "Registration submitted. Your account is pending approval. You will be able to log in once an administrator approves your account.",
          user: null,
          participant: existingParticipant,
          pending: true,
        });
      } catch (err) {
        if (connection) {
          await connection.rollback().catch(() => {});
        }
        throw err;
      } finally {
        if (connection) {
          connection.release();
        }
      }
    } catch (err) {
      console.error("=== POST /auth/register ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  // ─────────────────────────────────────────────
  // POST /auth/login
  // ─────────────────────────────────────────────
  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email/username and password are required." });
      }

      const user = await findUserForAuth(pool, email);

      if (!user) {
        return res.status(401).json({ message: "Invalid username or password." });
      }

      // Check account status
      if (user.account_status === "pending") {
        return res.status(403).json({ message: "Your account is pending approval. Please wait for an administrator to approve your account." });
      }
      if (user.account_status === "rejected") {
        return res.status(403).json({ message: "Your registration was rejected. Contact an administrator for assistance." });
      }
      if (!user.is_active || user.account_status === "deactivated") {
        return res.status(403).json({ message: "Account is deactivated. Contact an administrator." });
      }

      // Verify password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid username or password." });
      }

      // Generate JWT
      const token = generateToken(user);

      // Return user data (without password)
      const { password: _, permissions, ...userData } = user;

      return res.json({
        message: "Login successful.",
        token,
        user: { ...userData, permissions },
      });
    } catch (err) {
      console.error("=== POST /auth/login ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // ─────────────────────────────────────────────
  // POST /auth/logout
  // ─────────────────────────────────────────────
  router.post("/logout", authenticate(pool), async (req, res) => {
    return res.json({ message: "Logged out successfully." });
  });

  // ─────────────────────────────────────────────
  // GET /auth/me
  // ─────────────────────────────────────────────
  router.get("/me", authenticate(pool), async (req, res) => {
    try {
      const user = await findUserByIdForAuth(pool, req.user.id);

      if (!user) {
        return res.status(401).json({ message: "Account is no longer active/authorized. Please contact an administrator." });
      }

      return res.json({ user });
    } catch (err) {
      console.error("=== GET /auth/me ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to fetch user." });
    }
  });

  // ─────────────────────────────────────────────
  // GET /auth/roles — list roles + permissions
  // ─────────────────────────────────────────────
  router.get("/roles", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const [roles] = await pool.query(
        `SELECT r.id, r.role_key AS roleKey, r.role_name AS roleName, r.description
           FROM user_roles r
          ORDER BY r.id ASC`
      );

      const [perms] = await pool.query(
        `SELECT p.role_id AS roleId, p.permission_key AS permissionKey
           FROM user_permissions p`
      );

      const permMap = {};
      for (const p of perms) {
        if (!permMap[p.roleId]) permMap[p.roleId] = [];
        permMap[p.roleId].push(p.permissionKey);
      }

      const result = roles.map((r) => ({
        ...r,
        permissions: permMap[r.id] || [],
      }));

      return res.json({ roles: result });
    } catch (err) {
      console.error("=== GET /auth/roles ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to fetch roles." });
    }
  });

  // ─────────────────────────────────────────────
  // GET /auth/users - List all users
  // ─────────────────────────────────────────────
  router.get("/users", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const [users] = await pool.query(
        `SELECT u.id, u.email, u.username, u.full_name, u.role, u.is_active,
                u.account_status, u.organization_id, o.name AS organization_name,
                u.created_at, u.updated_at
           FROM users u
           LEFT JOIN organizations o ON o.id = u.organization_id
          ORDER BY u.created_at DESC`
      );
      return res.json({ users });
    } catch (err) {
      console.error("=== GET /auth/users ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to fetch users." });
    }
  });

  // ─────────────────────────────────────────────
  // POST /auth/users - Create a new user (Admin+)
  // ─────────────────────────────────────────────
  router.post("/users", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const { email, username, password, full_name, role, organization_id } = req.body;

      if (!email || !username || !password || !full_name || !role) {
        return res.status(400).json({ message: "All fields are required: email, username, password, full_name, role." });
      }

      const validRoles = ["super_admin", ...ASSIGNABLE_ROLES];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}.` });
      }

      // Only Super Admin can create another Super Admin
      if (role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "Only the Super Admin can create a Super Admin account." });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long." });
      }

      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        [email, username]
      );
      if (existing.length > 0) {
        return res.status(409).json({ message: "A user with this email or username already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const [result] = await pool.query(
        `INSERT INTO users (email, username, password, full_name, role, is_active, account_status, organization_id)
         VALUES (?, ?, ?, ?, ?, 1, 'approved', ?)`,
        [email, username, hashedPassword, full_name, role, organization_id || null]
      );

      // If an organization was provided, add membership
      if (organization_id) {
        await pool.query(
          `INSERT IGNORE INTO organization_members (organization_id, user_id, role, status)
           VALUES (?, ?, ?, 'active')`,
          [organization_id, result.insertId, role]
        );
      }

      const newUser = {
        id: result.insertId,
        email,
        username,
        full_name,
        role,
        is_active: 1,
        account_status: "approved",
        organization_id: organization_id || null,
      };

      return res.status(201).json({ message: "User created successfully.", user: newUser });
    } catch (err) {
      console.error("=== POST /auth/users ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to create user." });
    }
  });

  // ─────────────────────────────────────────────
  // PUT /auth/users/:id - Update user (Admin+)
  // ─────────────────────────────────────────────
  router.put("/users/:id", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { email, username, full_name, role, organization_id } = req.body;

      const [existing] = await pool.query("SELECT id, role FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      // Prevent non-super-admin from editing the super_admin
      if (existing[0].role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "You cannot modify the Super Admin account." });
      }

      if (email || username) {
        const [duplicates] = await pool.query(
          "SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?",
          [email || "", username || "", userId]
        );
        if (duplicates.length > 0) {
          return res.status(409).json({ message: "Email or username already taken by another user." });
        }
      }

      const updates = [];
      const params = [];

      if (email !== undefined) { updates.push("email = ?"); params.push(email); }
      if (username !== undefined) { updates.push("username = ?"); params.push(username); }
      if (full_name !== undefined) { updates.push("full_name = ?"); params.push(full_name); }
      if (role !== undefined) {
        const validRoles = ["super_admin", ...ASSIGNABLE_ROLES];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}.` });
        }
        if (role === "super_admin" && req.user.role !== "super_admin") {
          return res.status(403).json({ message: "Only the Super Admin can assign the Super Admin role." });
        }
        updates.push("role = ?");
        params.push(role);
      }
      if (organization_id !== undefined) {
        updates.push("organization_id = ?");
        params.push(organization_id || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update." });
      }

      params.push(userId);
      await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

      // If organization changed, sync membership
      if (organization_id !== undefined) {
        await pool.query(
          `INSERT IGNORE INTO organization_members (organization_id, user_id, role, status)
           VALUES (?, ?, ?, 'active')`,
          [organization_id || null, userId, role || existing[0].role]
        );
      }

      return res.json({ message: "User updated successfully." });
    } catch (err) {
      console.error("=== PUT /auth/users/:id ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update user." });
    }
  });

  // ─────────────────────────────────────────────
  // PUT /auth/users/:id/role - Assign/change role
  // ─────────────────────────────────────────────
  router.put("/users/:id/role", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({ message: "Role is required." });
      }

      const validRoles = ["super_admin", ...ASSIGNABLE_ROLES];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}.` });
      }

      const [existing] = await pool.query("SELECT id, role FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      if (existing[0].role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "You cannot change the Super Admin's role." });
      }
      if (role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "Only the Super Admin can assign the Super Admin role." });
      }

      await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, userId]);

      // Sync membership role
      const [memberRows] = await pool.query(
        "SELECT id FROM organization_members WHERE user_id = ? LIMIT 1",
        [userId]
      );
      if (memberRows.length > 0) {
        await pool.query(
          "UPDATE organization_members SET role = ? WHERE user_id = ?",
          [role, userId]
        );
      }

      return res.json({ message: "Role updated successfully." });
    } catch (err) {
      console.error("=== PUT /auth/users/:id/role ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update role." });
    }
  });

  // ─────────────────────────────────────────────
  // PUT /auth/users/:id/organization - Assign organization
  // ─────────────────────────────────────────────
  router.put("/users/:id/organization", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { organization_id } = req.body;

      const [existing] = await pool.query("SELECT id, role FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      if (existing[0].role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "You cannot change the Super Admin's organization." });
      }

      const orgId = organization_id || null;
      await pool.query("UPDATE users SET organization_id = ? WHERE id = ?", [orgId, userId]);

      if (orgId) {
        await pool.query(
          `INSERT IGNORE INTO organization_members (organization_id, user_id, role, status)
           VALUES (?, ?, ?, 'active')`,
          [orgId, userId, existing[0].role]
        );
      }

      return res.json({ message: "Organization updated successfully." });
    } catch (err) {
      console.error("=== PUT /auth/users/:id/organization ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update organization." });
    }
  });

  // ─────────────────────────────────────────────
  // DELETE /auth/users/:id - Delete a user (Admin+)
  // ─────────────────────────────────────────────
  router.delete("/users/:id", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;

      if (Number(userId) === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account." });
      }

      const [existing] = await pool.query("SELECT role FROM users WHERE id = ?", [userId]);
      if (existing.length > 0 && existing[0].role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "You cannot delete the Super Admin account." });
      }

      const [result] = await pool.query("DELETE FROM users WHERE id = ?", [userId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      return res.json({ message: "User deleted successfully." });
    } catch (err) {
      console.error("=== DELETE /auth/users/:id ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to delete user." });
    }
  });

  // ─────────────────────────────────────────────
  // PUT /auth/users/:id/reset-password - Reset password (Admin+)
  // ─────────────────────────────────────────────
  router.put("/users/:id/reset-password", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters long." });
      }

      const [existing] = await pool.query("SELECT id FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);

      return res.json({ message: "Password reset successfully." });
    } catch (err) {
      console.error("=== PUT /auth/users/:id/reset-password ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to reset password." });
    }
  });

  // ─────────────────────────────────────────────
  // PUT /auth/users/:id/status - Activate/Deactivate (Admin+)
  // ─────────────────────────────────────────────
  router.put("/users/:id/status", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { is_active } = req.body;

      if (Number(userId) === req.user.id) {
        return res.status(400).json({ message: "You cannot change your own account status." });
      }

      const [existing] = await pool.query("SELECT role FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }
      if (existing[0].role === "super_admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ message: "You cannot change the Super Admin's status." });
      }

      if (is_active === undefined || is_active === null) {
        return res.status(400).json({ message: "is_active field is required (1 or 0)." });
      }

      const activeValue = Number(is_active) ? 1 : 0;
      const accountStatus = activeValue ? "approved" : "deactivated";

      await pool.query("UPDATE users SET is_active = ?, account_status = ? WHERE id = ?",
        [activeValue, accountStatus, userId]);

      return res.json({
        message: activeValue ? "User activated successfully." : "User deactivated successfully.",
      });
    } catch (err) {
      console.error("=== PUT /auth/users/:id/status ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update user status." });
    }
  });

  // ─────────────────────────────────────────────
  // GET /auth/pending - List pending registrations
  // ─────────────────────────────────────────────
  router.get("/pending", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT p.id, p.user_id AS userId, u.full_name, u.email, u.username,
                p.organization_id AS organizationId, o.name AS organization_name,
                p.claimed_invitation_code AS invitationCode, p.status,
                p.requested_role AS requestedRole, p.created_at AS createdAt
           FROM pending_registrations p
           INNER JOIN users u ON u.id = p.user_id
           LEFT JOIN organizations o ON o.id = p.organization_id
          WHERE p.status = 'pending'
          ORDER BY p.created_at ASC`
      );
      return res.json({ pending: rows });
    } catch (err) {
      console.error("=== GET /auth/pending ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to fetch pending registrations." });
    }
  });

  // ─────────────────────────────────────────────
  // POST /auth/pending/:id/approve - Approve a pending registration
  // ─────────────────────────────────────────────
  router.post("/pending/:id/approve", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const pendingId = req.params.id;
      const { role, organization_id } = req.body;

      const [pendingRows] = await pool.query(
        `SELECT p.* FROM pending_registrations p WHERE p.id = ? AND p.status = 'pending'`,
        [pendingId]
      );
      if (!pendingRows || pendingRows.length === 0) {
        return res.status(404).json({ message: "Pending registration not found or already processed." });
      }

      const pending = pendingRows[0];
      const assignRole = role && ASSIGNABLE_ROLES.includes(role) ? role : "viewer";
      const assignOrg = organization_id || pending.organization_id;

      // Approve the user
      await pool.query(
        `UPDATE users SET account_status = 'approved', is_active = 1, role = ?, organization_id = ?
         WHERE id = ?`,
        [assignRole, assignOrg || null, pending.user_id]
      );

      // Add organization membership
      if (assignOrg) {
        await pool.query(
          `INSERT IGNORE INTO organization_members (organization_id, user_id, role, status)
           VALUES (?, ?, 'active')`,
          [assignOrg, pending.user_id, assignRole]
        );
      }

      // Update pending registration
      await pool.query(
        `UPDATE pending_registrations SET status = 'approved', reviewed_by = ?, reviewed_at = NOW()
         WHERE id = ?`,
        [req.user.id, pendingId]
      );

      return res.json({ message: "User approved and activated successfully." });
    } catch (err) {
      console.error("=== POST /auth/pending/:id/approve ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to approve registration." });
    }
  });

  // ─────────────────────────────────────────────
  // POST /auth/pending/:id/reject - Reject a pending registration
  // ─────────────────────────────────────────────
  router.post("/pending/:id/reject", authenticate(pool), authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const pendingId = req.params.id;

      const [pendingRows] = await pool.query(
        `SELECT p.* FROM pending_registrations p WHERE p.id = ? AND p.status = 'pending'`,
        [pendingId]
      );
      if (!pendingRows || pendingRows.length === 0) {
        return res.status(404).json({ message: "Pending registration not found or already processed." });
      }

      const pending = pendingRows[0];

      // Reject the user
      await pool.query(
        `UPDATE users SET account_status = 'rejected', is_active = 0 WHERE id = ?`,
        [pending.user_id]
      );

      // Update pending registration
      await pool.query(
        `UPDATE pending_registrations SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW()
         WHERE id = ?`,
        [req.user.id, pendingId]
      );

      return res.json({ message: "Registration rejected." });
    } catch (err) {
      console.error("=== POST /auth/pending/:id/reject ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to reject registration." });
    }
  });

  return router;
}
