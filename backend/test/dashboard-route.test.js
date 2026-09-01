import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';
import { closeSessionAndNotifyAbsences } from '../src/services/attendanceAnalytics.js';
import { makeToken, wrapPoolForAuth } from './rbacTestHelpers.js';

function createStubPool() {
  return {
    async query(sql, params) {
      if (String(sql).includes('COUNT(*) AS total') && String(sql).includes('FROM participants p')) {
        return [[{ total: 3 }]];
      }

      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'present'")) {
        return [[{ total: 1 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'late'")) {
        return [[{ total: 1 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'absent'")) {
        return [[{ total: 0 }]];
      }

      return [[]];
    },
  };
}

test('dashboard endpoint returns absent count from persisted attendance rows', async () => {
  const pool = wrapPoolForAuth({
    async query(sql, params) {
      if (String(sql).includes('COUNT(*) AS total') && String(sql).includes('FROM participants p')) {
        return [[{ total: 3 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'present'")) {
        return [[{ total: 1 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'late'")) {
        return [[{ total: 1 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'absent'")) {
        return [[{ total: 1 }]];
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
    async query(sql, params) {
      if (String(sql).includes('COUNT(*) AS total') && String(sql).includes('FROM participants p')) {
        return [[{ total: 17 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'present'")) {
        return [[{ total: 14 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'late'")) {
        return [[{ total: 2 }]];
      }
      if (String(sql).includes("attendance_date = CURDATE() AND LOWER(a.status) = 'absent'")) {
        return [[{ total: 0 }]];
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

test('dashboard counts actual absent rows instead of inferring phantom absences', async () => {
  const pool = wrapPoolForAuth({
    async query(sql, params) {
      const s = String(sql);
      if (s.includes('COUNT(*) AS total') && s.includes('FROM participants p')) {
        return [[{ total: 20 }]];
      }
      if (s.includes('FROM attendance a') && s.includes("a.attendance_date = CURDATE()")) {
        if (s.includes("LOWER(a.status) = 'present'")) return [[{ total: 7 }]];
        if (s.includes("LOWER(a.status) = 'late'")) return [[{ total: 2 }]];
        if (s.includes("LOWER(a.status) = 'absent'")) return [[{ total: 3 }]];
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
    assert.equal(body.presentToday, 7);
    assert.equal(body.lateToday, 2);
    assert.equal(body.absentToday, 3);
    assert.notEqual(body.absentToday, 20 - 7 - 2);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('closeSessionAndNotifyAbsences creates real absent records and skips duplicates', async () => {
  const state = {
    existingAttendance: [],
    emailLog: [],
  };

  const pool = {
    async query(sql, params) {
      const s = String(sql);
      if (s.includes('FROM participants p')) {
        return [[{
          id: 42,
          participant_identifier: 'P-42',
          first_name: 'Dana',
          last_name: 'Example',
          email: 'dana@example.com',
          department: 'CS',
          level: '1',
          group_name: 'A',
        }]];
      }
      if (s.includes('SELECT participant_id FROM attendance WHERE attendance_date = ?')) {
        return [state.existingAttendance];
      }
      if (s.includes('SELECT participant_id FROM attendance_email_log')) {
        return [state.emailLog];
      }
      if (s.includes('INSERT INTO attendance')) {
        state.existingAttendance.push({ participant_id: params[0] });
        return [{ insertId: 1 }];
      }
      if (s.includes('INSERT INTO attendance_email_log')) {
        state.emailLog.push({ participant_id: params[0], attendance_date: params[1] });
        return [{ insertId: 1 }];
      }
      return [[]];
    },
  };

  const first = await closeSessionAndNotifyAbsences({
    pool,
    date: '2026-09-01',
    activity: 'Math Quiz',
    sendEmail: async () => ({ sent: true }),
  });

  const second = await closeSessionAndNotifyAbsences({
    pool,
    date: '2026-09-01',
    activity: 'Math Quiz',
    sendEmail: async () => ({ sent: true }),
  });

  assert.equal(first.marked, 1);
  assert.equal(first.emailsSent, 1);
  assert.equal(second.marked, 0);
  assert.equal(second.emailsSent, 0);
});

test('bulk delete attendance route requires manage_attendance and deletes selected records', async () => {
  let deletedIds = null;
  const pool = wrapPoolForAuth({
    async query(sql, params) {
      const s = String(sql);
      if (s.includes('SELECT a.id')) {
        return [[{ id: 11 }, { id: 12 }]];
      }
      if (s.includes('DELETE FROM attendance WHERE id IN')) {
        deletedIds = Array.isArray(params) ? params : [params];
        return [{ affectedRows: 2 }];
      }
      return [[{ total: 0 }]];
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/bulk-delete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: [11, 12] }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.deleted, 2);
    assert.deepEqual(deletedIds, [11, 12]);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
