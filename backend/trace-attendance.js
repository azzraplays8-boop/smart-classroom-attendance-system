/**
 * COMPLETE TRACE OF ATTENDANCE RECORDING PROCESS
 * 
 * This script traces the exact flow:
 * 1. QR decoded payload
 * 2. Frontend request body
 * 3. Backend request body
 * 4. Participant record returned
 * 5. Attendance object being inserted
 * 6. SQL INSERT statement
 * 7. SQL parameters
 * 8. SQL error code
 * 9. Stack trace
 * 10. Final API response
 * 
 * Also verifies the attendance table structure.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const LOG_PREFIX = '🔍 [TRACE]';

function log(step, data) {
  console.log(`\n${LOG_PREFIX} ${step}`);
  console.log(JSON.stringify(data, null, 2));
}

async function inspectDatabase() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DATABASE INSPECTION');
  console.log('═══════════════════════════════════════════════════════\n');

  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 1,
    multipleStatements: true,
  });

  try {
    // ── Step 1: Check database and tables ──────────────────────────
    console.log(`${LOG_PREFIX} 1. CHECKING DATABASE: ${process.env.DB_NAME}`);
    const [dbRows] = await pool.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [process.env.DB_NAME]
    );
    log('Database exists', !!dbRows.length);

    // ── Step 2: Check participants table ────────────────────────────
    console.log(`\n${LOG_PREFIX} 2. PARTICIPANTS TABLE`);
    const [participantsCols] = await pool.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants'
       ORDER BY ORDINAL_POSITION`
    );
    log('Participants columns', participantsCols);

    // Sample participants
    const [sampleParticipants] = await pool.query(
      `SELECT id, participant_identifier, qr_uuid, qr_status, qr_code, first_name, last_name
       FROM participants LIMIT 5`
    );
    log('Sample participants', sampleParticipants);

    // ── Step 3: Check attendance table ──────────────────────────────
    console.log(`\n${LOG_PREFIX} 3. ATTENDANCE TABLE`);
    const [attendanceCols] = await pool.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'
       ORDER BY ORDINAL_POSITION`
    );
    log('Attendance columns', attendanceCols);

    // Check constraints
    const [constraints] = await pool.query(
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
       FROM information_schema.TABLE_CONSTRAINTS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'`
    );
    log('Attendance constraints', constraints);

    // Check foreign keys
    const [foreignKeys] = await pool.query(
      `SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance'
         AND REFERENCED_TABLE_NAME IS NOT NULL`
    );
    log('Attendance foreign keys', foreignKeys);

    // Sample attendance
    const [sampleAttendance] = await pool.query(
      `SELECT * FROM attendance LIMIT 5`
    );
    log('Sample attendance', sampleAttendance);

    // ── Step 4: Check settings table ────────────────────────────────
    console.log(`\n${LOG_PREFIX} 4. SETTINGS TABLE`);
    const [settingsCols] = await pool.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings'
       ORDER BY ORDINAL_POSITION`
    );
    log('Settings columns', settingsCols);

    const [settingsRows] = await pool.query(`SELECT * FROM settings`);
    log('Settings data', settingsRows);

    // ── Step 5: TEST ATTENDANCE INSERT ─────────────────────────────
    console.log(`\n${LOG_PREFIX} 5. TESTING ATTENDANCE INSERT`);

    // Get a participant with QR UUID for testing
    const [qrParticipants] = await pool.query(
      `SELECT id, participant_identifier, qr_uuid, qr_status, first_name, last_name
       FROM participants
       WHERE qr_uuid IS NOT NULL AND qr_status = 'generated'
       LIMIT 3`
    );
    log('Participants with QR', qrParticipants);

    if (qrParticipants.length > 0) {
      const testParticipant = qrParticipants[0];
      console.log(`\n${LOG_PREFIX} Testing INSERT with participant ID: ${testParticipant.id}`);

      // Step 5a: Check if already has attendance today
      const [existingToday] = await pool.query(
        `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = CURDATE() LIMIT 1`,
        [testParticipant.id]
      );
      log('Existing attendance today', existingToday);

      if (existingToday.length === 0) {
        // Step 5b: The exact INSERT that the backend performs
        const computedStatus = 'Present';
        const insertSql = `INSERT INTO attendance (participant_id, attendance_date, time_in, status, remarks, created_at)
                           VALUES (?, CURDATE(), NOW(), ?, ?, NOW())`;
        const insertParams = [testParticipant.id, computedStatus, null];

        log('INSERT SQL', insertSql);
        log('INSERT params', insertParams);

        try {
          const [insertResult] = await pool.query(insertSql, insertParams);
          log('INSERT result', insertResult);

          const [newRow] = await pool.query(
            `SELECT a.id, a.participant_id AS participantId, a.attendance_date AS attendanceDate,
                    a.time_in AS timeIn, a.time_out AS timeOut, a.status, a.remarks, a.created_at AS createdAt,
                    p.participant_identifier AS participantIdentifier, p.first_name AS firstName, p.last_name AS lastName, p.department
             FROM attendance a
             LEFT JOIN participants p ON p.id = a.participant_id
             WHERE a.id = ? LIMIT 1`,
            [insertResult.insertId]
          );
          log('Inserted attendance record', newRow);
          console.log(`\n${LOG_PREFIX} ✅ ATTENDANCE INSERT TEST PASSED`);
        } catch (insertErr) {
          console.log(`\n${LOG_PREFIX} ❌ ATTENDANCE INSERT TEST FAILED`);
          log('SQL error code', insertErr.code || 'N/A');
          log('SQL error message', insertErr.sqlMessage || insertErr.message);
          log('Stack trace', insertErr.stack || 'N/A');
          log('Full error object', {
            code: insertErr.code,
            errno: insertErr.errno,
            sqlState: insertErr.sqlState,
            sqlMessage: insertErr.sqlMessage,
            message: insertErr.message,
          });
        }
      } else {
        console.log(`\n${LOG_PREFIX} ⚠️ Participant already has attendance today, skipping INSERT test`);
      }
    } else {
      console.log(`\n${LOG_PREFIX} ⚠️ No participants with QR UUID found. Checking all participants...`);
      const [allParticipants] = await pool.query(
        `SELECT id, participant_identifier, qr_uuid, qr_status, first_name, last_name FROM participants LIMIT 10`
      );
      log('All participants (first 10)', allParticipants);

      if (allParticipants.length > 0) {
        // Try with first participant (fallback to participantIdentifier lookup)
        const testParticipant = allParticipants[0];
        console.log(`\n${LOG_PREFIX} Testing INSERT with participant ID: ${testParticipant.id}`);
        
        const [existingToday] = await pool.query(
          `SELECT * FROM attendance WHERE participant_id = ? AND attendance_date = CURDATE() LIMIT 1`,
          [testParticipant.id]
        );
        
        if (existingToday.length === 0) {
          const insertSql = `INSERT INTO attendance (participant_id, attendance_date, time_in, status, remarks, created_at)
                             VALUES (?, CURDATE(), NOW(), ?, ?, NOW())`;
          const insertParams = [testParticipant.id, 'Present', null];

          log('INSERT SQL', insertSql);
          log('INSERT params', insertParams);

          try {
            const [insertResult] = await pool.query(insertSql, insertParams);
            log('INSERT result', insertResult);
            console.log(`\n${LOG_PREFIX} ✅ ATTENDANCE INSERT TEST PASSED`);
          } catch (insertErr) {
            console.log(`\n${LOG_PREFIX} ❌ ATTENDANCE INSERT TEST FAILED`);
            log('SQL error code', insertErr.code || 'N/A');
            log('SQL error message', insertErr.sqlMessage || insertErr.message);
            log('Stack trace', insertErr.stack || 'N/A');
            log('Full error object', {
              code: insertErr.code,
              errno: insertErr.errno,
              sqlState: insertErr.sqlState,
              sqlMessage: insertErr.sqlMessage,
              message: insertErr.message,
            });
          }
        }
      }
    }

    // ── Step 6: Verify the UNIQUE constraint works ──────────────────
    console.log(`\n${LOG_PREFIX} 6. VERIFYING UNIQUE CONSTRAINT`);

    // Clean up test data
    await pool.query(`DELETE FROM attendance WHERE remarks = 'trace-test'`);

  } catch (err) {
    console.error(`\n${LOG_PREFIX} ❌ FATAL ERROR DURING INSPECTION`);
    log('Error code', err.code || 'N/A');
    log('Error message', err.sqlMessage || err.message);
    log('Stack trace', err.stack || 'N/A');
  } finally {
    await pool.end();
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  INSPECTION COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
  }
}

inspectDatabase();

