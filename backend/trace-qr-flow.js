/**
 * READ-ONLY TRACE: QR Attendance Flow
 *
 * This script ONLY reads the database. It does NOT insert, update, delete,
 * or generate any records/QR codes. It traces the exact QR payload stored
 * in the DB, compares it with what the scanner would decode and what the
 * attendance route would send to the database.
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 1,
});

const log = (title, data) => {
  console.log(`\n── ${title} ─────────────────────────`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
};

try {
  log("DB INFO", {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
  });

  // 1. Participants table structure
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants'
     ORDER BY ORDINAL_POSITION`
  );
  log("participants columns", cols);

  // 2. Attendance table structure
  const [attCols] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'
     ORDER BY ORDINAL_POSITION`
  );
  log("attendance columns", attCols);

  // 3. Sample participants with QR data
  const [participants] = await pool.query(
    `SELECT id, participant_identifier, qr_uuid, qr_code, qr_status, printed,
            first_name, last_name
     FROM participants
     WHERE qr_status != 'missing' OR qr_uuid IS NOT NULL OR qr_code IS NOT NULL
     LIMIT 20`
  );
  log("participants with QR data", participants);

  // 4. Simulate scanner decode for each participant
  console.log("\n══ SCANNER SIMULATION ══");
  for (const p of participants) {
    const qrCodeRaw = p.qr_code;
    let decodedText = qrCodeRaw;
    let parsed = null;
    try {
      parsed = JSON.parse(qrCodeRaw);
    } catch {
      parsed = null;
    }
    console.log(`\n● participant id=${p.id} identifier=${p.participant_identifier}`);
    console.log(`   qr_code raw    = ${JSON.stringify(qrCodeRaw)}`);
    console.log(`   qr_uuid db     = ${JSON.stringify(p.qr_uuid)}`);
    if (parsed) {
      console.log(`   parsed JSON    = ${JSON.stringify(parsed)}`);
      console.log(`   payload uuid   = ${JSON.stringify(parsed.uuid)}`);
      console.log(`   payload id     = ${JSON.stringify(parsed.id)}`);
      console.log(`   payload idType = ${typeof parsed.id}`);
      console.log(`   payload ident  = ${JSON.stringify(parsed.participantIdentifier)}`);
      const match = parsed.uuid && p.qr_uuid && String(parsed.uuid).trim() === String(p.qr_uuid).trim();
      console.log(`   uuid matches db qr_uuid? ${match}`);
    } else {
      console.log(`   NOT JSON → scanner will treat as legacy participantIdentifier: ${JSON.stringify(qrCodeRaw)}`);
      console.log(`   frontend will POST participantIdentifier=${JSON.stringify(qrCodeRaw)}`);
    }
  }

  // 5. Verify against DB: how many participants match by qr_uuid lookup vs participant_identifier
  console.log("\n══ LOOKUP LOGIC TEST ══");
  for (const p of participants) {
    const raw = p.qr_code;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }

    if (parsed && parsed.uuid) {
      const [rows] = await pool.query(
        `SELECT id, participant_identifier, qr_uuid, qr_status, first_name, last_name
         FROM participants WHERE qr_uuid = ? LIMIT 1`,
        [String(parsed.uuid).trim()]
      );
      console.log(`\n● qrUuid lookup "${String(parsed.uuid).trim()}" → rows=${rows.length}`);
      if (rows.length) console.log(`   found id=${rows[0].id} ident=${rows[0].participant_identifier} qr_status=${rows[0].qr_status}`);
      else console.log(`   ❌ NOT FOUND by qr_uuid`);
    } else {
      const ident = raw;
      const [rows] = await pool.query(
        `SELECT id, participant_identifier, qr_uuid, qr_status, first_name, last_name
         FROM participants WHERE participant_identifier = ? LIMIT 1`,
        [ident]
      );
      console.log(`\n● identifier lookup "${ident}" → rows=${rows.length}`);
      if (rows.length) console.log(`   found id=${rows[0].id} ident=${rows[0].participant_identifier} qr_status=${rows[0].qr_status}`);
      else console.log(`   ❌ NOT FOUND by identifier`);
    }
  }

  // 6. Check if there's a students table (legacy) with QR data
  const [legacyTables] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('students', 'participants_migrated')`
  );
  log("legacy tables", legacyTables);

  for (const t of legacyTables) {
    const [legacyRows] = await pool.query(
      `SELECT id, student_number, qr_code, qr_uuid, qr_status
       FROM \`${t.TABLE_NAME}\`
       LIMIT 10`
    );
    log(`legacy table ${t.TABLE_NAME} rows`, legacyRows);
  }

  // 7. Count participants by qr_status
  const [statusCounts] = await pool.query(
    `SELECT qr_status, COUNT(*) AS count FROM participants GROUP BY qr_status`
  );
  log("participants by qr_status", statusCounts);

  // 8. Check total rows
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM participants`);
  log("total participants", total);

  const [[{ attTotal }]] = await pool.query(`SELECT COUNT(*) AS total FROM attendance`);
  log("total attendance rows", attTotal);
} catch (err) {
  console.error("FATAL ERROR:", err?.message || err);
  if (err?.sqlMessage) console.error("SQL:", err.sqlMessage);
} finally {
  await pool.end();
  console.log("\n══ READ-ONLY TRACE COMPLETE ══");
}

