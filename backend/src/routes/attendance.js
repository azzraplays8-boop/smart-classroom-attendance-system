import express from "express";
import crypto from "crypto";
import { runAutoMarkAbsent } from "../jobs/autoMarkAbsent.js";
import {
  authenticate,
  authorizePermission,
  authorizeAnyPermission,
  PERMISSION_KEYS,
  isMaintenanceModeEnabled,
} from "../auth/authMiddleware.js";
import {
  ATTENDANCE_POLICY,
  buildStandingBreakdown,
  getLateAbsenceEquivalent,
  computeEffectiveAbsences,
  getAttendanceStanding,
} from "../config/attendancePolicy.js";
import {
  getCurrentMonthWindow,
  buildMonthWindow,
  summarizeParticipantMonthly,
  summarizeMonthlyTotals,
  closeSessionAndNotifyAbsences,
  getAttendanceParticipantPopulation,
  countAttendanceParticipants,
  ATTENDANCE_PARTICIPANT_FILTER_SQL,
} from "../services/attendanceAnalytics.js";
import {
  sendCheckInConfirmationEmail,
  sendAbsenceNoticeEmail,
  isValidEmail,
} from "../services/emailService.js";
import {
  calculateAttendanceStatus,
  extractTimezone,
  getDateKeyInTimezone,
  isAttendanceModeAllowed,
} from "../config/attendanceSchedule.js";

const VALID_IMPORT_STATUS_VALUES = new Map([
  ["present", "Present"],
  ["late", "Late"],
  ["absent", "Absent"],
  ["excused", "Excused"],
]);

function normalizeAttendanceStatus(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  return VALID_IMPORT_STATUS_VALUES.get(normalized) || "";
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeImportKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseExcelSerialDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const input = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(input)) {
    try {
      const serial = Number(input);
      if (Number.isFinite(serial)) {
        const parsed = new Date(Math.round((serial - 25569) * 86400 * 1000));
        if (!Number.isNaN(parsed.getTime())) {
          const y = parsed.getUTCFullYear();
          const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
          const d = String(parsed.getUTCDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
      }
    } catch {
      // ignore and fall through below
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const match = input.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  }
  return null;
}

function parseImportTime(value, dateValue) {
  if (value === null || value === undefined || value === "") return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalSeconds = Math.round((value % 1) * 86400);
    const m = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    const hours = Math.floor(m / 60) % 24;
    const minutes = m % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  const timeMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] || 0);
    const seconds = Number(timeMatch[3] || 0);
    const meridiem = String(timeMatch[4] || "").toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    const isoDate = dateValue || "2000-01-01";
    return `${isoDate} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]} ${String(Number(isoMatch[4])).padStart(2, "0")}:${String(Number(isoMatch[5])).padStart(2, "0")}:${String(Number(isoMatch[6] || 0)).padStart(2, "0")}`;
  }

  return null;
}

function getImportField(row, aliases) {
  const candidates = aliases;
  for (const key of candidates) {
    if (row && Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    const normalized = normalizeImportKey(key);
    const matchKey = Object.keys(row || {}).find((candidate) => normalizeImportKey(candidate) === normalized);
    if (matchKey) return row[matchKey];
  }
  return "";
}

function buildImportValidationSummary(rows) {
  const summary = { total: rows.length, ready: 0, warnings: 0, errors: 0 };
  for (const row of rows) {
    const state = String(row.validationState || "Ready").toLowerCase();
    if (state === "error") summary.errors += 1;
    else if (state === "warning") summary.warnings += 1;
    else summary.ready += 1;
  }
  return summary;
}

function canImportAttendanceRecords(user) {
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "administrator") return true;
  return Boolean(user.permissions && user.permissions.includes(PERMISSION_KEYS.MANAGE_ATTENDANCE));
}

// ── Attendance settings helpers ────────────────────────────

/**
 * Parse a grace period string like "5 minutes", "10 minutes", or "None"
 * into a number of minutes. Returns 0 for "None" or unrecognised values.
 */
/**
 * Normalize a value that may be a JS Date (mysql2) or a date string into
 * "YYYY-MM-DD". String(Date) gives e.g. "Fri Aug 01 2026 ..." which breaks
 * month-key slicing, so Date objects must be converted properly.
 */
function toDateKey(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function resolveCurrentParticipant(pool, user) {
  if (!user) return null;

  const userId = Number(user.id);
  const email = String(user.email || "").trim();
  const normalizedEmail = email.toLowerCase();

  const [rows] = await pool.query(
    `SELECT id, participant_identifier AS participantIdentifier,
            first_name AS firstName, last_name AS lastName, middle_name AS middleName,
            photo, department, level AS year, group_name AS section, email, user_id AS userId
     FROM participants
     WHERE (? IS NOT NULL AND user_id = ?) OR LOWER(email) = LOWER(?) OR LOWER(TRIM(COALESCE(email, ''))) = LOWER(TRIM(?))
     ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
    [userId || null, userId || null, normalizedEmail || "", email || "", userId || null]
  );

  return rows?.[0] ?? null;
}

/** Load org timezone from settings (single consistent timezone strategy). */
async function getOrgTimezone(pool) {
  try {
    const [rows] = await pool.query(
      "SELECT setting_value FROM settings WHERE setting_key = 'timezone' LIMIT 1"
    );
    return extractTimezone(rows?.[0]?.setting_value);
  } catch {
    return "Asia/Manila";
  }
}

async function loadAttendanceSettings(pool) {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM settings"
  );
  const settings = {};
  for (const row of rows || []) {
    settings[row.setting_key] = row.setting_value === "true"
      ? true
      : row.setting_value === "false" ? false : row.setting_value;
  }
  return settings;
}

function formatAttendanceDate(value, timezone) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value || Date.now());
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "long", day: "numeric",
  }).format(date);
}

function formatAttendanceTime(value, timezone) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return String(value || "-");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(date);
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
        excused: 0,
        attendanceRate: 0,
      },
      monthly: {},
      monthlySummary: null,
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
    const mk = toDateKey(record.attendanceDate).slice(0, 7);
    if (!mk) continue;
    if (!byMonth[mk]) byMonth[mk] = { present: 0, late: 0, absent: 0, excused: 0 };
    const s = String(record.status || "").toLowerCase();
    if (s === "present") byMonth[mk].present += 1;
    else if (s === "late") byMonth[mk].late += 1;
    else if (s === "absent") byMonth[mk].absent += 1;
    else if (s === "excused") byMonth[mk].excused += 1;
  }

  // ── Current-month summary (date-based filtering, nothing is deleted) ──
  const tz = await getOrgTimezone(pool);
  const { year, month, startDate, endDate, label } = {
    ...getCurrentMonthWindow(tz),
  };
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const monthCounts = byMonth[monthKey] || { present: 0, late: 0, absent: 0, excused: 0 };
  const monthlyBreakdown = buildStandingBreakdown(monthCounts);
  const counted = monthCounts.present + monthCounts.late + monthCounts.absent;

  return {
    member,
    records,
    summary: {
      totalRecords: total,
      present,
      late,
      absent,
      excused: records.filter((r) => String(r.status || "").toLowerCase() === "excused").length,
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
    },
    monthly: byMonth,
    // Current-month tracking block consumed by My Attendance page
    monthlySummary: {
      year,
      month,
      label,
      startDate,
      endDate,
      ...monthlyBreakdown,
      attendanceRate: counted > 0 ? Math.round((monthCounts.present / counted) * 100) : 0,
    },
  };
}

/**
 * Determine attendance status dynamically from loaded settings.
 * Accepts an object of attendance-relevant settings (attendanceStartTime,
 * lateCutoffTime, attendanceEndTime, gracePeriod, autoMarkAbsent, timezone).
 *
 * Returns "Present", "Late", or "Absent".
 */
export default function attendanceRouter({ pool }) {
  const router = express.Router();

  router.post("/auto-absent", async (req, res) => {
    const configuredSecret = process.env.CRON_SECRET;
    const authorization = String(req.headers.authorization || "");
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
    const suppliedSecret = match?.[1] || "";
    const suppliedBytes = Buffer.from(suppliedSecret);
    const configuredBytes = Buffer.from(configuredSecret || "");
    const secretsMatch = Boolean(configuredSecret && suppliedSecret &&
      suppliedBytes.length === configuredBytes.length &&
      crypto.timingSafeEqual(suppliedBytes, configuredBytes));

    if (!secretsMatch) {
      console.warn("[cron auth] rejected auto-absent request", {
        configured: Boolean(configuredSecret),
        headerPresent: Boolean(authorization),
        bearerFormat: Boolean(match),
        suppliedLength: suppliedSecret.length,
        configuredLength: configuredBytes.length,
      });
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const result = await runAutoMarkAbsent({ pool, waitForNotifications: false });
      return res.json({
        success: true,
        status: result.status || (result.skipped ? "skipped" : "processed"),
        markedAbsent: result.marked || 0,
      });
    } catch (err) {
      console.error("POST /attendance/auto-absent error:", err?.message || err);
      return res.status(500).json({ message: "Failed to process automatic absences." });
    }
  });

  // Every attendance route requires a valid, active authenticated user.
  // Read endpoints are open to any authenticated role (including Viewer);
  // mutations additionally require the matching permission key.
  const auth = authenticate(pool);

  router.use(auth, async (req, res, next) => {
    try {
      if (req.user?.role !== "viewer") return next();
      const maintenanceEnabled = await isMaintenanceModeEnabled(pool);
      if (maintenanceEnabled) {
        return res.status(403).json({
          message: "System is under maintenance. Please check back later.",
          maintenanceMode: true,
        });
      }
      return next();
    } catch (err) {
      console.error("[attendance maintenance guard]", err);
      return next();
    }
  });

  router.get("/", auth, async (req, res) => {
    try {
      const settings = await loadAttendanceSettings(pool);
      const timezone = extractTimezone(settings.timezone);
      const date = String(req.query.date || getDateKeyInTimezone(new Date(), timezone));

      const [rows] = await pool.query(
        `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate,
                a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks, a.created_at AS createdAt,
                p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName,
                p.photo, p.department, p.level AS year, p.group_name AS section
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.attendance_date = ?
         ORDER BY a.time_in DESC, a.created_at DESC`,
        [date]
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
      const { page = 1, limit = 50, search = "", date = "", course = "", status = "", from = "", to = "", participantId = "", period = "", month = "", year = "" } = req.query || {};
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

      // Month/year period filter (date-based filtering — never deletes history).
      if (!dateFilter && !fromFilter && !toFilter && String(period).toLowerCase() === "month") {
        const m = Number(month);
        const y = Number(year);
        if (m >= 1 && m <= 12 && y >= 1900) {
          const win = buildMonthWindow(y, m);
          whereClauses.push("a.attendance_date >= ?");
          whereClauses.push("a.attendance_date <= ?");
          params.push(win.startDate, win.endDate);
        }
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

  router.get("/import-history", auth, async (req, res) => {
    try {
      if (!canImportAttendanceRecords(req.user)) {
        return res.status(403).json({ message: "Access denied. Only administrators may view import history." });
      }

      const [rows] = await pool.query(
        `SELECT id, filename, imported_by AS importedBy, imported_at AS importedAt,
                total_rows AS totalRows, imported_rows AS importedRows,
                duplicate_rows AS duplicateRows, failed_rows AS failedRows,
                status, created_at AS createdAt
         FROM attendance_import_logs
         ORDER BY created_at DESC
         LIMIT 20`
      );
      return res.json({ imports: rows || [] });
    } catch (err) {
      console.error("GET /attendance/import-history error:", err);
      return res.status(500).json({ message: "Failed to fetch import history." });
    }
  });

  router.get("/import-template", auth, async (req, res) => {
    try {
      if (!canImportAttendanceRecords(req.user)) {
        return res.status(403).json({ message: "Access denied. Only Admin and Super Admin users can download the attendance import template." });
      }

      const orgScope = req.user?.role === "super_admin" ? null : Number(req.user?.organization_id || 0);
      const [rows] = await pool.query(
        `SELECT p.participant_identifier AS participantIdentifier,
                p.last_name AS lastName,
                p.first_name AS firstName,
                p.middle_name AS middleName,
                p.department,
                p.level AS year,
                p.group_name AS section,
                p.status
         FROM participants p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE (p.status IS NULL OR TRIM(COALESCE(p.status, '')) = '' OR LOWER(p.status) = 'active')
           AND TRIM(COALESCE(p.participant_identifier, '')) <> ''
           ${orgScope ? "AND u.organization_id = ?" : ""}
         ORDER BY p.participant_identifier ASC, p.id ASC`,
        orgScope ? [orgScope] : []
      );

      const templateParticipants = Array.isArray(rows) ? rows : [];
      if (!templateParticipants.length) {
        return res.status(404).json({ message: "No participants were found for your organization. Add participants before downloading the attendance template." });
      }

      const XLSX = await import("xlsx");
      const headers = [
        "Participant ID",
        "Last Name",
        "First Name",
        "Middle Name",
        "Course / Department",
        "Year Level / Category",
        "Section / Team",
        "Date",
        "Status",
      ];

      const sheetRows = [
        headers,
        ...templateParticipants.map((participant) => [
          String(participant.participantIdentifier ?? ""),
          String(participant.lastName ?? ""),
          String(participant.firstName ?? ""),
          String(participant.middleName ?? ""),
          String(participant.department ?? ""),
          String(participant.year ?? ""),
          String(participant.section ?? ""),
          "-",
          "",
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(sheetRows);
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      ws["!cols"] = [
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 22 },
        { wch: 20 },
        { wch: 18 },
        { wch: 14 },
        { wch: 14 },
      ];
      headers.forEach((header, index) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: index })];
        if (cell) {
          cell.s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "E9ECEF" } },
            border: {
              top: { style: "thin", color: { rgb: "BDBDBD" } },
              right: { style: "thin", color: { rgb: "BDBDBD" } },
              bottom: { style: "thin", color: { rgb: "BDBDBD" } },
              left: { style: "thin", color: { rgb: "BDBDBD" } },
            },
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      });

      ws["!dataValidation"] = [{
        type: "list",
        allowBlank: true,
        sqref: `I2:I${templateParticipants.length + 1}`,
        formula1: '"Present,Late,Absent,Excused"',
        promptTitle: "Attendance Status",
        prompt: "Choose the attendance status for this participant.",
      }];

      XLSX.utils.book_append_sheet(wb, ws, "Attendance Import");
      const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="attendance-import-template.xlsx"`);
      return res.send(buffer);
    } catch (err) {
      console.error("GET /attendance/import-template error:", err);
      return res.status(500).json({ message: "Unable to load participants. Please try again." });
    }
  });

  router.post("/import", auth, async (req, res) => {
    try {
      if (!canImportAttendanceRecords(req.user)) {
        return res.status(403).json({ message: "Access denied. Only Admin and Super Admin users can import attendance records." });
      }

      const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const filename = String(req.body?.filename || "attendance-import.xlsx").trim() || "attendance-import.xlsx";
      const session = req.body?.session || {};
      const fallbackSessionDate = parseExcelSerialDate(getImportField(session, ["date", "Date", "attendanceDate"])) || parseExcelSerialDate(getImportField(session, ["sessionDate", "Session Date"]));
      const fallbackSessionActivity = normalizeText(getImportField(session, ["activity", "Activity", "Activity / Session", "sessionActivity"]));

      if (!rawRows.length) {
        return res.status(400).json({ message: "No attendance rows were provided for import." });
      }

      const connection = pool.getConnection ? await pool.getConnection() : pool;
      if (connection.beginTransaction) {
        await connection.beginTransaction();
      }

      try {
        const validationErrors = [];
        const validRows = [];
        const skippedDuplicates = [];
        let importedCount = 0;

        for (let index = 0; index < rawRows.length; index += 1) {
          const row = rawRows[index] || {};
          const participantIdRaw = getImportField(row, ["Participant ID", "participantId", "ParticipantId", "participant_identifier", "Participant Identifier"]);
          const dateRaw = getImportField(row, ["Date", "attendanceDate", "date"]);
          const timeInRaw = getImportField(row, ["Time In", "timeIn", "TimeIn"]);
          const statusRaw = getImportField(row, ["Status", "status"]);
          const activityRaw = getImportField(row, ["Activity / Session", "activity", "Session", "Activity"]);
          const remarksRaw = getImportField(row, ["Remarks", "remarks", "Remark"]);

          const participantId = normalizeText(participantIdRaw);
          const status = normalizeAttendanceStatus(statusRaw);
          const attendanceDate = parseExcelSerialDate(dateRaw) || fallbackSessionDate || parseExcelSerialDate(getImportField(row, ["Attendance Date", "attendance_date"]));
          const timeInCandidate = parseImportTime(timeInRaw, attendanceDate);
          const normalizedActivity = normalizeText(activityRaw) || fallbackSessionActivity || null;

          if (!status) {
            continue;
          }

          if (!participantId) {
            validationErrors.push({ row: index + 2, participantId: participantId || "", reason: "Missing required field: Participant ID" });
            continue;
          }
          if (!attendanceDate) {
            validationErrors.push({ row: index + 2, participantId, reason: "Invalid date" });
            continue;
          }
          if (!status) {
            validationErrors.push({ row: index + 2, participantId, reason: "Invalid status" });
            continue;
          }

          const [participantRows] = await connection.query(
            `SELECT id, participant_identifier AS participantIdentifier, first_name AS firstName, last_name AS lastName,
                    department, level AS year, group_name AS section
             FROM participants
             WHERE participant_identifier = ? LIMIT 1`,
            [participantId]
          );

          if (!participantRows?.length) {
            validationErrors.push({ row: index + 2, participantId, reason: "Participant not found" });
            continue;
          }

          const participant = participantRows[0];
          const [existingRows] = await connection.query(
            `SELECT a.id
             FROM attendance a
             WHERE a.participant_id = ? AND a.attendance_date = ?
             LIMIT 1`,
            [participant.id, attendanceDate]
          );

          if (existingRows?.length) {
            skippedDuplicates.push({ row: index + 2, participantId, reason: "Duplicate — already recorded" });
            continue;
          }

          if ((status === "Present" || status === "Late") && !timeInCandidate) {
            validationErrors.push({ row: index + 2, participantId, reason: "Missing required field: Time In" });
            continue;
          }

          validRows.push({
            participant_id: participant.id,
            attendance_date: attendanceDate,
            time_in: timeInCandidate,
            status,
            activity: normalizedActivity,
            remarks: normalizeText(remarksRaw) || null,
            source: "import",
          });
        }

        if (validRows.length) {
          for (const row of validRows) {
            await connection.query(
              `INSERT INTO attendance (participant_id, attendance_date, time_in, status, activity, remarks, source, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
              [row.participant_id, row.attendance_date, row.time_in, row.status, row.activity, row.remarks, row.source]
            );
          }
          importedCount = validRows.length;
        }

        await connection.query(
          `INSERT INTO attendance_import_logs (filename, imported_by, total_rows, imported_rows, duplicate_rows, failed_rows, status, imported_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', NOW(), NOW())`,
          [filename, req.user?.full_name || req.user?.email || "System", rawRows.length, importedCount, skippedDuplicates.length, validationErrors.length]
        );

        if (connection.commit) {
          await connection.commit();
        }

        return res.status(201).json({
          message: "Attendance import completed.",
          summary: {
            totalSubmitted: rawRows.length,
            imported: importedCount,
            skippedDuplicates: skippedDuplicates.length,
            failed: validationErrors.length,
            validationErrors,
          },
        });
      } catch (error) {
        if (connection.rollback) {
          await connection.rollback();
        }
        throw error;
      } finally {
        if (connection.release) {
          connection.release();
        }
      }
    } catch (err) {
      console.error("POST /attendance/import error:", err);
      return res.status(500).json({ message: "Failed to import attendance records." });
    }
  });

  router.post("/bulk-delete", auth, authorizePermission(PERMISSION_KEYS.MANAGE_ATTENDANCE), async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const numericIds = ids
        .map((id) => Number(id))
        .filter((id) => !Number.isNaN(id) && id > 0);

      if (!numericIds.length) {
        return res.status(400).json({ message: "A non-empty ids array is required." });
      }

      const orgScope = req.user?.role === "super_admin" ? null : Number(req.user?.organization_id || 0);
      const placeholders = numericIds.map(() => "?").join(",");

      const [allowedRows] = await pool.query(
        `SELECT a.id
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE a.id IN (${placeholders})
           ${orgScope ? "AND u.organization_id = ?" : ""}`,
        orgScope ? [...numericIds, orgScope] : numericIds
      );

      const allowedIds = (allowedRows || []).map((row) => Number(row.id)).filter(Boolean);
      if (!allowedIds.length) {
        return res.status(404).json({ message: "No authorized attendance records were found to delete." });
      }

      const deletePlaceholders = allowedIds.map(() => "?").join(",");
      const [result] = await pool.query(
        `DELETE FROM attendance WHERE id IN (${deletePlaceholders})`,
        allowedIds
      );

      if (!result?.affectedRows) {
        return res.status(404).json({ message: "No attendance records were found to delete." });
      }

      return res.json({
        message: `${result.affectedRows} attendance records deleted successfully.`,
        deleted: result.affectedRows,
        ids: allowedIds,
      });
    } catch (err) {
      console.error("POST /attendance/bulk-delete error:", err);
      return res.status(500).json({ message: "Failed to delete selected attendance records." });
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
      const remarks = req.body?.remarks ?? req.body?.excuseReason ?? null;

      if (!attendanceDate || !status) {
        return res.status(400).json({ message: "attendanceDate and status are required" });
      }
      if (!ATTENDANCE_POLICY.STATUSES.includes(status)) {
        return res.status(400).json({
          message: `Invalid status. Allowed: ${ATTENDANCE_POLICY.STATUSES.join(", ")}`,
        });
      }

      const [result] = await pool.query(
        `UPDATE attendance
         SET attendance_date = ?, time_in = ?, status = ?, remarks = COALESCE(?, remarks)
         WHERE id = ?`,
        [attendanceDate, timeIn, status, status === "Excused" ? remarks : null, id]
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
        const today = toDateKey(new Date());
        const presentToday = summary.records.filter((row) => toDateKey(row.attendanceDate) === today && String(row.status || "").toLowerCase() === "present").length;
        const lateToday = summary.records.filter((row) => toDateKey(row.attendanceDate) === today && String(row.status || "").toLowerCase() === "late").length;
        const absentToday = summary.records.filter((row) => toDateKey(row.attendanceDate) === today && String(row.status || "").toLowerCase() === "absent").length;

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

      const totalParticipants = await countAttendanceParticipants(pool);

      const [presentRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM attendance a
         INNER JOIN participants p ON p.id = a.participant_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE a.attendance_date = CURDATE() AND LOWER(a.status) = 'present' AND ${ATTENDANCE_PARTICIPANT_FILTER_SQL}`
      );
      const [lateRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM attendance a
         INNER JOIN participants p ON p.id = a.participant_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE a.attendance_date = CURDATE() AND LOWER(a.status) = 'late' AND ${ATTENDANCE_PARTICIPANT_FILTER_SQL}`
      );
      const [absentRows] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM attendance a
         INNER JOIN participants p ON p.id = a.participant_id
         LEFT JOIN users u ON u.id = p.user_id
         WHERE a.attendance_date = CURDATE() AND LOWER(a.status) = 'absent' AND ${ATTENDANCE_PARTICIPANT_FILTER_SQL}`
      );

      const presentToday = Number(presentRows?.[0]?.total ?? 0) || 0;
      const lateToday = Number(lateRows?.[0]?.total ?? 0) || 0;
      const absentToday = Number(absentRows?.[0]?.total ?? 0) || 0;

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
        const mk = toDateKey(record.attendanceDate).slice(0, 7);
        if (!mk) continue;
        if (!byMonth[mk]) byMonth[mk] = { present: 0, late: 0, absent: 0, excused: 0 };
        const s = String(record.status || "").toLowerCase();
        if (s === "present") byMonth[mk].present += 1;
        else if (s === "late") byMonth[mk].late += 1;
        else if (s === "absent") byMonth[mk].absent += 1;
        else if (s === "excused") byMonth[mk].excused += 1;
      }
      // Current-month standing for this participant
      const tz = await getOrgTimezone(pool);
      const window = getCurrentMonthWindow(tz);
      const monthKey = `${window.year}-${String(window.month).padStart(2, "0")}`;
      const monthCounts = byMonth[monthKey] || { present: 0, late: 0, absent: 0, excused: 0 };
      const monthlySummary = {
        ...window,
        ...buildStandingBreakdown(monthCounts),
      };
      res.json({
        member, records,
        summary: { totalRecords: total, present, late, absent,
          excused: records.filter((r) => String(r.status || "").toLowerCase() === "excused").length,
          attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0 },
        monthly: byMonth,
        monthlySummary,
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
      const { participantIdentifier, qrUuid, status, remarks, method } = req.body || {};
      const settings = await loadAttendanceSettings(pool);
      const attendanceTimezone = extractTimezone(settings.timezone);
      const attendanceDate = getDateKeyInTimezone(new Date(), attendanceTimezone);
      const attendanceMethod = method || (qrUuid ? "qr" : "manual");
      if (!isAttendanceModeAllowed(settings.attendanceMode, attendanceMethod)) {
        return res.status(403).json({ message: `Attendance mode does not allow ${attendanceMethod} check-in.` });
      }
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
          `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = ? LIMIT 1`,
          [participant.id, attendanceDate]
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
          `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = ? LIMIT 1`,
          [participant.id, attendanceDate]
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
        console.log("🔍 [TRACE] 5. Settings loaded:", JSON.stringify(settings));
        computedStatus = calculateAttendanceStatus(settings);
        if (computedStatus === "Outside Window") {
          return res.status(400).json({ message: "Attendance can only be recorded during the configured attendance window." });
        }
      }
      console.log("🔍 [TRACE] 6. Computed status:", computedStatus);

      const insertSql = `INSERT INTO attendance (participant_id, attendance_date, time_in, status, remarks, created_at)
             VALUES (?, ?, NOW(), ?, ?, NOW())`;
      const insertParams = [participant.id, attendanceDate, computedStatus, remarks || null];
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

      // Attendance is persisted before notification work starts. Do not await
      // any email-related database, timezone, or SMTP operation here.
      const emailNotification = { queued: true };
      void Promise.resolve().then(async () => {
        try {
          const [emailRows] = await pool.query(
            `SELECT email, participant_identifier AS participantIdentifier,
                    first_name AS firstName, last_name AS lastName, middle_name AS middleName,
                    department, level AS year, group_name AS section
             FROM participants WHERE id = ? LIMIT 1`,
            [participant.id]
          );
          const emailParticipant = emailRows?.[0] || participant;
          const recipientEmail = emailParticipant.email || null;
          if (!isValidEmail(recipientEmail)) {
            console.warn(`[email] Check-in confirmation skipped for participant ${participant.id}: no valid email on file.`);
            return;
          }

          const attendanceDate = newRow?.[0]?.attendanceDate || new Date();
          const attendanceTime = newRow?.[0]?.timeIn || new Date();
          const dateStr = formatAttendanceDate(attendanceDate, attendanceTimezone);
          const timeStr = formatAttendanceTime(attendanceTime, attendanceTimezone);
          await sendCheckInConfirmationEmail({
            to: recipientEmail,
            participantName: [emailParticipant.firstName, emailParticipant.middleName, emailParticipant.lastName].filter(Boolean).join(" "),
            participantId: emailParticipant.participantIdentifier || participant.participantIdentifier,
            courseStrand: emailParticipant.department || participant.department,
            yearLevel: emailParticipant.year || participant.year,
            section: emailParticipant.section || participant.section,
            date: dateStr,
            timeIn: timeStr,
            status: computedStatus,
          });
        } catch (emailErr) {
          console.error("[email] Unexpected error sending check-in confirmation:", emailErr?.message);
        }
      });

      const attendanceRecorded = Boolean(newRow?.[0] || result?.insertId);
      const attendance = newRow?.[0]
        ? {
            ...newRow[0],
            attendanceDateLabel: formatAttendanceDate(newRow[0].attendanceDate, attendanceTimezone),
            timeInLabel: formatAttendanceTime(newRow[0].timeIn, attendanceTimezone),
          }
        : null;

      return res.status(201).json({
        message: "Attendance recorded",
        attendanceRecorded,
        attendance,
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
        emailNotification,
      });
    } catch (err) {
      console.error("POST /attendance error:", err);
      return res.status(500).json({ message: "Failed to record attendance" });
    }
  });

  // ── Session close: mark absences + send absence notices (Part 9) ─────
  // Only an admin/super-admin can officially close a session. Absence
  // emails are sent ONLY here — never while a session is still open — and
  // attendance_email_log guarantees one notice per participant per session.
  router.post("/close-session", auth, authorizePermission(PERMISSION_KEYS.MANAGE_ATTENDANCE), async (req, res) => {
    try {
      const tz = await getOrgTimezone(pool);
      const date = String(req.body?.date || "").trim();
      if (!date) {
        return res.status(400).json({ message: "A date is required to close the attendance session." });
      }
      const activity = String(req.body?.activity || "").trim() || null;

      const results = await closeSessionAndNotifyAbsences({
        pool,
        date,
        activity,
        timezone: tz,
        sendEmail: (args) => sendAbsenceNoticeEmail(args),
      });

      res.json({
        message: "Session closed. Absences recorded and notifications processed.",
        date,
        activity,
        ...results,
      });
    } catch (err) {
      console.error("POST /attendance/close-session error:", err);
      res.status(500).json({ message: "Failed to close attendance session." });
    }
  });

  // ── Monthly standings / warnings (Part 4 / Part 12) ───────────────────
  router.get("/monthly-standings", auth, async (req, res) => {
    try {
      const tz = await getOrgTimezone(pool);
      const m = Number(req.query.month);
      const y = Number(req.query.year);
      const window = (m >= 1 && m <= 12 && y >= 1900)
        ? buildMonthWindow(y, m)
        : getCurrentMonthWindow(tz);

      const [rows] = await pool.query(
        `SELECT a.participant_id, a.status,
                p.participant_identifier, p.first_name, p.last_name,
                p.department, p.level, p.group_name
         FROM attendance a
         LEFT JOIN participants p ON p.id = a.participant_id
         WHERE a.attendance_date >= ? AND a.attendance_date <= ?`,
        [window.startDate, window.endDate]
      );

      const participants = summarizeParticipantMonthly(rows || []);
      const totals = summarizeMonthlyTotals(participants);

      res.json({
        ...window,
        totals,
        participants,
      });
    } catch (err) {
      console.error("GET /attendance/monthly-standings error:", err);
      res.status(500).json({ message: "Failed to fetch monthly standings." });
    }
  });

  return router;
}
