import express from "express";

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

  // GET /settings — return all settings as a flat object
  router.get("/", async (req, res) => {
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
  router.put("/", async (req, res) => {
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

