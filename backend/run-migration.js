import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    console.log("Connected to database.");

    // Check existing columns
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'`
    );
    const existingCols = cols.map(c => c.COLUMN_NAME);
    console.log("Existing columns:", existingCols);

    // Add columns if they don't exist
    const alterStatements = [];

    if (!existingCols.includes("qr_uuid")) {
      alterStatements.push("ALTER TABLE students ADD COLUMN qr_uuid VARCHAR(36) NULL UNIQUE AFTER qr_code");
    }
    if (!existingCols.includes("qr_generated_at")) {
      alterStatements.push("ALTER TABLE students ADD COLUMN qr_generated_at TIMESTAMP NULL AFTER qr_uuid");
    }
    if (!existingCols.includes("qr_image")) {
      alterStatements.push("ALTER TABLE students ADD COLUMN qr_image VARCHAR(255) NULL AFTER qr_generated_at");
    }
    if (!existingCols.includes("printed")) {
      alterStatements.push("ALTER TABLE students ADD COLUMN printed TINYINT(1) NOT NULL DEFAULT 0 AFTER qr_image");
    }
    if (!existingCols.includes("qr_status")) {
      alterStatements.push("ALTER TABLE students ADD COLUMN qr_status VARCHAR(20) NOT NULL DEFAULT 'missing' AFTER printed");
    }
    if (!existingCols.includes("last_regenerated")) {
      alterStatements.push("ALTER TABLE students ADD COLUMN last_regenerated TIMESTAMP NULL AFTER qr_status");
    }

    if (alterStatements.length === 0) {
      console.log("All columns already exist.");
    } else {
      console.log("Adding columns:", alterStatements.length);
      for (const sql of alterStatements) {
        console.log("  Executing:", sql.substring(0, 80) + "...");
        await conn.query(sql);
      }
      console.log("All columns added successfully.");
    }

    // Add indexes (using separate checks)
    const [indexes] = await conn.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME IN ('idx_qr_status', 'idx_qr_uuid')`
    );
    const existingIndexes = indexes.map(i => i.INDEX_NAME);

    if (!existingIndexes.includes("idx_qr_status")) {
      console.log("  Adding index idx_qr_status...");
      await conn.query("ALTER TABLE students ADD INDEX idx_qr_status (qr_status)");
    }
    if (!existingIndexes.includes("idx_qr_uuid")) {
      console.log("  Adding index idx_qr_uuid...");
      await conn.query("ALTER TABLE students ADD INDEX idx_qr_uuid (qr_uuid)");
    }

    // Set qr_status to 'missing' for any students that don't have it set
    const [updateResult] = await conn.query(
      `UPDATE students SET qr_status = 'missing' WHERE qr_status IS NULL OR qr_status = ''`
    );
    console.log(`Updated ${updateResult.affectedRows} students with missing qr_status`);

    // Verify final state
    const [finalCols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' ORDER BY ORDINAL_POSITION`
    );
    console.log("Final columns:", finalCols.map(c => c.COLUMN_NAME));

    // Verify data
    const [students] = await conn.query(
      `SELECT id, student_number, qr_status, printed FROM students LIMIT 10`
    );
    console.log("Sample students:", JSON.stringify(students, null, 2));

  } catch (err) {
    console.error("Error:", err);
    if (err.sqlMessage) console.error("SQL Error:", err.sqlMessage);
  }

  await conn.end();
  console.log("Migration complete.");
}

run();

