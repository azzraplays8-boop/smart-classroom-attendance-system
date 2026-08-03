import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function qrRouter({ pool }) {
  const router = express.Router();

  // ── Summary Stats ─────────────────────────────────────────────
  router.get("/stats", async (req, res) => {
    try {
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM participants");
      const [[{ qrGenerated }]] = await pool.query(
        "SELECT COUNT(*) AS qrGenerated FROM participants WHERE qr_status = 'generated'"
      );
      const [[{ missingQr }]] = await pool.query(
        "SELECT COUNT(*) AS missingQr FROM participants WHERE qr_status = 'missing'"
      );
      const [[{ printedQr }]] = await pool.query(
        "SELECT COUNT(*) AS printedQr FROM participants WHERE printed = 1"
      );

      res.json({
        totalParticipants: Number(total),
        qrGenerated: Number(qrGenerated),
        missingQr: Number(missingQr),
        printedQr: Number(printedQr),
      });
    } catch (err) {
      console.error("GET /qr/stats error:", err);
      res.status(500).json({ message: "Failed to fetch QR stats" });
    }
  });

  // ── List Participants for QR Management ──────────────────────────
  router.get("/", async (req, res) => {
    try {
      const {
        page = 1,
        limit = 25,
        search = "",
        department = "",
        level = "",
        group = "",
        qrStatus = "",
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const whereClauses = [];
      const params = [];

      if (String(search).trim()) {
        whereClauses.push(`(
          p.participant_identifier LIKE ? OR
          CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR
          CONCAT(p.last_name, ' ', p.first_name) LIKE ?
        )`);
        const likeTerm = `%${String(search).trim()}%`;
        params.push(likeTerm, likeTerm, likeTerm);
      }

      if (String(department).trim()) {
        whereClauses.push("p.department = ?");
        params.push(String(department).trim());
      }

      if (String(level).trim()) {
        whereClauses.push("p.level = ?");
        params.push(String(level).trim());
      }

      if (String(group).trim()) {
        whereClauses.push("p.group_name = ?");
        params.push(String(group).trim());
      }

      if (String(qrStatus).trim()) {
        whereClauses.push("p.qr_status = ?");
        params.push(String(qrStatus).trim());
      }

      const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : "";

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM participants p ${whereSql}`,
        params
      );

      const [rows] = await pool.query(
        `SELECT
          p.id,
          p.participant_identifier AS participantIdentifier,
          p.qr_code AS qrCode,
          p.qr_uuid AS qrUuid,
          p.qr_generated_at AS qrGeneratedAt,
          p.qr_image AS qrImage,
          p.printed,
          p.qr_status AS qrStatus,
          p.last_regenerated AS lastRegenerated,
          p.first_name AS firstName,
          p.last_name AS lastName,
          p.middle_name AS middleName,
          p.photo,
          p.department,
          p.level AS year,
          p.group_name AS section,
          p.status
        FROM participants p
        ${whereSql}
        ORDER BY p.id ASC
        LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset]
      );

      res.json({
        participants: rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(total),
          pages: Math.max(1, Math.ceil(Number(total) / Number(limit))),
        },
      });
    } catch (err) {
      console.error("GET /qr error:", err);
      res.status(500).json({ message: "Failed to fetch QR list" });
    }
  });

  // ── Generate QR for a single participant ─────────────────────────
  router.post("/generate/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid participant id" });
      }

      const [rows] = await pool.query(
        "SELECT id, participant_identifier, qr_status FROM participants WHERE id = ? LIMIT 1",
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      const participant = rows[0];

      // Generate secure UUID
      const uuid = crypto.randomUUID();

      // Generate QR payload: JSON with id, participantIdentifier, uuid
      const qrPayload = JSON.stringify({
        id: participant.id,
        participantIdentifier: participant.participant_identifier,
        uuid,
      });

      const now = new Date();

      await pool.query(
        `UPDATE participants
         SET qr_uuid = ?, qr_code = ?, qr_generated_at = ?, qr_status = 'generated',
             last_regenerated = ?, printed = 0
         WHERE id = ?`,
        [uuid, qrPayload, now, now, id]
      );

      const [[updated]] = await pool.query(
        `SELECT
          id, participant_identifier AS participantIdentifier, qr_uuid AS qrUuid,
          qr_code AS qrCode, qr_generated_at AS qrGeneratedAt,
          qr_status AS qrStatus, printed
        FROM participants WHERE id = ?`,
        [id]
      );

      res.status(201).json({
        message: "QR code generated successfully",
        participant: updated,
      });
    } catch (err) {
      console.error("POST /qr/generate/:id error:", err);
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

  // ── Generate QR for multiple participants (bulk) ─────────────────
  router.post("/generate-bulk", async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }

      const numericIds = ids
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id) && id > 0);

      if (numericIds.length === 0) {
        return res.status(400).json({ message: "No valid participant ids provided" });
      }

      // Get participants that are missing QR
      const placeholders = numericIds.map(() => "?").join(",");
      const [participants] = await pool.query(
        `SELECT id, participant_identifier FROM participants WHERE id IN (${placeholders})`,
        numericIds
      );

      if (!participants || participants.length === 0) {
        return res.status(404).json({ message: "No participants found" });
      }

      const now = new Date();
      let generatedCount = 0;

      for (const participant of participants) {
        const uuid = crypto.randomUUID();
        const qrPayload = JSON.stringify({
          id: participant.id,
          participantIdentifier: participant.participant_identifier,
          uuid,
        });

        await pool.query(
          `UPDATE participants
           SET qr_uuid = ?, qr_code = ?, qr_generated_at = ?, qr_status = 'generated',
               last_regenerated = ?, printed = 0
           WHERE id = ?`,
          [uuid, qrPayload, now, now, participant.id]
        );
        generatedCount++;
      }

      res.status(201).json({
        message: `${generatedCount} QR codes generated successfully`,
        generatedCount,
      });
    } catch (err) {
      console.error("POST /qr/generate-bulk error:", err);
      res.status(500).json({ message: "Failed to generate QR codes" });
    }
  });

  // ── Regenerate QR for a participant ──────────────────────────────
  router.post("/regenerate/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid participant id" });
      }

      const [rows] = await pool.query(
        "SELECT id, participant_identifier FROM participants WHERE id = ? LIMIT 1",
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      const participant = rows[0];
      const uuid = crypto.randomUUID();
      const qrPayload = JSON.stringify({
        id: participant.id,
        participantIdentifier: participant.participant_identifier,
        uuid,
      });
      const now = new Date();

      await pool.query(
        `UPDATE participants
         SET qr_uuid = ?, qr_code = ?, qr_generated_at = ?,
             qr_status = 'generated', last_regenerated = ?, printed = 0
         WHERE id = ?`,
        [uuid, qrPayload, now, now, id]
      );

      const [[updated]] = await pool.query(
        `SELECT
          id, participant_identifier AS participantIdentifier, qr_uuid AS qrUuid,
          qr_code AS qrCode, qr_generated_at AS qrGeneratedAt,
          qr_status AS qrStatus, printed, last_regenerated AS lastRegenerated
        FROM participants WHERE id = ?`,
        [id]
      );

      res.json({
        message: "QR code regenerated successfully",
        participant: updated,
      });
    } catch (err) {
      console.error("POST /qr/regenerate/:id error:", err);
      res.status(500).json({ message: "Failed to regenerate QR code" });
    }
  });

  // ── Mark QR as printed ───────────────────────────────────────
  router.put("/:id/print", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid participant id" });
      }

      const [result] = await pool.query(
        "UPDATE participants SET printed = 1, qr_status = 'printed' WHERE id = ?",
        [id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Participant not found" });
      }

      res.json({ message: "QR marked as printed" });
    } catch (err) {
      console.error("PUT /qr/:id/print error:", err);
      res.status(500).json({ message: "Failed to mark QR as printed" });
    }
  });

  // ── Bulk mark as printed ─────────────────────────────────────
  router.put("/print-bulk", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }

      const numericIds = ids
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id) && id > 0);

      if (numericIds.length === 0) {
        return res.status(400).json({ message: "No valid participant ids provided" });
      }

      const placeholders = numericIds.map(() => "?").join(",");
      const [result] = await pool.query(
        `UPDATE participants SET printed = 1, qr_status = 'printed'
         WHERE id IN (${placeholders})`,
        numericIds
      );

      res.json({
        message: `${result.affectedRows} QR codes marked as printed`,
        updatedCount: result.affectedRows,
      });
    } catch (err) {
      console.error("PUT /qr/print-bulk error:", err);
      res.status(500).json({ message: "Failed to mark QR codes as printed" });
    }
  });

  // ── Delete QR for a participant ──────────────────────────────────
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid participant id" });
      }

      const [result] = await pool.query(
        `UPDATE participants
         SET qr_uuid = NULL, qr_code = NULL, qr_generated_at = NULL,
             qr_image = NULL, printed = 0, qr_status = 'missing',
             last_regenerated = NULL
         WHERE id = ?`,
        [id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Participant not found" });
      }

      res.json({ message: "QR code deleted successfully" });
    } catch (err) {
      console.error("DELETE /qr/:id error:", err);
      res.status(500).json({ message: "Failed to delete QR code" });
    }
  });

  // ── Bulk delete QR codes ─────────────────────────────────────
  router.delete("/bulk/delete", async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "ids array is required" });
      }

      const numericIds = ids
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id) && id > 0);

      if (numericIds.length === 0) {
        return res.status(400).json({ message: "No valid participant ids provided" });
      }

      const placeholders = numericIds.map(() => "?").join(",");
      const [result] = await pool.query(
        `UPDATE participants
         SET qr_uuid = NULL, qr_code = NULL, qr_generated_at = NULL,
             qr_image = NULL, printed = 0, qr_status = 'missing',
             last_regenerated = NULL
         WHERE id IN (${placeholders})`,
        numericIds
      );

      res.json({
        message: `${result.affectedRows} QR codes deleted`,
        deletedCount: result.affectedRows,
      });
    } catch (err) {
      console.error("DELETE /qr/bulk/delete error:", err);
      res.status(500).json({ message: "Failed to delete QR codes" });
    }
  });

  // ── Get QR data for a participant (for preview) ──────────────────
  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid participant id" });
      }

      const [rows] = await pool.query(
        `SELECT
          p.id,
          p.participant_identifier AS participantIdentifier,
          p.qr_code AS qrCode,
          p.qr_uuid AS qrUuid,
          p.qr_generated_at AS qrGeneratedAt,
          p.qr_image AS qrImage,
          p.printed,
          p.qr_status AS qrStatus,
          p.last_regenerated AS lastRegenerated,
          p.first_name AS firstName,
          p.last_name AS lastName,
          p.middle_name AS middleName,
          p.photo,
          p.department,
          p.level AS year,
          p.group_name AS section,
          p.status
        FROM participants p
        WHERE p.id = ?
        LIMIT 1`,
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Participant not found" });
      }

      res.json({ participant: rows[0] });
    } catch (err) {
      console.error("GET /qr/:id error:", err);
      res.status(500).json({ message: "Failed to fetch QR data" });
    }
  });

  // ── Get distinct departments, levels, sections for filters ────────
  router.get("/filters/options", async (req, res) => {
    try {
      const [departments] = await pool.query(
        "SELECT DISTINCT department FROM participants WHERE department IS NOT NULL AND department != '' ORDER BY department ASC"
      );
      const [levels] = await pool.query(
        "SELECT DISTINCT level FROM participants WHERE level IS NOT NULL AND level != '' ORDER BY level ASC"
      );
      const [sections] = await pool.query(
        "SELECT DISTINCT group_name FROM participants WHERE group_name IS NOT NULL AND group_name != '' ORDER BY group_name ASC"
      );

      res.json({
        departments: departments.map((r) => r.department),
        levels: levels.map((r) => r.level),
        sections: sections.map((r) => r.group_name),
      });
    } catch (err) {
      console.error("GET /qr/filters/options error:", err);
      res.status(500).json({ message: "Failed to fetch filter options" });
    }
  });

  return router;
}
