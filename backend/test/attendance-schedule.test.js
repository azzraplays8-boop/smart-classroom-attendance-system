import test from "node:test";
import assert from "node:assert/strict";
import { calculateAttendanceStatus, getDateKeyInTimezone } from "../src/config/attendanceSchedule.js";

const settings = {
  attendanceStartTime: "08:00",
  lateCutoffTime: "08:15",
  attendanceEndTime: "17:00",
  gracePeriod: "5 minutes",
  timezone: "(UTC+08:00) Asia/Manila",
};

test("attendance schedule classifies present, late, and outside-window scans", () => {
  assert.equal(calculateAttendanceStatus(settings, new Date("2026-09-06T00:00:00Z")), "Present");
  assert.equal(calculateAttendanceStatus(settings, new Date("2026-09-06T00:21:00Z")), "Late");
  assert.equal(calculateAttendanceStatus(settings, new Date("2026-09-05T23:45:00Z")), "Outside Window");
  assert.equal(calculateAttendanceStatus(settings, new Date("2026-09-06T09:30:00Z")), "Outside Window");
});

test("grace period extends the configured present boundary", () => {
  const noGrace = { ...settings, gracePeriod: "None" };
  const scan = new Date("2026-09-06T00:18:00Z");
  assert.equal(calculateAttendanceStatus(noGrace, scan), "Late");
  assert.equal(calculateAttendanceStatus(settings, scan), "Present");
});

test("configured timezone controls the attendance date and status", () => {
  const instant = new Date("2026-09-05T23:00:00Z");
  assert.equal(getDateKeyInTimezone(instant, "Asia/Manila"), "2026-09-06");
  assert.equal(getDateKeyInTimezone(instant, "America/New_York"), "2026-09-05");
});