import "../env.js";
import { createAppPool, getEnvDb } from "../db.js";
import { sendAbsenceNoticeEmail } from "../services/emailService.js";
import { maybeAutoMarkAbsent } from "../services/attendanceAnalytics.js";
import { extractTimezone, getDateKeyInTimezone } from "../config/attendanceSchedule.js";

async function loadAttendanceSettings(pool) {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM settings"
  );
  return Object.fromEntries((rows || []).map((row) => [
    row.setting_key,
    row.setting_value === "true"
      ? true
      : row.setting_value === "false" ? false : row.setting_value,
  ]));
}

export async function runAutoMarkAbsent({ pool, now = new Date() } = {}) {
  const activePool = pool || createAppPool(getEnvDb());
  const ownsPool = !pool;

  try {
    const settings = await loadAttendanceSettings(activePool);
    const timezone = extractTimezone(settings.timezone);
    const date = getDateKeyInTimezone(now, timezone);
    const result = await maybeAutoMarkAbsent({
      pool: activePool,
      date,
      settings,
      sendEmail: (args) => sendAbsenceNoticeEmail(args),
      now,
    });

    return { date, timezone, ...result };
  } finally {
    if (ownsPool) await activePool.end();
  }
}

if (process.argv[1] && process.argv[1].endsWith("autoMarkAbsent.js")) {
  runAutoMarkAbsent()
    .then((result) => {
      console.log(`[auto-absent] ${JSON.stringify(result)}`);
    })
    .catch((error) => {
      console.error("[auto-absent] job failed:", error);
      process.exitCode = 1;
    });
}