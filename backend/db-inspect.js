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

const [cols] = await pool.query(
  `SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'students'
   ORDER BY ORDINAL_POSITION`
);
console.log('COLUMNS', cols.map((c) => c.COLUMN_NAME));

const [rows] = await pool.query('SELECT * FROM students LIMIT 5');
console.log('ROWS', rows.length, rows[0] ?? null);
await pool.end();
