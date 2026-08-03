import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = await mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 1,
});

try {
  const [cols] = await pool.query('SHOW COLUMNS FROM attendance');
  console.log('ATTENDANCE COLUMNS:');
  console.log(cols.map((c) => c.Field).join(', '));

  const [parts] = await pool.query(
    "SELECT id, participant_identifier, qr_uuid, qr_code, qr_status FROM participants WHERE qr_status IN ('generated','printed') LIMIT 5"
  );
  console.log('\nQR PARTICIPANTS:');
  console.log(JSON.stringify(parts, null, 2));
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await pool.end();
}

