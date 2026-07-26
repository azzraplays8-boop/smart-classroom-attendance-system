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
      const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM students");
      const [[{ qrGenerated }]] = await pool.query(
        "SELECT COUNT(*) AS qrGenerated FROM students WHERE qr_status = 'generated'"
      );
      const [[{ missingQr }]] = await pool.query(
        "SELECT COUNT(*) AS missingQr FROM students WHERE qr_status = 'missing'"
      );
      const [[{ printedQr }]] = await pool.query(
        "SELECT COUNT(*) AS printedQr FROM students WHERE printed = 1"
      );

res.json({
        totalStudents: Number(total),
        qrGenerated: Number(qrGenerated),
        missingQr: Number(missingQr),
        printedQr: Number(printedQr),
      });
    } catch (err) {
      console.error("GET /qr/stats error:", err);
      res.status(500).json({ message: "Failed to fetch QR stats" });
    }
  });

  // ── List Students for QR Management ──────────────────────────
  router.get("/", async (req, res) => {
    try {
      const {
        page = 1,
        limit = 25,
        search = "",
        course = "",
        year = "",
        section = "",
        qrStatus = "",
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const whereClauses = [];
      const params = [];

      if (String(search).trim()) {
        whereClauses.push(`(
          s.student_number LIKE ? OR
          CONCAT(s.first_name, ' ', s.last_name) LIKE ? OR
          CONCAT(s.last_name, ' ', s.first_name) LIKE ?
        )`);
        const likeTerm = `%${String(search).trim()}%`;
        params.push(likeTerm, likeTerm, likeTerm);
      }

      if (String(course).trim()) {
        whereClauses.push("s.course = ?");
        params.push(String(course).trim());
      }

      if (String(year).trim()) {
        whereClauses.push("s.year = ?");
        params.push(String(year).trim());
      }

      if (String(section).trim()) {
        whereClauses.push("s.section = ?");
        params.push(String(section).trim());
      }

      if (String(qrStatus).trim()) {
        whereClauses.push("s.qr_status = ?");
        params.push(String(qrStatus).trim());
      }

      const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : "";

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM students s ${whereSql}`,
        params
      );

      const [rows] = await pool.query(
        `SELECT
          s.id,
          s.student_number AS studentNumber,
          s.qr_code AS qrCode,
          s.qr_uuid AS qrUuid,
          s.qr_generated_at AS qrGeneratedAt,
          s.qr_image AS qrImage,
          s.printed,
          s.qr_status AS qrStatus,
          s.last_regenerated AS lastRegenerated,
          s.first_name AS firstName,
          s.last_name AS lastName,
          s.middle_name AS middleName,
          s.photo,
          s.course,
          s.year,
          s.section,
          s.status
        FROM students s
        ${whereSql}
        ORDER BY s.id ASC
        LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset]
      );

      res.json({
        students: rows,
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

  // ── Generate QR for a single student ─────────────────────────
  router.post("/generate/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid student id" });
      }

      const [rows] = await pool.query(
        "SELECT id, student_number, qr_status FROM students WHERE id = ? LIMIT 1",
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      const student = rows[0];

      // Generate secure UUID
      const uuid = crypto.randomUUID();

      // Generate QR payload: JSON with id, studentNumber, uuid
      const qrPayload = JSON.stringify({
        id: student.id,
        studentNumber: student.student_number,
        uuid,
      });

      const now = new Date();

      await pool.query(
        `UPDATE students
         SET qr_uuid = ?, qr_code = ?, qr_generated_at = ?, qr_status = 'generated',
             last_regenerated = ?, printed = 0
         WHERE id = ?`,
        [uuid, qrPayload, now, now, id]
      );

      const [[updated]] = await pool.query(
        `SELECT
          id, student_number AS studentNumber, qr_uuid AS qrUuid,
          qr_code AS qrCode, qr_generated_at AS qrGeneratedAt,
          qr_status AS qrStatus, printed
        FROM students WHERE id = ?`,
        [id]
      );

      res.status(201).json({
        message: "QR code generated successfully",
        student: updated,
      });
    } catch (err) {
      console.error("POST /qr/generate/:id error:", err);
      res.status(500).json({ message: "Failed to generate QR code" });
    }
  });

  // ── Generate QR for multiple students (bulk) ─────────────────
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
        return res.status(400).json({ message: "No valid student ids provided" });
      }

      // Get students that are missing QR
      const placeholders = numericIds.map(() => "?").join(",");
      const [students] = await pool.query(
        `SELECT id, student_number FROM students WHERE id IN (${placeholders})`,
        numericIds
      );

      if (!students || students.length === 0) {
        return res.status(404).json({ message: "No students found" });
      }

      const now = new Date();
      let generatedCount = 0;

      for (const student of students) {
        const uuid = crypto.randomUUID();
        const qrPayload = JSON.stringify({
          id: student.id,
          studentNumber: student.student_number,
          uuid,
        });

        await pool.query(
          `UPDATE students
           SET qr_uuid = ?, qr_code = ?, qr_generated_at = ?, qr_status = 'generated',
               last_regenerated = ?, printed = 0
           WHERE id = ?`,
          [uuid, qrPayload, now, now, student.id]
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

  // ── Regenerate QR for a student ──────────────────────────────
  router.post("/regenerate/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid student id" });
      }

      const [rows] = await pool.query(
        "SELECT id, student_number FROM students WHERE id = ? LIMIT 1",
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      const student = rows[0];
      const uuid = crypto.randomUUID();
      const qrPayload = JSON.stringify({
        id: student.id,
        studentNumber: student.student_number,
        uuid,
      });
      const now = new Date();

      await pool.query(
        `UPDATE students
         SET qr_uuid = ?, qr_code = ?, qr_generated_at = ?,
             qr_status = 'generated', last_regenerated = ?, printed = 0
         WHERE id = ?`,
        [uuid, qrPayload, now, now, id]
      );

      const [[updated]] = await pool.query(
        `SELECT
          id, student_number AS studentNumber, qr_uuid AS qrUuid,
          qr_code AS qrCode, qr_generated_at AS qrGeneratedAt,
          qr_status AS qrStatus, printed, last_regenerated AS lastRegenerated
        FROM students WHERE id = ?`,
        [id]
      );

      res.json({
        message: "QR code regenerated successfully",
        student: updated,
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
        return res.status(400).json({ message: "Invalid student id" });
      }

      const [result] = await pool.query(
        "UPDATE students SET printed = 1, qr_status = 'printed' WHERE id = ?",
        [id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Student not found" });
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
        return res.status(400).json({ message: "No valid student ids provided" });
      }

      const placeholders = numericIds.map(() => "?").join(",");
      const [result] = await pool.query(
        `UPDATE students SET printed = 1, qr_status = 'printed'
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

  // ── Delete QR for a student ──────────────────────────────────
  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid student id" });
      }

      const [result] = await pool.query(
        `UPDATE students
         SET qr_uuid = NULL, qr_code = NULL, qr_generated_at = NULL,
             qr_image = NULL, printed = 0, qr_status = 'missing',
             last_regenerated = NULL
         WHERE id = ?`,
        [id]
      );

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Student not found" });
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
        return res.status(400).json({ message: "No valid student ids provided" });
      }

      const placeholders = numericIds.map(() => "?").join(",");
      const [result] = await pool.query(
        `UPDATE students
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

  // ── Get QR data for a student (for preview) ──────────────────
  router.get("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid student id" });
      }

      const [rows] = await pool.query(
        `SELECT
          s.id,
          s.student_number AS studentNumber,
          s.qr_code AS qrCode,
          s.qr_uuid AS qrUuid,
          s.qr_generated_at AS qrGeneratedAt,
          s.qr_image AS qrImage,
          s.printed,
          s.qr_status AS qrStatus,
          s.last_regenerated AS lastRegenerated,
          s.first_name AS firstName,
          s.last_name AS lastName,
          s.middle_name AS middleName,
          s.photo,
          s.course,
          s.year,
          s.section,
          s.status
        FROM students s
        WHERE s.id = ?
        LIMIT 1`,
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ message: "Student not found" });
      }

      res.json({ student: rows[0] });
    } catch (err) {
      console.error("GET /qr/:id error:", err);
      res.status(500).json({ message: "Failed to fetch QR data" });
    }
  });

  // ── Get distinct courses, years, sections for filters ────────
  router.get("/filters/options", async (req, res) => {
    try {
      const [courses] = await pool.query(
        "SELECT DISTINCT course FROM students WHERE course IS NOT NULL AND course != '' ORDER BY course ASC"
      );
      const [years] = await pool.query(
        "SELECT DISTINCT year FROM students WHERE year IS NOT NULL AND year != '' ORDER BY year ASC"
      );
      const [sections] = await pool.query(
        "SELECT DISTINCT section FROM students WHERE section IS NOT NULL AND section != '' ORDER BY section ASC"
      );

      res.json({
        courses: courses.map((r) => r.course),
        years: years.map((r) => r.year),
        sections: sections.map((r) => r.section),
      });
    } catch (err) {
      console.error("GET /qr/filters/options error:", err);
      res.status(500).json({ message: "Failed to fetch filter options" });
    }
  });

  return router;
}

