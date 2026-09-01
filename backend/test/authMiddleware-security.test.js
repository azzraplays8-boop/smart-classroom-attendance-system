/**
 * Test: authenticate middleware rejects deleted/deactivated/inactive users
 *
 * This verifies the core security fix: even with a valid (non-expired) JWT,
 * the authenticate middleware must reject users who have been deleted,
 * deactivated, or are otherwise not active in the database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import { authenticate, enforceMaintenanceMode, generateToken } from "../src/auth/authMiddleware.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-testing";

/**
 * Create a mock pool that returns a configurable user record
 * for findUserByIdForAuth (which queries by user.id in the WHERE clause).
 * @param {Object|null} userToReturn - The user row to return (null simulates deleted user)
 */
function createMockPool(userToReturn) {
  return {
    async query(sql, params) {
      // findUserByIdForAuth queries with WHERE u.id = ?
      if (String(sql).includes("WHERE u.id = ?")) {
        if (userToReturn === null) {
          return [[]]; // No rows = user deleted
        }
        return [[userToReturn]];
      }
      // getRolePermissions query
      if (String(sql).includes("FROM user_permissions")) {
        return [[]];
      }
      return [[]];
    },
  };
}

/**
 * Create a test Express app with the authenticate middleware.
 * @param {Object|null} userToReturn
 */
function createTestApp(userToReturn) {
  const app = express();
  app.use(express.json());
  const pool = createMockPool(userToReturn);

  // A protected route that the authenticate middleware guards
  app.get("/protected", authenticate(pool), (req, res) => {
    res.json({ ok: true, user: req.user });
  });

  return app;
}

/**
 * Generate a valid JWT for a test user.
 */
function generateValidToken(userId = 1, extra = {}) {
  return generateToken({
    id: userId,
    email: "test@example.com",
    username: "testuser",
    role: "administrator",
    full_name: "Test User",
    organization_id: null,
    account_status: "approved",
    is_active: 1,
    permissions: [],
    ...extra,
  });
}

/**
 * Make a request and return the response.
 */
async function makeRequest(app, token) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    return { status: res.status, body };
  } finally {
    server.close();
  }
}
// ─── Test 1: Active, approved user can access protected route ───
test("authenticate allows access for active, approved user", async () => {
  const activeUser = {
    id: 1,
    email: "test@example.com",
    username: "testuser",
    role: "administrator",
    full_name: "Test User",
    organization_id: null,
    account_status: "approved",
    is_active: 1,
  };
  const app = createTestApp(activeUser);
  const token = generateValidToken();
  const { status, body } = await makeRequest(app, token);

  assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
  assert.equal(body.ok, true);
  assert.equal(body.user.id, 1);
  assert.equal(body.user.role, "administrator");
});

// ─── Test 2: Deleted user (not in DB) is rejected ───
test("authenticate rejects deleted user (no DB record)", async () => {
  const app = createTestApp(null);
  const token = generateValidToken();
  const { status, body } = await makeRequest(app, token);

  assert.equal(status, 401, `Expected 401 for deleted user, got ${status}`);
  assert.equal(
    body.message,
    "Account is no longer active/authorized. Please contact an administrator."
  );
});

// ─── Test 3: Inactive user (is_active = 0) is rejected ───
test("authenticate rejects inactive user (is_active = 0)", async () => {
  const inactiveUser = {
    id: 2,
    email: "inactive@example.com",
    username: "inactive",
    role: "teacher",
    full_name: "Inactive User",
    organization_id: null,
    account_status: "approved",
    is_active: 0,
  };
  const app = createTestApp(inactiveUser);
  const token = generateValidToken(2);
  const { status, body } = await makeRequest(app, token);

  assert.equal(status, 401, `Expected 401 for inactive user, got ${status}`);
  assert.ok(body.message.includes("no longer active/authorized"));
});

// ─── Test 4: Deactivated user is rejected ───
test("authenticate rejects deactivated user (account_status = 'deactivated')", async () => {
  const deactivatedUser = {
    id: 3,
    email: "deactivated@example.com",
    username: "deactivated",
    role: "teacher",
    full_name: "Deactivated User",
    organization_id: null,
    account_status: "deactivated",
    is_active: 0,
  };
  const app = createTestApp(deactivatedUser);
  const token = generateValidToken(3);
  const { status, body } = await makeRequest(app, token);

  assert.equal(status, 401, `Expected 401 for deactivated user, got ${status}`);
  assert.ok(body.message.includes("no longer active/authorized"));
});

// ─── Test 5: Rejected user is rejected ───
test("authenticate rejects rejected user (account_status = 'rejected')", async () => {
  const rejectedUser = {
    id: 4,
    email: "rejected@example.com",
    username: "rejected",
    role: "viewer",
    full_name: "Rejected User",
    organization_id: null,
    account_status: "rejected",
    is_active: 0,
  };
  const app = createTestApp(rejectedUser);
  const token = generateValidToken(4);
  const { status, body } = await makeRequest(app, token);

  assert.equal(status, 401, `Expected 401 for rejected user, got ${status}`);
  assert.ok(body.message.includes("no longer active/authorized"));
});



// ─── Test 6: Pending user is rejected ───
test("authenticate rejects pending user (account_status = 'pending')", async () => {
  const pendingUser = {
    id: 5,
    email: "pending@example.com",
    username: "pending",
    role: "viewer",
    full_name: "Pending User",
    organization_id: null,
    account_status: "pending",
    is_active: 0,
  };
  const app = createTestApp(pendingUser);
  const token = generateValidToken(5);
  const { status, body } = await makeRequest(app, token);

  assert.equal(status, 401, `Expected 401 for pending user, got ${status}`);
  assert.ok(body.message.includes("no longer active/authorized"));
});

// ─── Test 7: No token is rejected ───
test("authenticate rejects request with no token", async () => {
  const activeUser = { id: 1, account_status: "approved", is_active: 1, role: "administrator" };
  const app = createTestApp(activeUser);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/protected`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.ok(body.message.includes("No token provided"));
  } finally {
    server.close();
  }
});

// ─── Test 8: Invalid token is rejected ───
test("authenticate rejects invalid token", async () => {
  const activeUser = { id: 1, account_status: "approved", is_active: 1, role: "administrator" };
  const app = createTestApp(activeUser);
  const { status, body } = await makeRequest(app, "invalid-token-string");
  assert.equal(status, 401);
  assert.ok(body.message.includes("Invalid token"));
});

// ─── Regression: maintenance mode must not block admin/super-admin roles ───
test("enforceMaintenanceMode allows administrator and super_admin while maintenance is enabled", async () => {
  const pool = {
    async query(sql) {
      if (String(sql).includes("setting_key = 'maintenanceMode'")) {
        return [[{ setting_value: "true" }]];
      }
      return [[]];
    },
  };

  const app = express();
  app.use(express.json());
  app.get("/protected", enforceMaintenanceMode(pool), (req, res) => {
    res.json({ ok: true, userRole: req.user?.role || "unknown" });
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const token = generateValidToken(10, { role: "administrator" });
    const adminRes = await fetch(`http://127.0.0.1:${port}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(adminRes.status, 200, `Expected 200 for admin, got ${adminRes.status}`);
    assert.equal((await adminRes.json()).ok, true);

    const superAdminToken = generateValidToken(11, { role: "super_admin" });
    const superAdminRes = await fetch(`http://127.0.0.1:${port}/protected`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.equal(superAdminRes.status, 200, `Expected 200 for super admin, got ${superAdminRes.status}`);
    assert.equal((await superAdminRes.json()).ok, true);
  } finally {
    server.close();
  }
});

// ─── Test 9: DB error is fail-closed (401) ───
test("authenticate rejects when DB is unavailable (fail-closed)", async () => {
  const app = express();
  app.use(express.json());
  const badPool = {
    async query() {
      throw new Error("Connection refused");
    },
  };
  app.get("/protected", authenticate(badPool), (req, res) => {
    res.json({ ok: true });
  });

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const token = generateValidToken();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/protected`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 401, `Expected 401 on DB error, got ${res.status}`);
    const body = await res.json();
    assert.ok(body.message.includes("Authentication failed"));
  } finally {
    server.close();
  }
});

// ─── Test 10: Active user gets fresh DB data, not stale JWT claims ───
test("authenticate attaches fresh DB user data (not stale JWT claims)", async () => {
  const dbUser = {
    id: 1,
    email: "test@example.com",
    username: "testuser",
    role: "administrator",
    full_name: "Test User",
    organization_id: null,
    account_status: "approved",
    is_active: 1,
  };
  const app = createTestApp(dbUser);
  const token = generateToken({
    id: 1,
    email: "test@example.com",
    username: "testuser",
    role: "teacher",
    full_name: "Test User",
    organization_id: null,
    account_status: "approved",
    permissions: [],
  });
  const { status, body } = await makeRequest(app, token);
  assert.equal(status, 200);
  assert.equal(body.user.role, "administrator");
});

