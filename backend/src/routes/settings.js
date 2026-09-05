import express from "express";
import {
  authenticate,
  authorizePermission,
  PERMISSION_KEYS,
} from "../auth/authMiddleware.js";

// Ensure the settings table exists (safety net in case migration hasn't run)
const ENSURE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(255) NOT NULL,
  setting_value LONGTEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_settings_key (setting_key)
)`;

async function ensureTable(pool) {
  try {
    await pool.query(ENSURE_TABLE_SQL);
  } catch (err) {
    console.error("[settings] Failed to ensure settings table:", err);
  }
}

export default function settingsRouter({ pool }) {
  const router = express.Router();

  // Reading settings requires login; changing them requires MANAGE_SETTINGS.
  const auth = authenticate(pool);

  // GET /settings/public — unauthenticated maintenance-mode status probe.
  // Exposes ONLY the maintenance flag (no other settings) so the frontend can
  // show/refresh the Maintenance page before/while logging in.
  router.get("/public", async (req, res) => {
    try {
      await ensureTable(pool);
      const [rows] = await pool.query(
        "SELECT setting_value FROM settings WHERE setting_key = 'maintenanceMode' LIMIT 1"
      );
      const raw = rows?.[0]?.setting_value;
      return res.json({ maintenanceMode: raw === "true" || raw === true || raw === 1 || raw === "1" });
    } catch (err) {
      console.error("GET /settings/public error:", err?.message || err);
      // Fail open: if the probe fails, do not lock everyone out.
      return res.json({ maintenanceMode: false });
    }
  });

  // GET /settings/registration — public academic options used by registration.
  // These values are safe to expose and keep the public form consistent with
  // the options configured by an administrator instead of browser storage.
  router.get("/registration", async (req, res) => {
    try {
      await ensureTable(pool);
      const [rows] = await pool.query(
        `SELECT setting_key, setting_value
           FROM settings
          WHERE setting_key IN ('defaultDepartments', 'departmentOptions', 'defaultCourses', 'courseOptions', 'defaultSections', 'sectionOptions', 'positionLevels', 'yearLevelOptions')`
      );
      const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
      return res.json({ settings });
    } catch (err) {
      console.error("GET /settings/registration error:", err?.message || err);
      return res.status(500).json({ message: "Failed to fetch registration options." });
    }
  });

  // GET /settings — return all settings as a flat object
  router.get("/", auth, async (req, res) => {
    try {
      await ensureTable(pool);
      const [rows] = await pool.query("SELECT setting_key, setting_value FROM settings");
      const settings = {};
      for (const row of rows) {
        settings[row.setting_key] = row.setting_value;
      }
      return res.json({ settings });
    } catch (err) {
      console.error("=== GET /settings ERROR ===");
      console.error(err?.message || err);
      console.error(err?.stack || "(no stack)");
      return res.status(500).json({ message: "Failed to fetch settings: " + (err?.message || "Unknown error") });
    }
  });

  // PUT /settings — upsert multiple settings at once
  // Body: { schoolName: "...", schoolLogo: "data:image/...", ... }
  router.put("/", auth, authorizePermission(PERMISSION_KEYS.MANAGE_SETTINGS), async (req, res) => {
    try {
      await ensureTable(pool);

      const body = req.body || {};
      const keys = Object.keys(body);

      if (keys.length === 0) {
        return res.status(400).json({ message: "No settings provided" });
      }

      console.log("[settings] Saving keys:", keys);

      for (const key of keys) {
        const value = body[key] !== undefined && body[key] !== null ? String(body[key]) : "";
        const insertSql = `INSERT INTO settings (setting_key, setting_value)
                           VALUES (?, ?)
                           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`;
        await pool.query(insertSql, [key, value]);
      }

      return res.json({ message: "Settings saved successfully" });
    } catch (err) {
      console.error("=== PUT /settings ERROR ===");
      console.error("Error name:", err?.name);
      console.error("Error message:", err?.message);
      console.error("Error code:", err?.code);
      console.error("Error stack:", err?.stack);
      return res.status(500).json({
        message: "Failed to save settings: " + (err?.message || "Unknown error"),
        errorCode: err?.code || null,
      });
    }
  });

  return router;
}

