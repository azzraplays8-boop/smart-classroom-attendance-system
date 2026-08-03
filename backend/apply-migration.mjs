import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

try {
  const migrationPath = path.resolve(__dirname, 'sql/migrations/20260710_add_qr_management_fields.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log('Applying migration: 20260710_add_qr_management_fields.sql');
  
  // Split by semicolons to execute individually and see results
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const stmt of statements) {
    try {
      await conn.query(stmt + ';');
      console.log('  ✓ Statement executed successfully');
    } catch (err) {
      console.log('  ✗ Error:', err.message.substring(0, 120));
    }
  }
  
  console.log('\nMigration complete.');
  
} catch (err) {
  console.error('Migration failed:', err);
} finally {
  await conn.end();
}
