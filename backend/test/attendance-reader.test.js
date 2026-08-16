/**
 * Reader/Viewer RBAC tests for new read-only attendance endpoints.
 *
 * Verifies that viewer (and other authenticated roles) can access:
 *   GET /attendance/monthly-summary
 *   GET /attendance/member/:id
 *   GET /attendance/activity-summary
 *
 * And that mutations remain 403 for viewer.
 */
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import attendanceRouter from "../src/routes/attendance.js";
import { makeToken, wrapPoolForAuth } from "./rbacTestHelpers.js";

function readerStub() {
  return {
    async query(sql, _params) {
      const s = String(sql);
      if (s.includes("FROM user_permissions")) return [[]];
      if (s.includes("WHERE u.id = ?")) return [[{ id: 1, role: "viewer", is_active: 1, account_status: "approved" }]];
      if (s.includes("COUNT(DISTINCT attendance_date)")) return [[{ total: 5 }]];
      if (s.includes("SELECT status, COUNT(*) AS cnt")) return [[{ status: "Present", cnt: 10 }, { status: "Late", cnt: 3 }]];
      if (s.includes("COUNT(DISTINCT participant_id)")) return [[{ total: 8 }]];
      if (s.includes("COUNT(a.id) AS recordCount")) return [[{ participantIdentifier: "M001", firstName: "Juan", lastName: "Cruz", recordCount: 10 }]];
      if (s.includes("WHERE a.participant_id = ?")) return [[]];
      if (s.includes("FROM participants\n         WHERE id = ? LIMIT 1")) return [[{ id: 5, participantIdentifier: "M001", firstName: "Juan", lastName: "Cruz" }]];
      if (s.includes("GROUP BY p.department")) return [[]];
      if (s.includes("SELECT COUNT(*) AS total FROM participants")) return [[{ total: 10 }]];
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

test("GET /attendance/monthly-summary as viewer returns 200", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/monthly-summary?month=8&year=2026`, {
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.totalSessions, 5);
    assert.equal(body.present, 10);
    assert.equal(body.late, 3);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("GET /attendance/monthly-summary returns 400 for invalid month", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/monthly-summary?month=13&year=2026`, {
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("GET /attendance/member/:id as viewer returns 200", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/member/5`, {
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.member.firstName, "Juan");
    assert.equal(typeof body.records, "object");
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("GET /attendance/activity-summary as viewer returns 200", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/activity-summary?from=2026-08-01&to=2026-08-31`, {
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.activities), true);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("GET /attendance/me as viewer returns only their participant attendance", async () => {
  const pool = {
    async query(sql, params) {
      const s = String(sql);
      if (s.includes("FROM user_permissions")) return [[]];
      if (s.includes("WHERE u.id = ?")) return [[{ id: 1, role: "viewer", is_active: 1, account_status: "approved", email: "viewer@test.local", username: "viewer" }]];
      if (s.includes("FROM participants WHERE email = ? LIMIT 1") || s.includes("FROM participants\n         WHERE email = ? LIMIT 1")) {
        return [[{ id: 7, participant_identifier: "V-001", first_name: "Viewer", last_name: "User", participantIdentifier: "V-001", firstName: "Viewer", lastName: "User", department: "BSIT", level: "3", group_name: "A", year: "3", section: "A" }]];
      }
      if (s.includes("WHERE a.participant_id = ?") && Array.isArray(params) && params[0] === 7) {
        return [[{ id: 101, participant_id: 7, attendance_date: "2026-08-16", time_in: "08:15:00", status: "Present", remarks: "On time" }]];
      }
      return [[]];
    },
  };

  const server = createServer(makeServer(wrapPoolForAuth(pool, "viewer")));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/me`, {
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.member.participantIdentifier, "V-001");
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].status, "Present");
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("GET /attendance/monthly-summary without token returns 401", async () => {
  const pool = wrapPoolForAuth(readerStub());
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/monthly-summary?month=8&year=2026`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("POST /attendance as viewer returns 403", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("viewer")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ participantIdentifier: "X", status: "Present" }),
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("PUT /attendance/:id as viewer returns 403", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/1`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${makeToken("viewer")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ attendanceDate: "2026-08-01", status: "Present" }),
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("DELETE /attendance/:id as viewer returns 403", async () => {
  const pool = wrapPoolForAuth(readerStub(), "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
