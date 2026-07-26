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
  const [nameColumnResult] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'students'
       AND COLUMN_NAME = 'name'`
  );
  const hasNameColumn = Number(nameColumnResult?.[0]?.count ?? 0) > 0;
  console.log('hasNameColumn', hasNameColumn);

  const resolvedName = 'John A Doe';
  const insertSql = hasNameColumn
    ? `INSERT INTO students (
            student_number,
            name,
            last_name,
            first_name,
            middle_name,
            gender,
            date_of_birth,
            email,
            contact_number,
            course,
            year,
            section,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    : `INSERT INTO students (
            student_number,
            last_name,
            first_name,
            middle_name,
            gender,
            date_of_birth,
            email,
            contact_number,
            course,
            year,
            section,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = hasNameColumn
    ? ['SDEBUG', resolvedName, 'Doe', 'John', 'A', 'Male', '2000-01-01', 'john.debug@example.com', '09171234567', 'BSIT', '1', 'A', 'Active']
    : ['SDEBUG', 'Doe', 'John', 'A', 'Male', '2000-01-01', 'john.debug@example.com', '09171234567', 'BSIT', '1', 'A', 'Active'];
  try {
    const [result] = await pool.query(insertSql, params);
    console.log('insert success', result);
  } catch (err) {
    console.error('insert error', err);
  }
} finally {
  await pool.end();
}
