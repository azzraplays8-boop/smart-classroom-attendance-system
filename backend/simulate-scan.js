/**
 * SIMULATE EXACTLY what the scanner decodes from the QR.
 * Uses the same qrcode + @zxing/browser libraries as the frontend.
 * Read-only: does not modify the database.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, ".env") });

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 1,
});

try {
  const [participants] = await pool.query(
    `SELECT id, participant_identifier, qr_uuid, qr_code, qr_status, first_name, last_name
     FROM participants WHERE qr_status != 'missing' AND qr_code IS NOT NULL
     LIMIT 10`
  );

  if (participants.length === 0) {
    console.log("No participants with generated QR codes found.");
    await pool.end();
    process.exit(0);
  }

  const QRCodeLib = (await import("qrcode")).default;
  const { BrowserQRCodeReader } = await import("@zxing/browser");

  for (const p of participants) {
    console.log(`\n═══════ Participant id=${p.id} (${p.first_name} ${p.last_name}) ═══════`);
    console.log(`DB qr_code  = ${JSON.stringify(p.qr_code)}`);
    console.log(`DB qr_uuid  = ${JSON.stringify(p.qr_uuid)}`);

    // 1. Render QR exactly like QRManagement.jsx does (uses qrcode lib)
    const dataUrl = await QRCodeLib.toDataURL(String(p.qr_code), {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 512,
    });

    // 2. Decode the QR exactly like Attendance.jsx scanner does (@zxing/browser)
    const reader = new BrowserQRCodeReader();
    const result = await reader.decodeFromImageUrl(dataUrl);
    const decoded = result?.getText?.() ?? result?.text ?? "";
    console.log(`Scanner decoded text = ${JSON.stringify(decoded)}`);

    // 3. Replicate Attendance.jsx handleAttendanceScan logic
    let qrPayload = null;
    try {
      qrPayload = JSON.parse(decoded);
    } catch {
      qrPayload = null;
    }

    console.log(`Parsed as JSON? ${qrPayload ? "YES" : "NO"}`);
    if (qrPayload) {
      console.log(`JSON payload   = ${JSON.stringify(qrPayload)}`);
      console.log(`payload.uuid   = ${JSON.stringify(qrPayload.uuid)}`);
      console.log(`payload.id     = ${JSON.stringify(qrPayload.id)} (type: ${typeof qrPayload.id})`);
      console.log(`payload.ident  = ${JSON.stringify(qrPayload.participantIdentifier)}`);
    }

    // 4. Build request body like frontend
    let requestBody = {};
    if (qrPayload && qrPayload.uuid) {
      requestBody = { qrUuid: String(qrPayload.uuid).trim() };
      console.log(`Frontend POST body = ${JSON.stringify(requestBody)}`);
    } else {
      requestBody = { participantIdentifier: decoded };
      console.log(`Frontend POST body = ${JSON.stringify(requestBody)}  (LEGACY PATH)`);
    }

    // 5. Replicate backend lookup for the request body
    if (requestBody.qrUuid) {
      const [rows] = await pool.query(
        `SELECT id, qr_uuid AS qrUuid, qr_status AS qrStatus, participant_identifier AS participantIdentifier,
                first_name AS firstName, last_name AS lastName, middle_name AS middleName,
                department, level AS year, group_name AS section, photo
         FROM participants WHERE qr_uuid = ? LIMIT 1`,
        [requestBody.qrUuid]
      );
      console.log(`Backend qrUuid lookup result rows = ${rows.length}`);
      if (rows.length === 0) {
        console.log(`  ❌ Backend would return: 404 { message: "Invalid QR code: Participant not found." }`);
      } else {
        console.log(`  ✅ Found participant id=${rows[0].id}, identifier=${rows[0].participantIdentifier}, qrStatus=${rows[0].qrStatus}`);
        console.log(`  Backend proceeds to INSERT INTO attendance (participant_id, ...)`);
        console.log(`  ⚠️ BUT live attendance table has student_id column, NOT participant_id!`);
        console.log(`  This will fail with ER_BAD_FIELD_ERROR: Unknown column 'participant_id' in 'field list'`);
      }
    } else {
      const [rows] = await pool.query(
        `SELECT id, participant_identifier AS participantIdentifier, first_name AS firstName,
                last_name AS lastName, middle_name AS middleName, department, level AS year,
                group_name AS section, photo
         FROM participants WHERE participant_identifier = ? LIMIT 1`,
        [requestBody.participantIdentifier]
      );
      console.log(`Backend identifier lookup result rows = ${rows.length}`);
      if (rows.length === 0) {
        console.log(`  ❌ Backend would return: 404 { message: "Participant identifier was not found." }`);
      } else {
        console.log(`  ✅ Found participant id=${rows[0].id}`);
      }
    }
  }
} catch (err) {
  console.error("FATAL:", err?.message || err);
} finally {
  await pool.end();
  console.log("\n═══════ SIMULATION COMPLETE ═══════");
}

