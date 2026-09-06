import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import attendanceRouter from "../src/routes/attendance.js";

const participants = [
  { id: 1, participant_identifier: "A", first_name: "A", last_name: "One", department: "CS", level: "1", group_name: "A", email: null },
  { id: 2, participant_identifier: "B", first_name: "B", last_name: "Two", department: "CS", level: "1", group_name: "A", email: null },
  { id: 3, participant_identifier: "C", first_name: "C", last_name: "Three", department: "CS", level: "1", group_name: "A", email: null },
  { id: 4, participant_identifier: "D", first_name: "D", last_name: "Four", department: "CS", level: "1", group_name: "A", email: null },
  { id: 5, participant_identifier: "E", first_name: "E", last_name: "Five", department: "CS", level: "1", group_name: "A", email: null },
];
const currentUtcDate = new Date().toISOString().slice(0, 10);

function createPool(settings, attendance = []) {
  const state = { attendance: attendance.map((row) => ({ attendance_date: currentUtcDate, ...row })), inserts: 0 };
  return {
    state,
    async query(sql, params) {
      const text = String(sql);
      if (text.includes("SELECT setting_key, setting_value FROM settings")) {
        return [Object.entries(settings).map(([setting_key, setting_value]) => ({ setting_key, setting_value }))];
      }
      if (text.includes("LOWER(COALESCE(status")) {
        return [state.attendance.filter((row) => row.attendance_date === params[0] && ["present", "late", "excused"].includes(String(row.status).toLowerCase())).map(() => ({ 1: 1 }))];
      }
      if (text.includes("SELECT participant_id FROM attendance WHERE attendance_date = ?")) {
        return [state.attendance.filter((row) => row.attendance_date === params[0])];
      }
      if (text.includes("FROM participants p")) return [participants];
      if (text.includes("SELECT participant_id FROM attendance_email_log")) return [[]];
      if (text.includes("INSERT INTO attendance_email_log")) return [{ insertId: 1 }];
      if (text.includes("INSERT INTO attendance (")) {
        state.inserts += 1;
        state.attendance.push({ participant_id: params[0], attendance_date: params[1], status: "Absent" });
        return [{ insertId: state.inserts }];
      }
      return [[]];
    },
  };
}

function makeServer(pool) {
  const app = express();
  app.use(express.json());
  app.use("/attendance", attendanceRouter({ pool }));
  return app;
}

async function request(pool, authorization) {
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    return await fetch(`http://127.0.0.1:${port}/attendance/auto-absent`, {
      method: "POST",
      headers: authorization ? { Authorization: authorization } : {},
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const afterEndSettings = {
  autoMarkAbsent: "true",
  attendanceEndTime: "00:00",
  timezone: "UTC",
};

 test("auto-absent endpoint authenticates cron and reports settings-driven states", async () => {
  const previousSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const unauthorized = await request(createPool(afterEndSettings));
    assert.equal(unauthorized.status, 401);

    const invalid = await request(createPool(afterEndSettings), "Bearer wrong-secret");
    assert.equal(invalid.status, 401);

    delete process.env.CRON_SECRET;
    const missingConfiguration = await request(createPool(afterEndSettings), "Bearer test-cron-secret");
    assert.equal(missingConfiguration.status, 401);
    process.env.CRON_SECRET = "test-cron-secret";

    const disabled = await request(createPool({ ...afterEndSettings, autoMarkAbsent: "false" }), "Bearer test-cron-secret");
    assert.deepEqual(await disabled.json(), { success: true, status: "disabled", markedAbsent: 0 });

    const beforeEnd = await request(createPool({ ...afterEndSettings, attendanceEndTime: "23:59" }), "Bearer test-cron-secret");
    assert.deepEqual(await beforeEnd.json(), { success: true, status: "before_end", markedAbsent: 0 });

    const notStartedPool = createPool(afterEndSettings, [{ participant_id: 5, status: "Absent" }]);
    const notStarted = await request(notStartedPool, "Bearer test-cron-secret");
    assert.deepEqual(await notStarted.json(), { success: true, status: "not_started", markedAbsent: 0 });
    assert.equal(notStartedPool.state.inserts, 0);

    const pool = createPool(afterEndSettings, [
      { participant_id: 1, status: "Present" },
      { participant_id: 2, status: "Late" },
      { participant_id: 3, status: "Excused" },
      { participant_id: 4, status: "Absent" },
    ]);
    const processed = await request(pool, "Bearer test-cron-secret");
    assert.deepEqual(await processed.json(), { success: true, status: "processed", markedAbsent: 1 });
    assert.equal(pool.state.inserts, 1);
    assert.deepEqual(pool.state.attendance.slice(0, 4).map((row) => row.status), ["Present", "Late", "Excused", "Absent"]);

    const repeated = await request(pool, "Bearer test-cron-secret");
    assert.deepEqual(await repeated.json(), { success: true, status: "processed", markedAbsent: 0 });
    assert.equal(pool.state.inserts, 1);
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  }
});
