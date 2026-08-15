/**
 * RBAC Security Tests for Attendance Routes
 *
 * Verifies that the authenticate + authorizePermission middleware on
 * attendance endpoints properly enforces role-based access:
 *   - Viewer -> 403 on POST/PUT/DELETE (read-only)
 *   - Unauthenticated -> 401 on any route
 *   - Administrator -> 200/201 on mutations
 *   - GET /history -> 200 for any authenticated role (incl. Viewer)
 */

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import attendanceRouter from "../src/routes/attendance.js";
import { makeToken, wrapPoolForAuth } from "./rbacTestHelpers.js";

/** Stub that supports admin POST (participant lookup, insert, select). */
function adminPostStub() {
  return {
    async query(sql, _params) {
      const s = String(sql);
      if (s.includes("CURDATE()")) return [[]];
      if (s.includes("FROM participants")) return [[{ id: 1, participant_identifier: "A001" }]];
      if (s.includes("INSERT INTO attendance")) return [{ insertId: 100 }];
      if (s.includes("SELECT a.id")) return [[{ id: 100, status: "Present", participant_id: 1, attendanceDate: "2026-08-01" }]];
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

test("GET /attendance/history without token returns 401", async () => {
  const pool = wrapPoolForAuth({ query: async () => [[]] });
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/history`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("POST /attendance as viewer returns 403", async () => {
  const pool = wrapPoolForAuth({ query: async () => [[]] }, "viewer");
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

test("POST /attendance as administrator returns 201", async () => {
  const pool = wrapPoolForAuth(adminPostStub());
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("administrator")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ participantIdentifier: "A001", status: "Present" }),
    });
    assert.equal(res.status, 201);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("POST /attendance as encoder returns 201", async () => {
  const pool = wrapPoolForAuth(adminPostStub(), "encoder");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${makeToken("encoder")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ participantIdentifier: "A001", status: "Present" }),
    });
    assert.equal(res.status, 201);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});

test("PUT /attendance/:id as viewer returns 403", async() => {
  const pool = wrapPoolForAuth({ query: async () => [[]] }, "viewer");
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
  const pool = wrapPoolForAuth({ query: async () => [[]] }, "viewer");
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

test("GET /attendance/history as viewer returns 200", async () => {
  const pool = wrapPoolForAuth({ query: async () => [[[]]] }, "viewer");
  const server = createServer(makeServer(pool));
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/attendance/history`, {
      headers: { Authorization: `Bearer ${makeToken("viewer")}` },
    });
    assert.equal(res.status, 200);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
});