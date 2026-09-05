import test from "node:test";
import assert from "node:assert/strict";
import {
  sendCheckInConfirmationEmail,
  sendAbsenceNoticeEmail,
} from "../src/services/emailService.js";

const originalFetch = globalThis.fetch;
const originalEnv = {
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  MAIL_FROM: process.env.MAIL_FROM,
  MAIL_ENABLED: process.env.MAIL_ENABLED,
};

function configureMail() {
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.MAIL_FROM = "KATAGA <sender@example.com>";
  process.env.MAIL_ENABLED = "true";
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

test("check-in email sends dynamic Brevo payload with parsed sender", async () => {
  configureMail();
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 201,
      async json() { return { messageId: "brevo-message-id" }; },
    };
  };

  const result = await sendCheckInConfirmationEmail({
    to: "participant@example.com",
    participantName: "Juan Dela Cruz",
    participantId: "2023-001245",
    courseStrand: "BSIT",
    yearLevel: "2",
    section: "A",
    date: "September 5, 2026",
    timeIn: "7:35 AM",
    status: "Late",
  });

  assert.deepEqual(result, { sent: true, messageId: "brevo-message-id" });
  assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["api-key"], "test-api-key");

  const payload = JSON.parse(request.options.body);
  assert.deepEqual(payload.sender, { name: "KATAGA", email: "sender@example.com" });
  assert.deepEqual(payload.to, [{ email: "participant@example.com" }]);
  assert.equal(payload.subject, "Attendance Recorded - September 5, 2026");
  assert.match(payload.textContent, /Juan Dela Cruz/);
  assert.match(payload.textContent, /2023-001245/);
  assert.match(payload.textContent, /BSIT/);
  assert.match(payload.textContent, /Late/);
  assert.match(payload.textContent, /7:35 AM/);
  assert.match(payload.htmlContent, /Attendance Details/);
});

test("Brevo failure returns a safe error without throwing", async () => {
  configureMail();
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    async json() { return { message: "invalid api key" }; },
  });

  const result = await sendAbsenceNoticeEmail({
    to: "participant@example.com",
    participantName: "Juan Dela Cruz",
    activity: "Morning Session",
    date: "September 5, 2026",
  });

  assert.equal(result.sent, false);
  assert.equal(result.error, "brevo-http-401: invalid api key");
});

test("disabled mail skips Brevo without calling fetch", async () => {
  configureMail();
  process.env.MAIL_ENABLED = "false";
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return { ok: true, status: 201, async json() { return {}; } };
  };

  const result = await sendAbsenceNoticeEmail({
    to: "participant@example.com",
    participantName: "Juan Dela Cruz",
    activity: "Morning Session",
    date: "September 5, 2026",
  });

  assert.deepEqual(result, { sent: false, error: "email-service-not-configured" });
  assert.equal(called, false);
});
