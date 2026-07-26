import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';

function createStubPool() {
  return {
    async query(sql, params) {
      if (String(sql).includes('COUNT(*) AS total FROM students')) {
        return [{ total: 3 }];
      }

      if (String(sql).includes('status = ?')) {
        const status = Array.isArray(params) ? params[0] : params;
        if (status === 'Present') {
          return [[{ total: 1 }]];
        }
        if (status === 'Late') {
          return [[{ total: 1 }]];
        }
      }

      return [[]];
    },
  };
}

test('dashboard endpoint returns absent count from students without today attendance', async () => {
  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool: createStubPool() }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/dashboard`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.totalStudents, 3);
    assert.equal(body.presentToday, 1);
    assert.equal(body.lateToday, 1);
    assert.equal(body.absentToday, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
