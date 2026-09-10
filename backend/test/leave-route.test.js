import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import leaveRouter from '../src/routes/leave.js';
import { makeToken, wrapPoolForAuth } from './rbacTestHelpers.js';

const buildPool = () => ({
  async query(sql, params) {
    const sqlText = String(sql);

    if (sqlText.includes('FROM leave_requests') && sqlText.includes('ORDER BY lr.submitted_at DESC')) {
      return [[{
        id: 7,
        participant_id: 11,
        requester_id: 3,
        requester_role: 'administrator',
        organization_id: 1,
        leave_type: 'sick_leave',
        start_date: '2026-09-11',
        end_date: '2026-09-12',
        days: 2,
        reason: 'Personal health checkup',
        status: 'PENDING',
        rejection_reason: null,
        reviewed_by: null,
        submitted_at: '2026-09-10T08:00:00.000Z',
        reviewed_at: null,
        requester_name: 'Admin User',
        participant_identifier: 'P-1001',
        department: 'IT',
        groupName: 'BSIT-1',
      }]];
    }

    return [[]];
  },
});

test('GET /leave normalizes pending status for admin/super-admin users', async () => {
  const pool = wrapPoolForAuth(buildPool(), 'administrator');
  const app = express();
  app.use(express.json());
  app.use('/leave', leaveRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/leave`, {
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
      },
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Array.isArray(body.requests), true);
    assert.equal(body.requests.length, 1);
    assert.equal(body.requests[0].status, 'pending');
    assert.equal(body.requests[0].requesterRole, 'administrator');
    assert.equal(body.requests[0].requesterName, 'Admin User');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('POST /leave accepts participants without organization_id or group_name columns', async () => {
  const pool = wrapPoolForAuth({
    async query(sql, params) {
      const sqlText = String(sql);

      if (sqlText.includes('FROM participants') && sqlText.includes('organization_id')) {
        throw new Error("ER_BAD_FIELD_ERROR: Unknown column 'organization_id' in 'field list'");
      }

      if (sqlText.includes('FROM participants') && sqlText.includes('WHERE id = ? LIMIT 1')) {
        return [[{
          id: Number(params[0]),
          participant_identifier: 'P-1001',
          department: null,
          group_name: null,
        }]];
      }

      if (sqlText.includes('INSERT INTO leave_requests')) {
        return [{ insertId: 901 }];
      }

      if (sqlText.includes('FROM leave_requests lr JOIN users u') && sqlText.includes('WHERE lr.id = ?')) {
        return [[{
          id: 901,
          participant_id: Number(params[0]) || 11,
          requester_id: 3,
          requester_role: 'administrator',
          organization_id: null,
          leave_type: 'sick_leave',
          start_date: '2026-09-10',
          end_date: '2026-09-11',
          days: 2,
          reason: 'Flu-like symptoms',
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          submitted_at: '2026-09-09T09:00:00.000Z',
          requester_name: 'Admin User',
          participant_identifier: 'P-1001',
          department: null,
          groupName: null,
        }]];
      }

      if (sqlText.includes('SELECT email FROM users')) {
        return [[{ email: 'admin@example.com' }]];
      }

      return [[]];
    },
  }, 'administrator');

  const app = express();
  app.use(express.json());
  app.use('/leave', leaveRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/leave`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        participantId: 11,
        leaveType: 'sick_leave',
        startDate: '2026-09-10',
        endDate: '2026-09-11',
        days: 2,
        reason: 'Flu-like symptoms',
      }),
    });

    assert.equal(response.status, 201, `Expected 201 but got ${response.status}`);
    const body = await response.json();
    assert.equal(body.request.status, 'pending');
    assert.equal(body.request.participantIdentifier, 'P-1001');
    assert.equal(body.request.organizationId, null);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
