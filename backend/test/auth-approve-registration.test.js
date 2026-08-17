import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-approval-tests";

const authRouter = (await import("../src/routes/auth.js")).default;

test("approve pending registration activates the user and ensures a participant exists without duplication", async () => {
  const pendingRegistration = {
    id: 9,
    user_id: 21,
    organization_id: 5,
    claimed_invitation_code: "INV-100",
    status: "pending",
    requested_role: "viewer",
  };

  const userRecord = {
    id: 21,
    email: "ronel@example.com",
    username: "ronel",
    full_name: "Ronel Atilano Pesalbon",
    role: "viewer",
    is_active: 0,
    account_status: "pending",
    organization_id: null,
  };

  const participants = [];

  const connection = {
    async query(sql, params = []) {
      const sqlText = String(sql);

      if (sqlText.includes("SELECT p.* FROM pending_registrations p") && sqlText.includes("WHERE p.id = ? AND p.status = 'pending'")) {
        if (pendingRegistration.status !== "pending") {
          return [[]];
        }
        return [[pendingRegistration]];
      }

      if (sqlText.includes("SELECT id, email, username, full_name, organization_id, role, account_status, is_active") && sqlText.includes("FROM users WHERE id = ? LIMIT 1")) {
        return [[{ ...userRecord }]];
      }

      if (sqlText.includes("UPDATE users SET account_status = 'approved'")) {
        userRecord.account_status = "approved";
        userRecord.is_active = 1;
        userRecord.role = params[0];
        userRecord.organization_id = params[1];
        return [{ affectedRows: 1 }];
      }

      if (sqlText.includes("INSERT IGNORE INTO organization_members")) {
        return [{ affectedRows: 1 }];
      }

      if (sqlText.includes("SELECT id, participant_identifier AS participantIdentifier, user_id AS userId")) {
        return [participants.filter((participant) => participant.user_id === userRecord.id)];
      }

      if (sqlText.includes("SELECT COUNT(*) AS count") && sqlText.includes("TABLE_NAME = 'participants'")) {
        return [[{ count: 0 }]];
      }

      if (sqlText.includes("SELECT id FROM participants WHERE participant_identifier = ? LIMIT 1")) {
        return [[]];
      }

      if (sqlText.includes("INSERT INTO participants")) {
        const created = {
          id: participants.length + 1,
          participant_identifier: params[0],
          user_id: userRecord.id,
          email: userRecord.email,
          first_name: userRecord.full_name.split(" ")[0],
          last_name: userRecord.full_name.split(" ").slice(-1)[0],
        };
        participants.push(created);
        return [{ insertId: created.id }];
      }

      if (sqlText.includes("UPDATE pending_registrations SET status = 'approved'")) {
        pendingRegistration.status = "approved";
        return [{ affectedRows: 1 }];
      }

      return [[]];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
  };

  const pool = {
    query: async (sql, params) => connection.query(sql, params),
    getConnection: async () => connection,
  };

  const router = authRouter({ pool });
  const route = router.stack.find((layer) => layer.route && layer.route.path === "/pending/:id/approve");
  assert.ok(route, "approve pending route should exist");

  const approveHandler = route.route.stack[route.route.stack.length - 1].handle;

  const firstReq = {
    params: { id: "9" },
    body: { role: "administrator", organization_id: 5 },
    user: { id: 99, role: "administrator" },
  };
  const firstRes = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };

  await approveHandler(firstReq, firstRes);

  assert.equal(firstRes.statusCode, 200, `Expected 200, got ${firstRes.statusCode}: ${JSON.stringify(firstRes.body)}`);
  assert.match(firstRes.body.message, /approved|activated/i);
  assert.equal(userRecord.account_status, "approved");
  assert.equal(userRecord.role, "administrator");
  assert.equal(userRecord.organization_id, 5);
  assert.equal(participants.length, 1);
  assert.equal(participants[0].user_id, 21);

  const secondReq = {
    params: { id: "9" },
    body: { role: "administrator", organization_id: 5 },
    user: { id: 99, role: "administrator" },
  };
  const secondRes = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };

  await approveHandler(secondReq, secondRes);

  assert.equal(secondRes.statusCode, 404, `Expected 404 for already processed pending registration, got ${secondRes.statusCode}: ${JSON.stringify(secondRes.body)}`);
  assert.equal(participants.length, 1, "Approval should not create duplicate participants");
});
