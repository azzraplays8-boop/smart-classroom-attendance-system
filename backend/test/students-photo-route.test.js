import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createServer } from 'node:http';
import participantsRouter from '../src/routes/participants.js';
import { makeToken, wrapPoolForAuth } from './rbacTestHelpers.js';

function createStubPool(existingParticipant) {
  return {
    async query(sql, params) {
      const sqlStr = String(sql);

      // Participant lookup by id
      if (sqlStr.includes('SELECT id, photo FROM participants WHERE id = ?')) {
        return [[existingParticipant].filter(Boolean)];
      }

      if (sqlStr.includes('UPDATE participants SET photo = ?')) {
        return [{ affectedRows: 1 }];
      }

      return [[]];
    },
  };
}

function makeApp(pool, dirName) {
  const uploadsDir = path.join(os.tmpdir(), dirName);
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${dirName}-${Date.now()}.jpg`),
  });
  const upload = multer({ storage });
  const app = express();
  app.use('/participants', participantsRouter({ pool, upload }));
  return { app, uploadsDir };
}

test('admin can upload a photo for a participant', async () => {
  const authedPool = wrapPoolForAuth(createStubPool({ id: 42, photo: null }), "administrator");
  const { app, uploadsDir } = makeApp(authedPool, 'test-photo-uploads');

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const formData = new FormData();
    formData.append('photo', new Blob(['fake image'], { type: 'image/jpeg' }), 'avatar.jpg');

    const response = await fetch(`http://127.0.0.1:${port}/participants/42/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${makeToken('administrator')}` },
      body: formData,
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.message, 'Photo uploaded successfully');
    assert.ok(body.photo && body.photo.startsWith('participants/'));
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

test('viewer cannot upload a photo for a participant (403)', async () => {
  const authedPool = wrapPoolForAuth(createStubPool({ id: 99, photo: null }), "viewer");
  const { app, uploadsDir } = makeApp(authedPool, 'test-photo-forbidden');

  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const formData = new FormData();
    formData.append('photo', new Blob(['f'], { type: 'image/jpeg' }), 'ph.jpg');

    const response = await fetch(`http://127.0.0.1:${port}/participants/99/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${makeToken('viewer')}` },
      body: formData,
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
