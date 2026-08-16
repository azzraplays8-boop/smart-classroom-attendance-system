import express from "express";
import {
  authenticate,
  authorizePermission,
  authorizeAnyPermission,
  PERMISSION_KEYS,
} from "../auth/authMiddleware.js";

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

async function resolveCurrentParticipant(pool, user) {
  if (!user || !user.email) return null;

  const [rows] = await pool.query(
    `SELECT id, participant_identifier AS participantIdentifier,
            first_name AS firstName, last_name AS lastName, middle_name AS middleName,
            photo, department, level AS year, group_name AS section, email
     FROM participants
     WHERE LOWER(email) = LOWER(?)
     LIMIT 1`,
    [String(user.email).trim()]
  );

  return rows?.[0] ?? null;
}

async function buildMemberAttendanceSummary(pool, user) {
  const member = await resolveCurrentParticipant(pool, user);
  if (!member) {
    return {
      member: null,
      records: [],
      summary: {
        totalRecords: 0,
        present: 0,
        late: 0,
        absent: 0,
        attendanceRate: 0,
      },
      monthly: {},
    };
  }

  const [rows] = await pool.query(
    `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate,
            a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks,
            p.participant_identifier AS participantIdentifier,
            p.first_name AS firstName, p.last_name AS lastName,
            p.photo, p.department, p.level AS year, p.group_name AS section
     FROM attendance a
     LEFT JOIN participants p ON p.id = a.participant_id
     WHERE a.participant_id = ?
     ORDER BY a.attendance_date DESC, a.time_in DESC, a.created_at DESC`,
    [member.id]
  );

  const records = rows || [];
  const present = records.filter((r) => String(r.status || "").toLowerCase() === "present").length;
  const late = records.filter((r) => String(r.status || "").toLowerCase() === "late").length;
  const absent = records.filter((r) => String(r.status || "").toLowerCase() === "absent").length;
  const total = records.length;
  const byMonth = {};

  for (const record of records) {
    const mk = String(record.attendanceDate || "").slice(0, 7);
    if (!mk) continue;
    if (!byMonth[mk]) byMonth[mk] = { present: 0, late: 0, absent: 0 };
    const s = String(record.status || "").toLowerCase();
    if (s === "present") byMonth[mk].present += 1;
    else if (s === "late") byMonth[mk].late += 1;
    else if (s === "absent") byMonth[mk].absent += 1;
  }

  return {
    member,
    records,
    summary: {
      totalRecords: total,
      present,
      late,
      absent,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
    },
    monthly: byMonth,
  };
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

  // Every attendance route requires a valid, active authenticated user.
  // Read endpoints are open to any authenticated role (including Viewer);
  // mutations additionally require the matching permission key.
  const auth = authenticate(pool);

  router.get("/", auth, async (req, res) => {
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

  router.get("/me", auth, async (req, res) => {
    try {
      const summary = await buildMemberAttendanceSummary(pool, req.user);
      if (!summary.member) {
        return res.json({
          member: null,
          records: [],
          summary: summary.summary,
          monthly: summary.monthly,
          message: "Your account is not yet linked to a participant record. Please contact an administrator.",
        });
      }

      return res.json(summary);
    } catch (err) {
      console.error("GET /attendance/me error:", err);
      return res.status(500).json({ message: "Failed to fetch your attendance." });
    }
  });

  router.get("/history", auth, async (req, res) => {
    try {
      const { page = 1, limit = 50, search = "", date = "", course = "", status = "", from = "", to = "", participantId = "" } = req.query || {};
      const offset = (Number(page) - 1) * Number(limit);
      const searchTerm = String(search || "").trim();
      const dateFilter = String(date || "").trim();
      const courseFilter = String(course || "").trim();
      const statusFilter = String(status || "").trim();
      const fromFilter = String(from || "").trim();
      const toFilter = String(to || "").trim();
      let participantIdFilter = String(participantId || "").trim();

      if (req.user.role === "viewer") {
        const member = await resolveCurrentParticipant(pool, req.user);
        if (!member) {
          return res.json({ records: [], pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 1 } });
        }
        participantIdFilter = String(member.id);
      }

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

      // Date-range filter (inclusive). Ignored when an exact `date` is provided.
      if (!dateFilter && fromFilter) {
        whereClauses.push(`a.attendance_date >= ?`);
        params.push(fromFilter);
      }
      if (!dateFilter && toFilter) {
        whereClauses.push(`a.attendance_date <= ?`);
        params.push(toFilter);
      }

      // Optional per-member filter
      if (participantIdFilter) {
        whereClauses.push(`a.participant_id = ?`);
        params.push(participantIdFilter);
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
        `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate, a.time_in AS timeIn,
                p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName,
                p.photo, p.department, p.level AS year, p.group_name AS section, a.status
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

  router.put("/:id", auth, authorizePermission(PERMISSION_KEYS.MANAGE_ATTENDANCE), async (req, res) => {
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

  router.delete("/:id", auth, authorizePermission(PERMISSION_KEYS.MANAGE_ATTENDANCE), async (req, res) => {
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

  router.get("/dashboard", auth, async (req, res) => {
    try {
      if (req.user.role === "viewer") {
        const summary = await buildMemberAttendanceSummary(pool, req.user);
        const totalRecords = summary.summary.totalRecords;
        const presentToday = summary.records.filter((row) => String(row.attendanceDate || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).filter((row) => String(row.status || "").toLowerCase() === "present").length;
        const lateToday = summary.records.filter((row) => String(row.attendanceDate || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).filter((row) => String(row.status || "").toLowerCase() === "late").length;
        const absentToday = summary.records.filter((row) => String(row.attendanceDate || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).filter((row) => String(row.status || "").toLowerCase() === "absent").length;

        return res.json({
          totalParticipants: summary.member ? 1 : 0,
          presentToday,
          lateToday,
          absentToday,
          totalRecords,
          attendanceRate: summary.summary.attendanceRate,
          member: summary.member,
          records: summary.records,
        });
      }

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

  // ── Monthly Attendance Summary (read-only) ─────────────────────────
  router.get("/monthly-summary", auth, async (req, res) => {
    try {
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!month || !year || month < 1 || month > 12 || year < 1900) {
        return res.status(400).json({ message: "Valid month (1-12) and year are required." });
      }
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;

      const [sessionRows] = await pool.query(
        `SELECT COUNT(DISTINCT attendance_date) AS total
         FROM attendance
         WHERE attendance_date >= ? AND attendance_date <= ?`,
        [startDate, endDate]
      );
      const [statusRows] = await pool.query(
        `SELECT status, COUNT(*) AS cnt
         FROM attendance
         WHERE attendance_date >= ? AND attendance_date <= ?
         GROUP BY status`,
        [startDate, endDate]
      );
      const [memberRows] = await pool.query(
        `SELECT COUNT(DISTINCT participant_id) AS total
         FROM attendance
         WHERE attendance_date >= ? AND attendance_date <= ?`,
        [startDate, endDate]
      );
      const [activeMemberRows] = await pool.query(
        `SELECT p.participant_identifier AS participantIdentifier,
                p.first_name AS firstName, p.last_name AS lastName,
                p.photo, p.department, COUNT(a.id) AS recordCount
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.attendance_date >= ? AND a.attendance_date <= ?
         GROUP BY a.participant_id
         ORDER BY recordCount DESC, p.last_name ASC LIMIT 1`,
        [startDate, endDate]
      );

      const statusMap = {};
      for (const row of statusRows) {
        statusMap[String(row.status).toLowerCase()] = Number(row.cnt) || 0;
      }
      const present = statusMap.present || 0;
      const late = statusMap.late || 0;
      const absent = statusMap.absent || 0;
      const recordedRecords = present + late + absent;
      const attendanceRate = recordedRecords > 0 ? Math.round((present / recordedRecords) * 100) : 0;

      const mostActiveMember = activeMemberRows?.[0]?.recordCount > 0
        ? {
            participantIdentifier: activeMemberRows[0].participantIdentifier,
            firstName: activeMemberRows[0].firstName,
            lastName: activeMemberRows[0].lastName,
            photo: activeMemberRows[0].photo,
            department: activeMemberRows[0].department,
            recordCount: Number(activeMemberRows[0].recordCount),
          }
        : null;

      res.json({
        month, year, startDate, endDate,
        totalSessions: Number(sessionRows?.[0]?.total ?? 0) || 0,
        totalRecords: recordedRecords,
        present, late, absent,
        attendanceRate,
        totalMembersParticipated: Number(memberRows?.[0]?.total ?? 0) || 0,
        mostActiveMember,
      });
    } catch (err) {
      console.error("GET /attendance/monthly-summary error:", err);
      res.status(500).json({ message: "Failed to fetch monthly summary." });
        }
  });

  // ── Per-member attendance detail (read-only) ─────────────────────────
  router.get("/member/:id", auth, async (req, res) => {
    try {
      const participantId = Number(req.params.id);
      if (!participantId || Number.isNaN(participantId)) {
        return res.status(400).json({ message: "Invalid participant id." });
      }

      if (req.user.role === "viewer") {
        const currentParticipant = await resolveCurrentParticipant(pool, req.user);
        if (!currentParticipant || Number(currentParticipant.id) !== participantId) {
          return res.status(403).json({ message: "Access denied. You can only view your own attendance." });
        }
      }

      const [rows] = await pool.query(
        `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate,
                a.time_in AS timeIn, a.status, a.remarks,
                p.participant_identifier AS participantIdentifier,
                p.first_name AS firstName, p.last_name AS lastName,
                p.photo, p.department, p.level AS year, p.group_name AS section
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.participant_id = ?
         ORDER BY a.attendance_date DESC, a.time_in DESC, a.created_at DESC`,
        [participantId]
      );
      const [participantRows] = await pool.query(
        `SELECT id, participant_identifier AS participantIdentifier,
                first_name AS firstName, last_name AS lastName,
                photo, department, level AS year, group_name AS section
         FROM participants
         WHERE id = ? LIMIT 1`,
        [participantId]
      );
      const member = participantRows?.[0] ?? null;
      const records = rows || [];
      const present = records.filter((r) => String(r.status || "").toLowerCase() === "present").length;
      const late = records.filter((r) => String(r.status || "").toLowerCase() === "late").length;
      const absent = records.filter((r) => String(r.status || "").toLowerCase() === "absent").length;
      const total = records.length;
      const byMonth = {};
      for (const record of records) {
        const mk = String(record.attendanceDate || "").slice(0, 7);
        if (!mk) continue;
        if (!byMonth[mk]) byMonth[mk] = { present: 0, late: 0, absent: 0 };
        const s = String(record.status || "").toLowerCase();
        if (s === "present") byMonth[mk].present += 1;
        else if (s === "late") byMonth[mk].late += 1;
        else if (s === "absent") byMonth[mk].absent += 1;
      }
      res.json({
        member, records,
        summary: { totalRecords: total, present, late, absent,
          attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0 },
        monthly: byMonth,
      });
    } catch (err) {
      console.error("GET /attendance/member/:id error:", err);
      res.status(500).json({ message: "Failed to fetch member attendance." });
    }
  });

  // ── Activity/Session attendance grouped by department (read-only) ────
  router.get("/activity-summary", auth, async (req, res) => {
    try {
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const department = String(req.query.department || "").trim();
      const whereClauses = [];
      const params = [];
      if (from) { whereClauses.push(`a.attendance_date >= ?`); params.push(from); }
      if (to) { whereClauses.push(`a.attendance_date <= ?`); params.push(to); }
      if (department) { whereClauses.push(`p.department = ?`); params.push(department); }
      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const [rows] = await pool.query(
        `SELECT p.department AS department,
                COUNT(a.id) AS totalRecords,
                SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         ${whereSql}
         GROUP BY p.department
         ORDER BY totalRecords DESC`,
        params
      );
      res.json({ activities: rows || [] });
    } catch (err) {
      console.error("GET /attendance/activity-summary error:", err);
      res.status(500).json({ message: "Failed to fetch activity summary." });
    }
  });

router.post("/", auth, authorizeAnyPermission(PERMISSION_KEYS.MANAGE_ATTENDANCE, PERMISSION_KEYS.ENCODE_ATTENDANCE), async (req, res) => {
    try {
      const { participantIdentifier, qrUuid, status, remarks } = req.body || {};
      console.log("🔍 [TRACE] 1. Request body:", JSON.stringify(req.body));
      let participant = null;
      let resolvedIdentifier = null;

      // Support both QR UUID scanning and participantIdentifier scanning
      if (qrUuid && String(qrUuid).trim()) {
        // Scan by QR UUID — validate UUID, participant exists, QR is active
        const normalizedUuid = String(qrUuid).trim();
        console.log("🔍 [TRACE] 2. Looking up qrUuid:", normalizedUuid);

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
        console.log("🔍 [TRACE] 3. Participant found by qrUuid:", JSON.stringify(participant));

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
        console.log("🔍 [TRACE] 4. Existing attendance today:", JSON.stringify(existing));
        if (existing) {
          return res.status(409).json({ message: "Attendance has already been recorded today." });
        }
      } else {
        // Fallback to legacy participantIdentifier scanning
        if (!participantIdentifier || !String(participantIdentifier).trim()) {
          return res.status(400).json({ message: "participantIdentifier is required" });
        }

        const normalizedIdentifier = String(participantIdentifier).trim();
        console.log("🔍 [TRACE] 2. Looking up participantIdentifier:", normalizedIdentifier);

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
        console.log("🔍 [TRACE] 3. Participant found by identifier:", JSON.stringify(participant));
        if (!participant) {
          return res.status(404).json({ message: "Participant identifier was not found." });
        }

        resolvedIdentifier = normalizedIdentifier;

        const [existingRows] = await pool.query(
          `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = CURDATE() LIMIT 1`,
          [participant.id]
        );

        const existing = existingRows?.[0] ?? null;
        console.log("🔍 [TRACE] 4. Existing attendance today:", JSON.stringify(existing));
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
        console.log("🔍 [TRACE] 5. Settings loaded:", JSON.stringify(settings));
        computedStatus = computeAttendanceStatus(settings);
      }
      console.log("🔍 [TRACE] 6. Computed status:", computedStatus);

      const insertSql = `INSERT INTO attendance (participant_id, attendance_date, time_in, status, remarks, created_at)
                         VALUES (?, CURDATE(), NOW(), ?, ?, NOW())`;
      const insertParams = [participant.id, computedStatus, remarks || null];
      console.log("🔍 [TRACE] 7. INSERT SQL:", insertSql);
      console.log("🔍 [TRACE] 8. INSERT params:", JSON.stringify(insertParams));

      const [result] = await pool.query(insertSql, insertParams);
      console.log("🔍 [TRACE] 9. INSERT result:", JSON.stringify(result));
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
