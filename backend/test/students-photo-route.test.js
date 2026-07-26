import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import studentsRouter from '../src/routes/students.js';

function createStubPool() {
  return {
    async query(sql, params) {
      const normalizedSql = String(sql).trim();

      if (normalizedSql.includes('information_schema.COLUMNS')) {
        return [[{ count: 1 }]];
      }

      if (normalizedSql.startsWith('INSERT INTO students')) {
        const photoValue = Array.isArray(params) ? params.find((value) => typeof value === 'string' && value.includes('/uploads/students/')) : null;
        return [{ insertId: 42, photoValue }];
      }

      return [[]];
    },
  };
}

test('student creation accepts a photo upload and stores a relative photo path', async () => {
  const app = express();
  app.use(express.json());
  app.use('/students', studentsRouter({ pool: createStubPool() }));

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const formData = new FormData();
    formData.append('studentNumber', '2023-001');
    formData.append('lastName', 'Dela Cruz');
    formData.append('firstName', 'Juan');
    formData.append('middleName', 'Santos');
    formData.append('gender', 'Male');
    formData.append('dateOfBirth', '2004-01-10');
    formData.append('email', 'juan@example.com');
    formData.append('contactNumber', '09171234567');
    formData.append('course', 'BSIT');
    formData.append('year', '1');
    formData.append('section', 'A');
    formData.append('status', 'Active');
    formData.append('photo', new Blob(['fake image'], { type: 'image/png' }), 'avatar.png');

    const response = await fetch(`http://127.0.0.1:${port}/students`, {
      method: 'POST',
      body: formData,
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.message, 'Student created');
    assert.match(body.photoPath || '', /\/uploads\/students\//);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
