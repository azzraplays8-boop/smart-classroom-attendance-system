import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import * as XLSX from 'xlsx';
import attendanceRouter from '../src/routes/attendance.js';
import { makeToken, wrapPoolForAuth } from './rbacTestHelpers.js';

function createImportPool() {
  const participantMap = new Map([
    ['P-1001', { id: 1, participant_identifier: 'P-1001', first_name: 'Juan', last_name: 'Dela Cruz', department: 'BSIT', level: '2nd Year', group_name: 'A' }],
    ['P-1002', { id: 2, participant_identifier: 'P-1002', first_name: 'Maria', last_name: 'Santos', department: 'BSCS', level: '3rd Year', group_name: 'B' }],
  ]);

  const attendanceRows = [];

  return wrapPoolForAuth({
    async query(sql, params) {
      const sqlStr = String(sql);

      if (sqlStr.includes('FROM participants') && sqlStr.includes('WHERE participant_identifier')) {
        const identifier = params?.[0];
        const participant = participantMap.get(String(identifier || '').trim());
        return [[participant ? { ...participant } : null]].filter(Boolean);
      }

      if (sqlStr.includes('SELECT a.id, a.participant_id') && sqlStr.includes('WHERE a.participant_id = ? AND a.attendance_date = ?')) {
        const participantId = Number(params?.[0]);
        const attendanceDate = String(params?.[1] || '');
        return [[attendanceRows.find((row) => Number(row.participant_id) === participantId && row.attendance_date === attendanceDate) || null].filter(Boolean)];
      }

      if (sqlStr.includes('INSERT INTO attendance')) {
        const values = params || [];
        const participantId = Number(values[0]);
        const attendanceDate = String(values[1]);
        const status = String(values[2] || 'Present');
        const activity = values[3] ?? null;
        const timeIn = values[4] ?? null;
        const source = values[5] ?? null;
        const remarks = values[6] ?? null;
        attendanceRows.push({
          id: attendanceRows.length + 1,
          participant_id: participantId,
          attendance_date: attendanceDate,
          status,
          activity,
          time_in: timeIn,
          source,
          remarks,
        });
        return [{ insertId: attendanceRows.length }];
      }

      if (sqlStr.includes('INSERT INTO attendance_import_logs')) {
        return [{ insertId: 1 }];
      }

      if (sqlStr.includes('SELECT COUNT(*) AS total') && sqlStr.includes('FROM attendance')) {
        return [[{ total: attendanceRows.length }]];
      }

      if (sqlStr.includes('FROM attendance_import_logs')) {
        return [[]];
      }

      return [[]];
    },
  });
}

test('attendance import allows admin to bulk import valid rows', async () => {
  const pool = createImportPool();
  const authedPool = wrapPoolForAuth(pool, 'administrator');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/attendance', attendanceRouter({ pool: authedPool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'attendance_august_2026.xlsx',
        rows: [
          {
            'Participant ID': 'P-1001',
            'Participant Name': 'Juan Dela Cruz',
            Date: '2026-09-10',
            'Time In': '08:15 AM',
            Status: 'Present',
            'Activity / Session': 'Orientation',
            'Department / Group': 'BSIT',
            'Year Level / Category': '2nd Year',
            Section: 'A',
            Remarks: 'On time',
          },
        ],
      }),
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.summary.imported, 1);
    assert.equal(body.summary.totalSubmitted, 1);
    assert.equal(body.summary.failed, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('attendance import template includes all organization participants and required columns', async () => {
  const participantRows = [
    {
      id: 1,
      participantIdentifier: 'P-1001',
      firstName: 'Juan',
      middleName: 'Santos',
      lastName: 'Dela Cruz',
      department: 'BSIT',
      year: '2nd Year',
      section: 'A',
      status: 'Active',
    },
    {
      id: 2,
      participantIdentifier: 'P-1002',
      firstName: 'Maria',
      middleName: 'Lopez',
      lastName: 'Santos',
      department: 'BSCS',
      year: '3rd Year',
      section: 'B',
      status: 'Active',
    },
  ];

  const pool = {
    async query(sql) {
      const sqlStr = String(sql);
      if (sqlStr.includes('FROM participants')) {
        return [participantRows];
      }
      return [[]];
    },
  };

  const authedPool = wrapPoolForAuth(pool, 'administrator');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/attendance', attendanceRouter({ pool: authedPool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/import-template`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
      },
    });

    assert.equal(response.status, 200);
    const buffer = Buffer.from(await response.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets['Attendance Import'];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false });

    const headers = rows[0] || [];
    assert.deepEqual(headers.slice(0, 11), [
      'Participant ID',
      'Last Name',
      'First Name',
      'Middle Name',
      'Course / Department',
      'Year Level / Category',
      'Section / Team',
      'Date',
      'Time In',
      'Status',
      'Remarks',
    ]);
    assert.equal(rows[1]?.[0], 'P-1001');
    assert.equal(rows[1]?.[1], 'Dela Cruz');
    assert.equal(rows[1]?.[2], 'Juan');
    assert.equal(rows[1]?.[3], 'Santos');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('attendance import accepts session-level date and skips blank status rows', async () => {
  const pool = createImportPool();
  const authedPool = wrapPoolForAuth(pool, 'administrator');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/attendance', attendanceRouter({ pool: authedPool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('administrator')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: 'attendance_session_template.xlsx',
        session: { date: '2026-09-11', activity: 'Flag Ceremony' },
        rows: [
          { 'Participant ID': 'P-1001', 'Participant Name': 'Juan Dela Cruz', Status: 'Present', 'Time In': '08:10 AM', Remarks: 'On time' },
          { 'Participant ID': 'P-1002', 'Participant Name': 'Maria Santos', Status: '', 'Time In': '', Remarks: '' },
        ],
      }),
    });

    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.summary.imported, 1);
    assert.equal(body.summary.failed, 0);
    assert.equal(body.summary.totalSubmitted, 2);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test('attendance import denies viewer access', async () => {
  const pool = createImportPool();
  const authedPool = wrapPoolForAuth(pool, 'viewer');
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/attendance', attendanceRouter({ pool: authedPool }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/attendance/import`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${makeToken('viewer')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: [] }),
    });

    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
