/**
 * Email service abstraction for the Smart Attendance System.
 *
 * Provider: SMTP via nodemailer (works with Gmail, Outlook, SendGrid, etc.)
 * Credentials come ONLY from environment variables — never hardcoded.
 *
 * Required environment variables (see backend/.env.example):
 *   SMTP_HOST       e.g. smtp.gmail.com
 *   SMTP_PORT       e.g. 465
 *   SMTP_SECURE     "true" for 465, "false" for 587
 *   SMTP_USER       sender account (e.g. kataga.notifications@gmail.com)
 *   SMTP_PASS       app password / account password
 *   MAIL_FROM       optional display sender, e.g. "KATAGA <kataga@gmail.com>"
 *   MAIL_ENABLED    optional; set "false" to disable sending entirely
 *
 * CRITICAL CONTRACT: send functions NEVER throw. Email failure must never
 * break attendance recording (Part 11). All failures are logged and the
 * functions resolve with { sent: false, error }.
 */
import nodemailer from "nodemailer";

const ORG_SIGNATURE = "Thank you,\nKATAGA\nKapatiran ng Talino at Galing";

let transporter = null;
let transporterAttempted = false;

function isMailConfigured() {
  if (String(process.env.MAIL_ENABLED || "").toLowerCase() === "false") return false;
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporterAttempted) return transporter;
  transporterAttempted = true;
  if (!isMailConfigured()) {
    console.warn("[email] Email service not configured — emails will be skipped. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable.");
    return null;
  }
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true").toLowerCase() === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch (err) {
    console.error("[email] Failed to create mail transporter:", err?.message);
    transporter = null;
  }
  return transporter;
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
  const mailer = getTransporter();
  if (!mailer) {
    return { sent: false, error: "email-service-not-configured" };
  }
  try {
    const info = await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    console.log(`[email] Sent "${subject}" to ${to} (${info?.messageId || "ok"})`);
    return { sent: true, messageId: info?.messageId || null };
  } catch (err) {
    // Log the actual error but never throw — attendance must not be affected.
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err?.message || err);
    return { sent: false, error: err?.message || String(err) };
  }
}

/** Check-in confirmation email (Part 8). */
export async function sendCheckInConfirmationEmail({ to, participantName, date, timeIn, status }) {
  const name = participantName || "Participant";
  return safeSend({
    to,
    subject: "KATAGA Attendance Confirmation",
    text: [
      `Hello ${name},`,
      "",
      "Thank you for checking in.",
      "",
      "Your attendance has been successfully recorded.",
      "",
      `Date: ${date}`,
      `Time In: ${timeIn}`,
      `Status: ${status}`,
      "",
      ORG_SIGNATURE,
    ].join("\n"),
  });
}

/** Absence notice email (Part 9) — only sent after a session officially ends. */
export async function sendAbsenceNoticeEmail({ to, participantName, activity, date }) {
  const name = participantName || "Participant";
  return safeSend({
    to,
    subject: "KATAGA Attendance Notice",
    text: [
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
    ].join("\n"),
  });
}

export default {
  isValidEmail,
  sendCheckInConfirmationEmail,
  sendAbsenceNoticeEmail,
};
