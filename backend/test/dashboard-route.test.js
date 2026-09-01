import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';
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
        return [[{ total: 12 }]];
      }
      if (s.includes('FROM attendance a INNER JOIN participants p') && s.includes("a.attendance_date = CURDATE()")) {
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
    assert.notEqual(body.absentToday, 12 - 7 - 2);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('bulk delete attendance route requires manage_attendance and deletes selected records', async () => {
  let deletedIds = null;
  const pool = wrapPoolForAuth({
    async query(sql, params) {
      const s = String(sql);
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
