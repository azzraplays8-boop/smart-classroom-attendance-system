import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';

function createStubPool(initialRows) {
  let rows = initialRows.map((row) => ({ ...row }));

  return {
    async query(sql, params) {
      const normalizedSql = String(sql).trim();

      if (normalizedSql.startsWith('UPDATE attendance')) {
        const id = Number(params?.[3]);
        rows = rows.map((row) => (row.id === id ? { ...row, attendanceDate: params?.[0], timeIn: params?.[1], status: params?.[2] } : row));
        return [{ affectedRows: 1 }];
      }

      if (normalizedSql.startsWith('DELETE FROM attendance')) {
        const id = Number(params?.[0]);
        rows = rows.filter((row) => row.id !== id);
        return [{ affectedRows: 1 }];
      }

      if (normalizedSql.includes('SELECT a.id')) {
        const id = Number(params?.[0]);
        const match = rows.find((row) => row.id === id);
        return [[match ? { ...match } : null]];
      }

      return [[]];
    },
  };
}

test('attendance PUT updates an existing record', async () => {
  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool: createStubPool([{ id: 10, attendanceDate: '2026-07-07', timeIn: '2026-07-07T08:00:00.000Z', status: 'Present' }]) }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/10`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendanceDate: '2026-07-08', timeIn: '2026-07-08T09:30:00.000Z', status: 'Late' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message, 'Attendance record updated');
    assert.equal(body.attendance?.attendanceDate, '2026-07-08');
    assert.equal(body.attendance?.status, 'Late');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('attendance DELETE removes the requested record', async () => {
  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool: createStubPool([{ id: 11, attendanceDate: '2026-07-07', timeIn: '2026-07-07T08:00:00.000Z', status: 'Present' }]) }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/11`, { method: 'DELETE' });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message, 'Attendance record deleted');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
