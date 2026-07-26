import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';

function createStubPool(studentsByNumber) {
  const students = Object.entries(studentsByNumber).map(([studentNumber, details], index) => ({
    id: index + 1,
    student_number: studentNumber,
    studentNumber,
    first_name: details.firstName,
    firstName: details.firstName,
    last_name: details.lastName,
    lastName: details.lastName,
    course: details.course,
  }));

  return {
    async query(sql, params) {
      if (String(sql).includes('FROM students')) {
        const studentNumber = params?.[0];
        const match = students.find((student) => student.student_number === studentNumber);
        return [[match].filter(Boolean)];
      }

      if (String(sql).includes('FROM attendance WHERE student_id = ? AND attendance_date = CURDATE()')) {
        return [[]];
      }

      if (String(sql).includes('INSERT INTO attendance')) {
        return [{ insertId: 99 }];
      }

      if (String(sql).includes('SELECT a.id')) {
        const studentNumber = params?.[0];
        const match = students.find((student) => student.student_number === studentNumber);
        return [[{
          id: 99,
          student_id: match?.id ?? 1,
          attendance_date: '2026-07-07',
          status: 'Present',
          studentNumber: match?.studentNumber ?? null,
          firstName: match?.firstName ?? null,
          lastName: match?.lastName ?? null,
          course: match?.course ?? null,
        }]];
      }

      return [[]];
    },
  };
}

test('attendance POST returns the correct student details for different scanned QR values', async () => {
  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool: createStubPool({
    '2023-001245': { firstName: 'Juan', lastName: 'Dela Cruz', course: 'BSIT' },
    '2023-002245': { firstName: 'Eren', lastName: 'Yeager', course: 'BSIT' },
  }) }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const firstResponse = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentNumber: '2023-001245' }),
    });
    const firstBody = await firstResponse.json();

    const secondResponse = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentNumber: '2023-002245' }),
    });
    const secondBody = await secondResponse.json();

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 201);
    assert.equal(firstBody.student?.studentNumber, '2023-001245');
    assert.equal(firstBody.student?.firstName, 'Juan');
    assert.equal(firstBody.student?.lastName, 'Dela Cruz');
    assert.equal(secondBody.student?.studentNumber, '2023-002245');
    assert.equal(secondBody.student?.firstName, 'Eren');
    assert.equal(secondBody.student?.lastName, 'Yeager');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
