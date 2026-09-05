/**
 * Monthly attendance analytics helpers (read-only, filter-based).
 *
 * Monthly "reset" is a DATE-BASED FILTERING system: the current month is
 * derived from the server's configured timezone at call time and used to
 * filter attendance_date ranges. NO records are ever deleted or modified.
 */
import { buildStandingBreakdown } from "../config/attendancePolicy.js";
import { extractTimezone, hasAttendanceEnded } from "../config/attendanceSchedule.js";

export const ATTENDANCE_PARTICIPANT_FILTER_SQL = `
  (p.status IS NULL OR TRIM(COALESCE(p.status, '')) = '' OR LOWER(p.status) = 'active')
  AND TRIM(COALESCE(p.participant_identifier, '')) <> ''
  AND TRIM(COALESCE(p.first_name, '')) <> ''
  AND TRIM(COALESCE(p.last_name, '')) <> ''
  AND (
    TRIM(COALESCE(p.department, '')) <> ''
    OR TRIM(COALESCE(p.level, '')) <> ''
    OR TRIM(COALESCE(p.group_name, '')) <> ''
  )
`;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getNowInTimezone(tzName) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tzName || "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA gives YYYY-MM-DD
  return formatter.format(new Date());
}

/** Get the current month/year and its date range in the app timezone. */
export function getCurrentMonthWindow(tzName) {
  const today = getNowInTimezone(tzName); // "YYYY-MM-DD"
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return buildMonthWindow(year, month);
}

export function buildMonthWindow(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { year, month, startDate, endDate };
}

/** Parse query params into a date filter: month/year | from/to | all. */
export function resolvePeriodFilter(query) {
  const period = String(query.period || "").trim(); // 'month' | 'range' | 'all'
  const month = Number(query.month);
  const year = Number(query.year);
  const from = String(query.from || "").trim();
  const to = String(query.to || "").trim();

  if (period === "all") return { mode: "all" };
  if (period === "range" && from && to) return { mode: "range", from, to };
  if (month >= 1 && month <= 12 && year >= 1900) {
    const window = buildMonthWindow(year, month);
    return {
      mode: "month",
      ...window,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
    };
  }
  return null; // caller decides the default (current month)
}

/** Aggregate per-participant monthly stats + standings from raw rows. */
export function summarizeParticipantMonthly(rows) {
  const byParticipant = new Map();
  for (const row of rows || []) {
    const key = row.participantId ?? row.participant_id;
    if (!byParticipant.has(key)) {
      byParticipant.set(key, {
        participantId: key,
        participantIdentifier: row.participantIdentifier || row.participant_identifier,
        firstName: row.firstName || row.first_name,
        lastName: row.lastName || row.last_name,
        department: row.department,
        year: row.year || row.level,
        section: row.section || row.group_name,
        present: 0,
        late: 0,
        absent: 0,
        excused: 0,
        totalRecords: 0,
      });
    }
    const agg = byParticipant.get(key);
    agg.totalRecords += 1;
    const s = String(row.status || "").toLowerCase();
    if (s === "present") agg.present += 1;
    else if (s === "late") agg.late += 1;
    else if (s === "absent") agg.absent += 1;
    else if (s === "excused") agg.excused += 1;
  }

  const participants = [];
  for (const agg of byParticipant.values()) {
    const breakdown = buildStandingBreakdown(agg);
    const counted = breakdown.present + breakdown.late + breakdown.absent;
    participants.push({
      ...agg,
      ...breakdown,
      attendanceRate: counted > 0 ? Math.round((breakdown.present / counted) * 100) : 0,
    });
  }
  participants.sort((a, b) =>
    String(a.lastName || "").localeCompare(String(b.lastName || ""))
  );
  return participants;
}

/** Roll up monthly totals + warning distribution from participant summaries. */
export function summarizeMonthlyTotals(participants) {
  const totals = { totalRecords: 0, present: 0, late: 0, absent: 0, excused: 0 };
  const standingCounts = {
    good: 0, firstWarning: 0, finalWarning: 0, adminReview: 0,
  };
  for (const p of participants) {
    totals.totalRecords += p.totalRecords;
    totals.present += p.present;
    totals.late += p.late;
    totals.absent += p.absent;
    totals.excused += p.excused;
    if (p.standingTone === "good") standingCounts.good += 1;
    else if (p.standingTone === "warning") standingCounts.firstWarning += 1;
    else if (p.standingTone === "final-warning") standingCounts.finalWarning += 1;
    else standingCounts.adminReview += 1;
  }
  const counted = totals.present + totals.late + totals.absent;
  return {
    ...totals,
    attendanceRate: counted > 0 ? Math.round((totals.present / counted) * 100) : 0,
    standingCounts,
  };
}

/**
 * Process absences after a session officially closes.
 * Finds active participants with NO attendance record for the date, inserts
 * Absent rows (status rules preserved), and sends ONE absence email per
 * participant per session (duplicate prevention via attendance_email_log).
 * Email failures never affect the inserted records.
 */
export async function getAttendanceParticipantPopulation(pool) {
  const [rows] = await pool.query(
    `SELECT p.id, p.participant_identifier AS participantIdentifier,
            p.first_name AS firstName, p.last_name AS lastName,
            p.email, p.status, p.department, p.level, p.group_name AS section,
            p.user_id AS userId
     FROM participants p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE ${ATTENDANCE_PARTICIPANT_FILTER_SQL}
     ORDER BY p.id ASC`
  );
  return rows || [];
}

export async function countAttendanceParticipants(pool) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM participants p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE ${ATTENDANCE_PARTICIPANT_FILTER_SQL}`
  );
  return Number(rows?.[0]?.total ?? 0) || 0;
}

export async function closeSessionAndNotifyAbsences({ pool, date, activity, timezone, sendEmail }) {
  const targetDate = String(date || "").trim();
  if (!targetDate) {
    throw new Error("A session date is required before finalizing automatic absences.");
  }

  const [participants] = await pool.query(
    `SELECT p.id, p.participant_identifier, p.first_name, p.last_name, p.email,
            p.department, p.level, p.group_name, u.role AS userRole
     FROM participants p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE ${ATTENDANCE_PARTICIPANT_FILTER_SQL}`
  );

  const [existing] = await pool.query(
    `SELECT participant_id FROM attendance WHERE attendance_date = ?`,
    [date]
  );
  const presentIds = new Set((existing || []).map((r) => r.participant_id));

  const [alreadyNotified] = await pool.query(
    `SELECT participant_id FROM attendance_email_log
     WHERE attendance_date = ? AND email_type = 'absence'`,
    [date]
  );
  const notifiedIds = new Set((alreadyNotified || []).map((r) => r.participant_id));

  const results = { marked: 0, emailsSent: 0, emailsSkipped: 0, emailsFailed: 0 };

  for (const p of participants || []) {
    if (presentIds.has(p.id)) continue; // has a record (Present/Late/Absent/Excused)

    await pool.query(
      `INSERT INTO attendance (participant_id, attendance_date, time_in, status, source, auto_generated, activity)
       VALUES (?, ?, NULL, 'Absent', 'auto_absent', 1, ?)
       ON DUPLICATE KEY UPDATE
         status = COALESCE(status, VALUES(status)),
         source = COALESCE(source, VALUES(source)),
         auto_generated = COALESCE(auto_generated, VALUES(auto_generated)),
         activity = COALESCE(activity, VALUES(activity))`,
      [p.id, date, activity || null]
    );
    results.marked += 1;

    if (notifiedIds.has(p.id)) continue; // duplicate absence email prevention

    let emailStatus = "skipped";
    let errorMessage = null;
    if (sendEmail && p.email) {
      const outcome = await sendEmail({
        to: p.email,
        participantName: [p.first_name, p.last_name].filter(Boolean).join(" "),
        activity,
        date,
      });
      if (outcome.sent) {
        emailStatus = "sent";
        results.emailsSent += 1;
      } else {
        emailStatus = outcome.error === "no-valid-recipient" ? "skipped" : "failed";
        errorMessage = outcome.error || null;
        if (emailStatus === "failed") results.emailsFailed += 1;
        else results.emailsSkipped += 1;
      }
    } else {
      results.emailsSkipped += 1;
      if (!p.email) errorMessage = "no-valid-recipient";
    }

    // Log regardless of outcome — prevents duplicate sends on re-close.
    await pool.query(
      `INSERT INTO attendance_email_log
         (participant_id, attendance_date, email_type, recipient_email, status, error_message)
       VALUES (?, ?, 'absence', ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), error_message = VALUES(error_message)`,
      [p.id, date, p.email || null, emailStatus, errorMessage]
    );
  }

  return results;
}

export async function maybeAutoMarkAbsent({ pool, date, settings, sendEmail, now = new Date() }) {
  const enabled = settings?.autoMarkAbsent === true || settings?.autoMarkAbsent === "true";
  if (!enabled || !hasAttendanceEnded(settings, now)) return { skipped: true, marked: 0 };

  return closeSessionAndNotifyAbsences({
    pool,
    date,
    activity: null,
    timezone: extractTimezone(settings.timezone),
    sendEmail,
  });
}
