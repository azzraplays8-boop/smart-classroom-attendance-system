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
