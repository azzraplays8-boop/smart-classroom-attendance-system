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
const BRAND_GREEN = "#1f4d3a";
const BRAND_GOLD = "#c59b4a";

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

function detailRow(label, value) {
  return `<tr><td style="padding:8px 0;color:#66746d;font-size:13px;width:42%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 0;color:#20312a;font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(value || "-")}</td></tr>`;
}

function emailLayout({ title, content, accent = BRAND_GOLD }) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f2;color:#20312a;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8e3;border-radius:12px;overflow:hidden">
<tr><td style="padding:28px 32px;background:${BRAND_GREEN};color:#ffffff;text-align:center"><div style="font-size:25px;line-height:30px;font-weight:700;letter-spacing:1px">KATAGA</div><div style="margin-top:5px;color:#ead9ae;font-size:12px;line-height:18px">Kapatiran ng Talino &amp; Galing</div><div style="margin-top:20px;font-size:18px;line-height:24px;font-weight:600">${escapeHtml(title)}</div></td></tr>
<tr><td style="padding:32px">${content}</td></tr>
<tr><td style="padding:22px 32px;border-top:1px solid #e2e8e3;color:#66746d;font-size:13px;line-height:20px"><div>Thank you,</div><div style="color:${BRAND_GREEN};font-weight:700">KATAGA Portal</div><div>Kapatiran ng Talino at Galing</div></td></tr>
</table></td></tr></table></body></html>`;
}

function statusStyle(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PRESENT") return { background: "#e8f5ed", color: "#17643d", border: "#4da879" };
  if (normalized === "LATE") return { background: "#fff5df", color: "#8a5a08", border: BRAND_GOLD };
  return { background: "#eef1f0", color: "#52605a", border: "#9aa9a1" };
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
async function safeSend({ to, subject, text, html }) {
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
        htmlContent: html || textToHtml(text),
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
      console.error(`[email] Brevo rejected "${subject}": ${error}`);
      return { sent: false, error };
    }

    const messageId = body?.messageId || null;
    console.log(`[email] Sent "${subject}" (${messageId || "ok"})`);
    return { sent: true, messageId };
  } catch (err) {
    console.error(`[email] Failed to send "${subject}":`, err?.message || err);
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
  const statusColors = statusStyle(statusLabel);
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
  const html = emailLayout({
    title: "Attendance Confirmation",
    content: `<p style="margin:0 0 8px;font-size:17px;line-height:26px;color:${BRAND_GREEN};font-weight:700">Hello, ${escapeHtml(name)}!</p>
<p style="margin:0 0 24px;color:#52605a;font-size:15px;line-height:24px">Your attendance has been successfully recorded for today's session.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${statusColors.border};border-radius:10px;background:${statusColors.background};margin-bottom:24px"><tr><td style="padding:18px 20px"><div style="color:#66746d;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px">Attendance Status</div><div style="margin-top:4px;color:${statusColors.color};font-size:23px;line-height:30px;font-weight:700">${escapeHtml(statusLabel.toUpperCase())}</div></td></tr></table>
<div style="margin:0 0 8px;color:${BRAND_GREEN};font-size:15px;line-height:22px;font-weight:700">Attendance Details</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${detailRow("Name", name)}${detailRow("Participant ID", participantId)}${detailRow("Course / Strand or Department / Group", courseStrand)}${detailRow("Year Level / Category", yearLevel)}${detailRow("Section", section)}${detailRow("Time Recorded", timeIn)}${detailRow("Date", date)}</table>
<div style="margin-top:24px;padding:16px 18px;border-left:4px solid ${BRAND_GOLD};background:#fbf8f0;color:#52605a;font-size:14px;line-height:22px">Your attendance for this session has been recorded successfully.</div>`,
  });
  return safeSend({ to, subject: `Attendance Recorded - ${date}`, text, html });
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
  const html = emailLayout({
    title: "Attendance Notice",
    content: `<p style="margin:0 0 8px;font-size:17px;line-height:26px;color:${BRAND_GREEN};font-weight:700">Hello, ${escapeHtml(name)}!</p>
<p style="margin:0 0 22px;color:#52605a;font-size:15px;line-height:24px">Our attendance records show that you were unable to check in for the following activity/session:</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5b3b0;border-radius:10px;background:#fff5f4;margin-bottom:22px"><tr><td style="padding:18px 20px"><div style="color:#8f3d39;font-size:12px;line-height:18px;text-transform:uppercase;letter-spacing:.7px">Attendance Status</div><div style="margin-top:4px;color:#a43e38;font-size:23px;line-height:30px;font-weight:700">ABSENT</div></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${detailRow("Activity / Session", activity || "Attendance Session")}${detailRow("Date", date)}</table>
<p style="margin:24px 0 0;color:#52605a;font-size:14px;line-height:22px">Your attendance has been recorded as Absent. If you believe this record requires correction or you have a valid excuse, please contact the organization administrator.</p>`,
  });
  return safeSend({ to, subject: "KATAGA Attendance Notice", text, html });
}

export default {
  isValidEmail,
  sendCheckInConfirmationEmail,
  sendAbsenceNoticeEmail,
};
