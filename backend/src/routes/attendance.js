import express from "express";

// ── Attendance settings helpers ────────────────────────────

/**
 * Parse a grace period string like "5 minutes", "10 minutes", or "None"
 * into a number of minutes. Returns 0 for "None" or unrecognised values.
 */
function parseGracePeriod(gracePeriod) {
  if (!gracePeriod || gracePeriod === "None") return 0;
  const match = String(gracePeriod).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract the IANA timezone name from the stored format.
 * Example: "(UTC+08:00) Asia/Manila" → "Asia/Manila"
 * Falls back to "Asia/Manila" if parsing fails.
 */
function extractTimezone(tzSetting) {
  if (!tzSetting) return "Asia/Manila";
  const match = String(tzSetting).match(/\)\s*(.+)/);
  return match ? match[1].trim() : "Asia/Manila";
}

/**
 * Get the current wall-clock hours, minutes, seconds in the given IANA timezone.
 */
function getCurrentTimeInTimezone(tzName) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tzName,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  let hours = 0, minutes = 0, seconds = 0;
  for (const part of parts) {
    if (part.type === "hour") hours = parseInt(part.value, 10);
    if (part.type === "minute") minutes = parseInt(part.value, 10);
    if (part.type === "second") seconds = parseInt(part.value, 10);
  }
  return { hours, minutes, seconds };
}

/**
 * Determine attendance status dynamically from loaded settings.
 * Accepts an object of attendance-relevant settings (attendanceStartTime,
 * lateCutoffTime, attendanceEndTime, gracePeriod, autoMarkAbsent, timezone).
 *
 * Returns "Present", "Late", or "Absent".
 */
function computeAttendanceStatus(settings) {
  const tzName = extractTimezone(settings.timezone);
  const now = getCurrentTimeInTimezone(tzName);
  const currentMinutes = now.hours * 60 + now.minutes;

  // Parse time values – use the same defaults as Settings.jsx
  const startTime   = settings.attendanceStartTime || "07:30";
  const lateCutoff  = settings.lateCutoffTime     || "08:00";
  const endTime     = settings.attendanceEndTime   || "17:00";
  const graceMins   = parseGracePeriod(settings.gracePeriod);
  const autoMarkAbsent = settings.autoMarkAbsent === "true" || settings.autoMarkAbsent === true;

  const [startH, startM]     = startTime.split(":").map(Number);
  const [cutoffH, cutoffM]   = lateCutoff.split(":").map(Number);
  const [endH, endM]         = endTime.split(":").map(Number);

  const startMinutes   = startH * 60 + startM;
  const cutoffMinutes  = cutoffH * 60 + cutoffM + graceMins;
  const endMinutes     = endH * 60 + endM;

  // ── Decision logic ──────────────────────────────────────
  // 1) Arrived at or before start time                           → Present
  // 2) Arrived between start time and (late-cutoff + grace)      → Present
  // 3) Arrived between (late-cutoff + grace) and end time        → Late
  // 4) Arrived at or after end time → Absent if autoMarkAbsent
  //    is enabled, otherwise Late
  if (currentMinutes <= startMinutes) {
    return "Present";
  }
  if (currentMinutes <= cutoffMinutes) {
    return "Present";
  }
  if (currentMinutes < endMinutes) {
    return "Late";
  }
  // currentMinutes >= endMinutes
  return autoMarkAbsent ? "Absent" : "Late";
}

export default function attendanceRouter({ pool }) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const date = req.query.date || null;
      const dateSql = date ? `= ?` : `= CURDATE()`;
      const params = date ? [date] : [];

      const [rows] = await pool.query(
        `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate,
                a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks, a.created_at AS createdAt,
                p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName,
                p.photo, p.department, p.level AS year, p.group_name AS section
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.attendance_date ${dateSql}
         ORDER BY a.time_in DESC, a.created_at DESC`,
        params
      );

      res.json({ attendance: rows });
    } catch (err) {
      console.error("GET /attendance error:", err);
      res.status(500).json({ message: "Failed to fetch attendance" });
    }
  });

  router.get("/history", async (req, res) => {
    try {
      const { page = 1, limit = 50, search = "", date = "", course = "", status = "" } = req.query || {};
      const offset = (Number(page) - 1) * Number(limit);
      const searchTerm = String(search || "").trim();
      const dateFilter = String(date || "").trim();
      const courseFilter = String(course || "").trim();
      const statusFilter = String(status || "").trim();

      const whereClauses = [];
      const params = [];

      if (searchTerm) {
        whereClauses.push(`(
          p.participant_identifier LIKE ? OR
          CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR
          CONCAT(p.last_name, ' ', p.first_name) LIKE ?
        )`);
        const likeTerm = `%${searchTerm}%`;
        params.push(likeTerm, likeTerm, likeTerm);
      }

      if (dateFilter) {
        whereClauses.push(`a.attendance_date = ?`);
        params.push(dateFilter);
      }

      if (courseFilter) {
        whereClauses.push(`p.department = ?`);
        params.push(courseFilter);
      }

      if (statusFilter) {
        whereClauses.push(`a.status = ?`);
        params.push(statusFilter);
      }

      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         ${whereSql}`,
        params
      );

const [rows] = await pool.query(
        `SELECT a.id, a.attendance_date AS attendanceDate, a.time_in AS timeIn, a.status,
                p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName,
                p.photo, p.department, p.level AS year, p.group_name AS section
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         ${whereSql}
         ORDER BY a.attendance_date DESC, a.time_in DESC, a.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, Number(limit), offset]
      );

      res.json({
        records: rows,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(countRows?.[0]?.total ?? 0),
          pages: Math.max(1, Math.ceil(Number(countRows?.[0]?.total ?? 0) / Number(limit))),
        },
      });
    } catch (err) {
      console.error("GET /attendance/history error:", err);
      res.status(500).json({ message: "Failed to fetch attendance history" });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid attendance id" });
      }

      const attendanceDate = String(req.body?.attendanceDate || req.body?.attendance_date || "").trim();
      const timeIn = req.body?.timeIn ?? req.body?.time_in ?? null;
      const status = String(req.body?.status || "").trim();

      if (!attendanceDate || !status) {
        return res.status(400).json({ message: "attendanceDate and status are required" });
      }

      const [result] = await pool.query(
        `UPDATE attendance
         SET attendance_date = ?, time_in = ?, status = ?
         WHERE id = ?`,
        [attendanceDate, timeIn, status, id]
      );

      if (!result?.affectedRows) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      const [rows] = await pool.query(
        `SELECT a.id, a.attendance_date AS attendanceDate, a.time_in AS timeIn, a.status,
                p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName,
                p.department, p.level AS year, p.group_name AS section
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.id = ? LIMIT 1`,
        [id]
      );

      return res.json({ message: "Attendance record updated", attendance: rows?.[0] ?? null });
    } catch (err) {
      console.error("PUT /attendance/:id error:", err);
      return res.status(500).json({ message: "Failed to update attendance record" });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id || Number.isNaN(id)) {
        return res.status(400).json({ message: "Invalid attendance id" });
      }

      const [result] = await pool.query(`DELETE FROM attendance WHERE id = ?`, [id]);
      if (!result?.affectedRows) {
        return res.status(404).json({ message: "Attendance record not found" });
      }

      return res.json({ message: "Attendance record deleted" });
    } catch (err) {
      console.error("DELETE /attendance/:id error:", err);
      return res.status(500).json({ message: "Failed to delete attendance record" });
    }
  });

  router.get("/dashboard", async (req, res) => {
    try {
      const [{ total }] = await pool.query(`SELECT COUNT(*) AS total FROM participants`);

      const [presentRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM attendance
         WHERE attendance_date = CURDATE() AND status = ?`,
        ['Present']
      );
      const [lateRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM attendance
         WHERE attendance_date = CURDATE() AND status = ?`,
        ['Late']
      );

      const totalParticipants = Number(total ?? 0) || 0;
      const presentToday = Number(presentRows?.[0]?.total ?? 0) || 0;
      const lateToday = Number(lateRows?.[0]?.total ?? 0) || 0;
      const absentToday = Math.max(0, totalParticipants - presentToday - lateToday);

      res.json({
        totalParticipants,
        presentToday,
        lateToday,
        absentToday,
      });
    } catch (err) {
      console.error("GET /attendance/dashboard error:", err);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const { participantIdentifier, qrUuid, status, remarks } = req.body || {};
      let participant = null;
      let resolvedIdentifier = null;

      // Support both QR UUID scanning and participantIdentifier scanning
      if (qrUuid && String(qrUuid).trim()) {
        // Scan by QR UUID — validate UUID, participant exists, QR is active
        const normalizedUuid = String(qrUuid).trim();

        const [rows] = await pool.query(
          `SELECT
            id,
            qr_uuid AS qrUuid,
            qr_status AS qrStatus,
            participant_identifier AS participantIdentifier,
            first_name AS firstName,
            last_name AS lastName,
            middle_name AS middleName,
            department,
            level AS year,
            group_name AS section,
            photo
          FROM participants
          WHERE qr_uuid = ? LIMIT 1`,
          [normalizedUuid]
        );

        participant = rows?.[0] ?? null;

        if (!participant) {
          return res.status(404).json({ message: "Invalid QR code: Participant not found." });
        }

        // Validate QR is active and not deleted
        if (!participant.qrUuid || participant.qrStatus === 'missing') {
          return res.status(400).json({ message: "QR code has been deleted or is inactive." });
        }

        resolvedIdentifier = participant.participantIdentifier;

        // Prevent duplicate attendance using the participant ID
        const [existingRows] = await pool.query(
          `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = CURDATE() LIMIT 1`,
          [participant.id]
        );

        const existing = existingRows?.[0] ?? null;
        if (existing) {
          return res.status(409).json({ message: "Attendance has already been recorded today." });
        }
      } else {
        // Fallback to legacy participantIdentifier scanning
        if (!participantIdentifier || !String(participantIdentifier).trim()) {
          return res.status(400).json({ message: "participantIdentifier is required" });
        }

        const normalizedIdentifier = String(participantIdentifier).trim();

        const [participantRows] = await pool.query(
          `SELECT
            id,
            participant_identifier AS participantIdentifier,
            first_name AS firstName,
            last_name AS lastName,
            middle_name AS middleName,
            department,
            level AS year,
            group_name AS section,
            photo
          FROM participants
          WHERE participant_identifier = ? LIMIT 1`,
          [normalizedIdentifier]
        );

        participant = participantRows?.[0] ?? null;
        if (!participant) {
          return res.status(404).json({ message: "Participant identifier was not found." });
        }

        resolvedIdentifier = normalizedIdentifier;

        const [existingRows] = await pool.query(
          `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = CURDATE() LIMIT 1`,
          [participant.id]
        );

        const existing = existingRows?.[0] ?? null;
        if (existing) {
          return res.status(409).json({ message: "Attendance has already been recorded today." });
        }
      }

      // Load attendance settings from the database for dynamic status computation
      let computedStatus;
      if (status && String(status).trim()) {
        computedStatus = String(status).trim();
      } else {
        const [settingsRows] = await pool.query(
          "SELECT setting_key, setting_value FROM settings"
        );
        const settings = {};
        for (const row of settingsRows) {
          settings[row.setting_key] = row.setting_value === "true" ? true
            : row.setting_value === "false" ? false
            : row.setting_value;
        }
        computedStatus = computeAttendanceStatus(settings);
      }

      const insertSql = `INSERT INTO attendance (participant_id, attendance_date, time_in, status, remarks, created_at)
                         VALUES (?, CURDATE(), NOW(), ?, ?, NOW())`;
      const insertParams = [participant.id, computedStatus, remarks || null];

      const [result] = await pool.query(insertSql, insertParams);
      const [newRow] = await pool.query(
        `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate,
                a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks, a.created_at AS createdAt,
                p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName, p.department
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.id = ? LIMIT 1`,
        [result.insertId]
      );

      return res.status(201).json({
        message: "Attendance recorded",
        attendance: newRow?.[0] ?? null,
        participant: participant
          ? {
              participantIdentifier: participant.participantIdentifier ?? null,
              firstName: participant.firstName ?? null,
              lastName: participant.lastName ?? null,
              middleName: participant.middleName ?? null,
              department: participant.department ?? null,
              year: participant.year ?? null,
              section: participant.section ?? null,
              photo: participant.photo ?? null,
            }
          : null,
      });
    } catch (err) {
      console.error("POST /attendance error:", err);
      return res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  return router;
}
