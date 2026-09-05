/**
 * Email service abstraction for the Smart Attendance System.
 *
 * Provider: Brevo Transactional Email HTTPS API.
 * Credentials come only from environment variables — never hardcoded.
 *
 * Required environment variables (see backend/.env.example):
 *   BREVO_API_KEY   Brevo API key
 *   MAIL_FROM       verified sender, optionally formatted as "KATAGA <email>"
 *   MAIL_ENABLED    optional; set "false" to disable sending entirely
 *
 * CRITICAL CONTRACT: send functions NEVER throw. Email failure must never
 * break attendance recording. All failures are logged and the functions
 * resolve with { sent: false, error }.
 */

const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const ORG_SIGNATURE = "Thank you,\nKATAGA\nKapatiran ng Talino at Galing";

function resolveFromAddress() {
  return process.env.EMAIL_FROM || process.env.MAIL_FROM || "noreply@localhost";
}

function parseSender(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: raw };
}

function isMailConfigured() {
  if (String(process.env.MAIL_ENABLED || "").toLowerCase() === "false") return false;
  return Boolean(process.env.BREVO_API_KEY && isValidEmail(parseSender(resolveFromAddress()).email));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtml(text) {
  return `<div style="font-family:Arial,sans-serif;white-space:pre-line">${escapeHtml(text)}</div>`;
}

function safeErrorMessage(response, body) {
  const detail = body && typeof body === "object"
    ? body.message || body.code || body.error
    : null;
  return `brevo-http-${response.status}${detail ? `: ${String(detail).slice(0, 200)}` : ""}`;
}

/** Basic RFC-ish email validation. */
export function isValidEmail(email) {
  const value = String(email || "").trim();
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Low-level send. Resolves { sent, messageId?, error? } and never rejects.
 */
async function safeSend({ to, subject, text }) {
  if (!isValidEmail(to)) {
    console.warn("[email] Cannot send — no valid recipient email provided.");
    return { sent: false, error: "no-valid-recipient" };
  }
  if (!isMailConfigured()) {
    console.warn("[email] Email service not configured — emails will be skipped. Set BREVO_API_KEY and MAIL_FROM to enable.");
    return { sent: false, error: "email-service-not-configured" };
  }

  const sender = parseSender(resolveFromAddress());
  try {
    const response = await fetch(BREVO_EMAIL_URL, {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: String(to).trim() }],
        subject,
        textContent: text,
        htmlContent: textToHtml(text),
      }),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // Brevo errors do not always include JSON; status is enough to diagnose.
    }
    if (!response.ok) {
      const error = safeErrorMessage(response, body);
      console.error(`[email] Brevo rejected "${subject}" to ${to}: ${error}`);
      return { sent: false, error };
    }

    const messageId = body?.messageId || null;
    console.log(`[email] Sent "${subject}" to ${to} (${messageId || "ok"})`);
    return { sent: true, messageId };
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err?.message || err);
    return { sent: false, error: err?.message || String(err) };
  }
}

/** Check-in confirmation email (Part 8). */
export async function sendCheckInConfirmationEmail({
  to,
  participantName,
  participantId,
  courseStrand,
  yearLevel,
  section,
  date,
  timeIn,
  status,
}) {
  const name = participantName || "Participant";
  const statusLabel = String(status || "Recorded").trim();
  const text = [
    `Hello ${name},`,
    "",
    "Your attendance has been successfully recorded for today's session.",
    "",
    "Attendance Details",
    "",
    `Name: ${participantName || "Participant"}`,
    `Participant ID: ${participantId || "-"}`,
    `Course / Strand: ${courseStrand || "-"}`,
    `Year Level: ${yearLevel || "-"}`,
    `Section: ${section || "-"}`,
    `Attendance Status: ${statusLabel}`,
    `Time Recorded: ${timeIn || "-"}`,
    `Date: ${date || "-"}`,
    "",
    `Your attendance for this session has been recorded successfully. You were marked ${statusLabel.toUpperCase()} based on the attendance time rules.`,
    "",
    "Thank you,",
    "KATAGA Portal",
  ].join("\n");
  return safeSend({ to, subject: `Attendance Recorded - ${date}`, text });
}

/** Absence notice email (Part 9) — only sent after a session officially ends. */
export async function sendAbsenceNoticeEmail({ to, participantName, activity, date }) {
  const name = participantName || "Participant";
  const text = [
    `Hello ${name},`,
    "",
    "Our attendance records show that you were unable to check in for the following activity/session:",
    "",
    `Activity: ${activity || "Attendance Session"}`,
    `Date: ${date}`,
    "",
    "Your attendance has been recorded as Absent.",
    "",
    "If you believe this record requires correction or you have a valid excuse, please contact the organization administrator.",
    "",
    ORG_SIGNATURE,
  ].join("\n");
  return safeSend({ to, subject: "KATAGA Attendance Notice", text });
}

export default {
  isValidEmail,
  sendCheckInConfirmationEmail,
  sendAbsenceNoticeEmail,
};
