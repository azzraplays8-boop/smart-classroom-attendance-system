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
        `SELECT a.id, a.student_id AS studentId, a.attendance_date AS attendanceDate,
                a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks, a.created_at AS createdAt,
                s.student_number AS studentNumber, s.first_name AS firstName, s.last_name AS lastName,
                s.photo, s.course, s.year, s.section
         FROM attendance a
         LEFT JOIN students s ON s.id = a.student_id
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
          s.student_number LIKE ? OR
          CONCAT(s.first_name, ' ', s.last_name) LIKE ? OR
          CONCAT(s.last_name, ' ', s.first_name) LIKE ?
        )`);
        const likeTerm = `%${searchTerm}%`;
        params.push(likeTerm, likeTerm, likeTerm);
      }

      if (dateFilter) {
        whereClauses.push(`a.attendance_date = ?`);
        params.push(dateFilter);
      }

      if (courseFilter) {
        whereClauses.push(`s.course = ?`);
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
         LEFT JOIN students s ON s.id = a.student_id
         ${whereSql}`,
        params
      );

const [rows] = await pool.query(
        `SELECT a.id, a.attendance_date AS attendanceDate, a.time_in AS timeIn, a.status,
                s.student_number AS studentNumber, s.first_name AS firstName, s.last_name AS lastName,
                s.photo, s.course, s.year, s.section
         FROM attendance a
         LEFT JOIN students s ON s.id = a.student_id
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
                s.student_number AS studentNumber, s.first_name AS firstName, s.last_name AS lastName,
                s.course, s.year, s.section
         FROM attendance a
         LEFT JOIN students s ON s.id = a.student_id
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
      const [{ total }] = await pool.query(`SELECT COUNT(*) AS total FROM students`);

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

      const totalStudents = Number(total ?? 0) || 0;
      const presentToday = Number(presentRows?.[0]?.total ?? 0) || 0;
      const lateToday = Number(lateRows?.[0]?.total ?? 0) || 0;
      const absentToday = Math.max(0, totalStudents - presentToday - lateToday);

      res.json({
        totalStudents,
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
      const { studentNumber, qrUuid, status, remarks } = req.body || {};
      let student = null;
      let resolvedStudentNumber = null;

      // Support both QR UUID scanning and studentNumber scanning
      if (qrUuid && String(qrUuid).trim()) {
        // Scan by QR UUID — validate UUID, student exists, QR is active
        const normalizedUuid = String(qrUuid).trim();

        const [rows] = await pool.query(
          `SELECT
            id,
            qr_uuid AS qrUuid,
            qr_status AS qrStatus,
            student_number AS studentNumber,
            first_name AS firstName,
            last_name AS lastName,
            middle_name AS middleName,
            course,
            year,
            section,
            photo
          FROM students
          WHERE qr_uuid = ? LIMIT 1`,
          [normalizedUuid]
        );

        student = rows?.[0] ?? null;

        if (!student) {
          return res.status(404).json({ message: "Invalid QR code: Student not found." });
        }

        // Validate QR is active and not deleted
        if (!student.qrUuid || student.qrStatus === 'missing') {
          return res.status(400).json({ message: "QR code has been deleted or is inactive." });
        }

        resolvedStudentNumber = student.studentNumber;

        // Prevent duplicate attendance using the student ID
        const [existingRows] = await pool.query(
          `SELECT * FROM attendance WHERE student_id = ? AND attendance_date = CURDATE() LIMIT 1`,
          [student.id]
        );

        const existing = existingRows?.[0] ?? null;
        if (existing) {
          return res.status(409).json({ message: "Attendance has already been recorded today." });
        }
      } else {
        // Fallback to legacy studentNumber scanning
        if (!studentNumber || !String(studentNumber).trim()) {
          return res.status(400).json({ message: "studentNumber is required" });
        }

        const normalizedStudentNumber = String(studentNumber).trim();

        const [studentRows] = await pool.query(
          `SELECT
            id,
            student_number AS studentNumber,
            first_name AS firstName,
            last_name AS lastName,
            middle_name AS middleName,
            course,
            year,
            section,
            photo
          FROM students
          WHERE student_number = ? LIMIT 1`,
          [normalizedStudentNumber]
        );

        student = studentRows?.[0] ?? null;
        if (!student) {
          return res.status(404).json({ message: "Student number was not found." });
        }

        resolvedStudentNumber = normalizedStudentNumber;

        const [existingRows] = await pool.query(
          `SELECT * FROM attendance WHERE student_id = ? AND attendance_date = CURDATE() LIMIT 1`,
          [student.id]
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

      const insertSql = `INSERT INTO attendance (student_id, attendance_date, time_in, status, remarks, created_at)
                         VALUES (?, CURDATE(), NOW(), ?, ?, NOW())`;
      const insertParams = [student.id, computedStatus, remarks || null];

      const [result] = await pool.query(insertSql, insertParams);
      const [newRow] = await pool.query(
        `SELECT a.id, a.student_id AS studentId, a.attendance_date AS attendanceDate,
                a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks, a.created_at AS createdAt,
                s.student_number AS studentNumber, s.first_name AS firstName, s.last_name AS lastName, s.course
         FROM attendance a
         LEFT JOIN students s ON s.id = a.student_id
         WHERE a.id = ? LIMIT 1`,
        [result.insertId]
      );

      return res.status(201).json({
        message: "Attendance recorded",
        attendance: newRow?.[0] ?? null,
        student: student
          ? {
              studentNumber: student.studentNumber ?? null,
              firstName: student.firstName ?? null,
              lastName: student.lastName ?? null,
              middleName: student.middleName ?? null,
              course: student.course ?? null,
              year: student.year ?? null,
              section: student.section ?? null,
              photo: student.photo ?? null,
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
