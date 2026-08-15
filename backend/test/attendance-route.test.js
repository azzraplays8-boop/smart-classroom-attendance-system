import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import attendanceRouter from '../src/routes/attendance.js';
import { makeToken, wrapPoolForAuth } from './rbacTestHelpers.js';

function createStubPool(participantsByNumber) {
  const participants = Object.entries(participantsByNumber).map(([participantIdentifier, details], index) => ({
    id: index + 1,
    participant_identifier: participantIdentifier,
    participantIdentifier,
    first_name: details.firstName,
    firstName: details.firstName,
    last_name: details.lastName,
    lastName: details.lastName,
    middle_name: details.middleName || '',
    middleName: details.middleName || '',
    department: details.department,
  }));

  return {
    async query(sql, params) {
      const sqlStr = String(sql);

      // Duplicate check — no existing attendance today
      if (sqlStr.includes('FROM attendance') && sqlStr.includes('attendance_date = CURDATE()')) {
        return [[]];
      }

      // Participant lookup by identifier for the chosen branch
      if (sqlStr.includes('FROM participants') && sqlStr.includes('WHERE participant_identifier')) {
        const identifier = params?.[0];
        const match = participants.find((p) => p.participant_identifier === identifier);
        return [[match].filter(Boolean)];
      }

      if (sqlStr.includes('FROM participants') && sqlStr.includes('WHERE qr_uuid')) {
        return [[]];
      }

      if (sqlStr.includes('INSERT INTO attendance')) {
        return [{ insertId: 99 }];
      }

      // Fetch the freshly-inserted attendance row
      if (sqlStr.includes('SELECT a.id')) {
        const identifier = params?.length ? params[params.length - 1] : null;
        const match = participants.find((p) => p.participant_identifier === identifier) || participants[0];
        return [[{
          id: 99,
          participant_id: match?.id ?? 1,
          attendanceDate: '2026-07-07',
          timeIn: '2026-07-07T07:35:00.000Z',
          status: 'Late',
          participantIdentifier: match?.participantIdentifier ?? null,
          firstName: match?.firstName ?? null,
          lastName: match?.lastName ?? null,
          department: match?.department ?? null,
        }]];
      }

      return [[]];
    },
  };
}

test('attendance POST records attendance for an administrator using participantIdentifier', async () => {
  const pool = wrapPoolForAuth(createStubPool({
    '2023-001245': { firstName: 'Juan', lastName: 'Dela Cruz', department: 'BSIT' },
  }));

  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ participantIdentifier: '2023-001245', status: 'Late' }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.message, 'Attendance recorded');
    assert.equal(body.attendance?.status, 'Late');
    assert.equal(body.attendance?.firstName, 'Juan');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('attendance POST is denied for an encoder without manage_attendance? (encoder has encode_attendance → allowed)', async () => {
  const pool = wrapPoolForAuth(createStubPool({
    '2023-009999': { firstName: 'Levi', lastName: 'Ackerman', department: 'ICT' },
  }));

  const app = express();
  app.use(express.json());
  app.use('/attendance', attendanceRouter({ pool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('encoder')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ participantIdentifier: '2023-009999', status: 'Present' }),
    });
    assert.equal(response.status, 201);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
