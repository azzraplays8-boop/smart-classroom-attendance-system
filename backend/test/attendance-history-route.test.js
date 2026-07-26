import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';

function createStubPool(rows) {
  return {
    async query(sql) {
      if (String(sql).includes('COUNT(*)')) {
        return [[{ total: rows.length }]];
      }

      if (String(sql).includes('FROM attendance')) {
        return [rows];
      }

      return [[]];
    },
  };
}

test('attendance history endpoint returns attendance rows for the history page', async () => {
  const rows = [
    {
      id: 2,
      attendanceDate: '2026-07-07',
      studentNumber: '2023-002245',
      firstName: 'Eren',
      lastName: 'Yeager',
      course: 'STEM',
      year: '12',
      section: 'A',
      timeIn: '2026-07-07 08:05:00',
      status: 'Present',
    },
    {
      id: 1,
      attendanceDate: '2026-07-06',
      studentNumber: '2023-001245',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      course: 'ICT',
      year: '11',
      section: 'B',
      timeIn: '2026-07-06 07:30:00',
      status: 'Late',
    },
  ];

  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool: createStubPool(rows) }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/history`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.records.length, 2);
    assert.equal(body.records[0].studentNumber, '2023-002245');
    assert.equal(body.records[0].firstName, 'Eren');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
