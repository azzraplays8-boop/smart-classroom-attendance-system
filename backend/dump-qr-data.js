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
  console.log(JSON.stringify(participants, null, 2));
} finally {
  await pool.end();
}

