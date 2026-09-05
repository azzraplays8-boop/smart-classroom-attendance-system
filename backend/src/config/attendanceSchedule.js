const DEFAULT_TIMEZONE = "Asia/Manila";

export function parseGracePeriod(value) {
  if (!value || String(value).toLowerCase() === "none") return 0;
  const match = String(value).match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function extractTimezone(value) {
  if (!value) return DEFAULT_TIMEZONE;
  const match = String(value).match(/\)\s*(.+)/);
  return match ? match[1].trim() : String(value).trim() || DEFAULT_TIMEZONE;
}

export function getDateKeyInTimezone(value = new Date(), timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: extractTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function getTimeInTimezone(value = new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: extractTimezone(timezone),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { hours: get("hour"), minutes: get("minute"), seconds: get("second") };
}

function minutesFromTime(value, fallback) {
  const match = String(value || fallback).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return minutesFromTime(fallback, "00:00");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function calculateAttendanceStatus(settings = {}, instant = new Date()) {
  const timezone = extractTimezone(settings.timezone);
  const wallClock = getTimeInTimezone(instant, timezone);
  const currentMinutes = wallClock.hours * 60 + wallClock.minutes;
  const startMinutes = minutesFromTime(settings.attendanceStartTime, "07:30");
  const cutoffMinutes = minutesFromTime(settings.lateCutoffTime, "08:00");
  const endMinutes = minutesFromTime(settings.attendanceEndTime, "17:00");
  const graceMinutes = parseGracePeriod(settings.gracePeriod);

  if (currentMinutes < startMinutes) return "Outside Window";
  if (currentMinutes <= cutoffMinutes + graceMinutes) return "Present";
  if (currentMinutes < endMinutes) return "Late";
  return "Outside Window";
}

export function hasAttendanceEnded(settings = {}, instant = new Date()) {
  const timezone = extractTimezone(settings.timezone);
  const wallClock = getTimeInTimezone(instant, timezone);
  const currentMinutes = wallClock.hours * 60 + wallClock.minutes;
  return currentMinutes >= minutesFromTime(settings.attendanceEndTime, "17:00");
}

export function isAttendanceModeAllowed(mode, method) {
  const normalized = String(mode || "QR + Manual").trim();
  if (normalized === "QR + Manual") return true;
  if (normalized === "QR Code Only") return method === "qr";
  if (normalized === "Manual Only") return method === "manual";
  return true;
}