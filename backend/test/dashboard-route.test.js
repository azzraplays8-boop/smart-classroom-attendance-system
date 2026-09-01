import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';
import { makeToken, wrapPoolForAuth } from './rbacTestHelpers.js';

function createStubPool() {
  return {
    async query(sql, params) {
      if (String(sql).includes('COUNT(*) AS total FROM participants')) {
        return [{ total: 3 }];
      }

      if (String(sql).includes("attendance_date = CURDATE() AND status = ?")) {
        const status = Array.isArray(params) ? params[0] : params;
        if (status === 'Present') {
          return [{ total: 1 }];
        }
        if (status === 'Late') {
          return [{ total: 1 }];
        }
      }

      return [[]];
    },
  };
}

test('dashboard endpoint returns absent count from participants without today attendance', async () => {
  const pool = wrapPoolForAuth(createStubPool());
  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/dashboard`, {
      headers: { Authorization: `Bearer ${makeToken('administrator')}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.totalParticipants, 3);
    assert.equal(body.presentToday, 1);
    assert.equal(body.lateToday, 1);
    assert.equal(body.absentToday, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('dashboard excludes system-only admin accounts from participant totals', async () => {
  const pool = wrapPoolForAuth({
    async query(sql) {
      if (String(sql).includes('LEFT JOIN users u ON u.id = p.user_id')) {
        return [{ total: 17 }];
      }
      if (String(sql).includes('COUNT(*) AS total FROM participants')) {
        return [{ total: 20 }];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND status = ?")) {
        const statusQuery = String(sql).toLowerCase();
        if (statusQuery.includes("'present'")) return [{ total: 14 }];
        if (statusQuery.includes("'late'")) return [{ total: 2 }];
      }
      return [[]];
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/dashboard`, {
      headers: { Authorization: `Bearer ${makeToken('administrator')}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.totalParticipants, 17);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
