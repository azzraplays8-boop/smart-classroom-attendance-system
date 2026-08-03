/**
 * Analytics & Reports — shared date/time helpers
 * Frontend-only utilities. No backend/database changes.
 */

export function parseTimeIn(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // ISO datetime string
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;

  // "HH:mm:ss" or "HH:mm"
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    const date = new Date(2000, 0, 1, hours, minutes, Number(m[3] || 0));
    return date;
  }

  return null;
}

export function getHour(value) {
  const d = parseTimeIn(value);
  return d ? d.getHours() : null;
}

export function formatHourLabel(hour) {
  if (hour === null || hour === undefined || Number.isNaN(Number(hour))) return "-";
  const h = Number(hour) % 24;
  const suffix = h >= 12 ? "PM" : "AM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh} ${suffix}`;
}

export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayString() {
  return toDateString(new Date());
}

export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

export function getDaysBetween(startStr, endStr) {
  const days = [];
  if (!startStr || !endStr || startStr > endStr) return days;
  let cur = startStr;
  let guard = 0;
  while (cur <= endStr && guard < 2000) {
    days.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return days;
}

export function formatDate(value) {
  if (!value) return "-";
  const s = String(value).trim();
  if (!s) return "-";
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

export function formatShortDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatFullDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export function formatTime(value) {
  if (!value) return "-";
  const d = parseTimeIn(value);
  if (!d) return "-";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

export function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

