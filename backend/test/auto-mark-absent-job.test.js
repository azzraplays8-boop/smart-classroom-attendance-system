import test from "node:test";
import assert from "node:assert/strict";
import { runAutoMarkAbsent } from "../src/jobs/autoMarkAbsent.js";

function createPool(settings, participants, existing = []) {
  const state = { existing: [...existing], inserts: 0 };
  return {
    state,
    async query(sql, params) {
      const text = String(sql);
      if (text.includes("SELECT setting_key, setting_value FROM settings")) {
        return [Object.entries(settings).map(([setting_key, setting_value]) => ({ setting_key, setting_value }))];
      }
      if (text.includes("FROM participants p")) return [participants];
      if (text.includes("SELECT participant_id FROM attendance WHERE attendance_date = ?")) {
        return [state.existing];
      }
      if (text.includes("SELECT participant_id FROM attendance_email_log")) return [[]];
      if (text.includes("INSERT INTO attendance_email_log")) return [{ insertId: 1 }];
      if (text.includes("INSERT INTO attendance (")) {
        state.inserts += 1;
        state.existing.push({ participant_id: params[0] });
        return [{ insertId: state.inserts }];
      }
      return [[]];
    },
  };
}

const baseSettings = {
  attendanceEndTime: "10:00",
  timezone: "(UTC+08:00) Asia/Manila",
  autoMarkAbsent: "true",
};
const afterEnd = new Date("2026-09-06T02:00:00Z"); // 10:00 AM Manila
const beforeEnd = new Date("2026-09-06T01:59:00Z");
const participants = [
  { id: 1, participant_identifier: "A", first_name: "A", last_name: "One", department: "CS", level: "1", group_name: "A", email: null },
  { id: 2, participant_identifier: "B", first_name: "B", last_name: "Two", department: "CS", level: "1", group_name: "A", email: null },
  { id: 3, participant_identifier: "C", first_name: "C", last_name: "Three", department: "CS", level: "1", group_name: "A", email: null },
];

test("auto-absence job skips when disabled or before Attendance End", async () => {
  const disabled = createPool({ ...baseSettings, autoMarkAbsent: "false" }, participants);
  assert.equal((await runAutoMarkAbsent({ pool: disabled, now: afterEnd })).marked, 0);
  assert.equal(disabled.state.inserts, 0);

  const early = createPool(baseSettings, participants);
  assert.equal((await runAutoMarkAbsent({ pool: early, now: beforeEnd })).marked, 0);
  assert.equal(early.state.inserts, 0);
});

test("auto-absence job marks only missing participants and is idempotent", async () => {
  const pool = createPool(baseSettings, participants, [
    { participant_id: 1 }, // Present/Late/Excused rows all count as attended.
    { participant_id: 3 }, // Existing Absent row is also preserved.
  ]);

  const first = await runAutoMarkAbsent({ pool, now: afterEnd });
  const second = await runAutoMarkAbsent({ pool, now: afterEnd });

  assert.equal(first.date, "2026-09-06");
  assert.equal(first.marked, 1);
  assert.equal(second.marked, 0);
  assert.equal(pool.state.inserts, 1);
});