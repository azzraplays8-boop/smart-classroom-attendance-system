 /**
 * Authentication & User Management Routes
 *
 * POST   /auth/register       - Register a new account (first user becomes super_admin)
 * POST   /auth/login          - Login with email/username and password
 * POST   /auth/logout         - Logout (placeholder for future token blacklist)
 * GET    /auth/me             - Get current authenticated user
 * GET    /auth/users          - List all users (Admin+ only)
 * POST   /auth/users          - Create a new user (Admin+ only)
 * PUT    /auth/users/:id      - Update a user (Admin+ only)
 * DELETE /auth/users/:id      - Delete a user (Admin+ only)
 * PUT    /auth/users/:id/reset-password - Reset user password (Admin+ only)
 * PUT    /auth/users/:id/status - Activate/Deactivate user (Admin+ only)
 */
import express from "express";
import bcrypt from "bcryptjs";
import { authenticate, authorize, generateToken } from "../auth/authMiddleware.js";

const SALT_ROUNDS = 12;

export default function authRouter({ pool }) {
  const router = express.Router();

  // ─────────────────────────────────────────────
  // POST /auth/register
  // ─────────────────────────────────────────────
  router.post("/register", async (req, res) => {
    try {
      const { full_name, username, email, password, confirm_password } = req.body;

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

      // --- Determine role: first user = super_admin, subsequent = administrator ---
      const [userCount] = await pool.query("SELECT COUNT(*) AS count FROM users");
      const role = userCount[0].count === 0 ? "super_admin" : "administrator";

      // --- Hash password and create user ---
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const [result] = await pool.query(
        `INSERT INTO users (email, username, password, full_name, role, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [normalizedEmail, normalizedUsername, hashedPassword, full_name.trim(), role]
      );

      // --- Generate JWT and return ---
      const newUser = {
        id: result.insertId,
        email: normalizedEmail,
        username: normalizedUsername,
        full_name: full_name.trim(),
        role,
        is_active: 1,
      };

      const token = generateToken(newUser);

      return res.status(201).json({
        message: role === "super_admin"
          ? "Super Administrator account created successfully."
          : "Administrator account created successfully.",
        token,
        user: newUser,
      });
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

      // Find user by email or username
      const [users] = await pool.query(
        "SELECT id, email, username, password, full_name, role, is_active FROM users WHERE email = ? OR username = ?",
        [email, email]
      );

      if (users.length === 0) {
        return res.status(401).json({ message: "Invalid username or password." });
      }

      const user = users[0];

      // Check if account is active
      if (!user.is_active) {
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
      const { password: _, ...userData } = user;

      return res.json({
        message: "Login successful.",
        token,
        user: userData,
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
  router.post("/logout", authenticate, async (req, res) => {
    // In V1, we simply acknowledge the logout.
    // Future versions can implement a token blacklist.
    return res.json({ message: "Logged out successfully." });
  });

  // ─────────────────────────────────────────────
  // GET /auth/me
  // ─────────────────────────────────────────────
  router.get("/me", authenticate, async (req, res) => {
    try {
      const [users] = await pool.query(
        "SELECT id, email, username, full_name, role, is_active, created_at, updated_at FROM users WHERE id = ?",
        [req.user.id]
      );

      if (users.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      return res.json({ user: users[0] });
    } catch (err) {
      console.error("=== GET /auth/me ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to fetch user." });
    }
  });

  // ─────────────────────────────────────────────
  // User Management Routes (Admin+ only)
  // ─────────────────────────────────────────────

  // GET /auth/users - List all users
  router.get("/users", authenticate, authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const [users] = await pool.query(
        "SELECT id, email, username, full_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC"
      );
      return res.json({ users });
    } catch (err) {
      console.error("=== GET /auth/users ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to fetch users." });
    }
  });

  // POST /auth/users - Create a new user
  router.post("/users", authenticate, authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const { email, username, password, full_name, role } = req.body;

      // Validate required fields
      if (!email || !username || !password || !full_name || !role) {
        return res.status(400).json({ message: "All fields are required: email, username, password, full_name, role." });
      }

      // Validate role
      const validRoles = ["super_admin", "administrator", "teacher"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}.` });
      }

      // Validate password strength
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters long." });
      }

      // Check for existing email or username
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        [email, username]
      );

      if (existing.length > 0) {
        return res.status(409).json({ message: "A user with this email or username already exists." });
      }

      // Hash password and create user
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const [result] = await pool.query(
        `INSERT INTO users (email, username, password, full_name, role, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [email, username, hashedPassword, full_name, role]
      );

      const newUser = {
        id: result.insertId,
        email,
        username,
        full_name,
        role,
        is_active: 1,
      };

      return res.status(201).json({ message: "User created successfully.", user: newUser });
    } catch (err) {
      console.error("=== POST /auth/users ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to create user." });
    }
  });

  // PUT /auth/users/:id - Update a user
  router.put("/users/:id", authenticate, authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { email, username, full_name, role } = req.body;

      // Check user exists
      const [existing] = await pool.query("SELECT id FROM users WHERE id = ?", [userId]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      // Check for duplicate email/username (excluding current user)
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
        const validRoles = ["super_admin", "administrator", "teacher"];
        if (!validRoles.includes(role)) {
          return res.status(400).json({ message: `Invalid role. Must be one of: ${validRoles.join(", ")}.` });
        }
        updates.push("role = ?");
        params.push(role);
      }

      if (updates.length === 0) {
        return res.status(400).json({ message: "No fields to update." });
      }

      params.push(userId);
      await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params);

      return res.json({ message: "User updated successfully." });
    } catch (err) {
      console.error("=== PUT /auth/users/:id ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update user." });
    }
  });

  // DELETE /auth/users/:id - Delete a user
  router.delete("/users/:id", authenticate, authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;

      // Prevent self-deletion
      if (Number(userId) === req.user.id) {
        return res.status(400).json({ message: "You cannot delete your own account." });
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

  // PUT /auth/users/:id/reset-password - Reset user password
  router.put("/users/:id/reset-password", authenticate, authorize("super_admin", "administrator"), async (req, res) => {
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

  // PUT /auth/users/:id/status - Activate/Deactivate user
  router.put("/users/:id/status", authenticate, authorize("super_admin", "administrator"), async (req, res) => {
    try {
      const userId = req.params.id;
      const { is_active } = req.body;

      // Prevent self-deactivation
      if (Number(userId) === req.user.id) {
        return res.status(400).json({ message: "You cannot change your own account status." });
      }

      if (is_active === undefined || is_active === null) {
        return res.status(400).json({ message: "is_active field is required (1 or 0)." });
      }

      const activeValue = Number(is_active) ? 1 : 0;

      const [result] = await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [activeValue, userId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "User not found." });
      }

      return res.json({
        message: activeValue ? "User activated successfully." : "User deactivated successfully.",
      });
    } catch (err) {
      console.error("=== PUT /auth/users/:id/status ERROR ===");
      console.error(err.message);
      return res.status(500).json({ message: "Failed to update user status." });
    }
  });

  return router;
}
