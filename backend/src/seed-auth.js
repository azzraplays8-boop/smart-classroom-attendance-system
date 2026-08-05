/**
 * Seed script to create default users for the authentication system.
 * Run this script once after setting up the auth schema.
 *
 * Usage: node src/seed-auth.js
 */

import bcrypt from "bcryptjs";
import { createAppPool, ensureDatabaseExists, getEnvDb } from "./db.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_USERS = [
  {
    email: "admin@school.com",
    username: "superadmin",
    password: "Admin123!",
    full_name: "System Administrator",
    role: "super_admin",
    is_active: 1,
  },
  {
    email: "administrator@school.com",
    username: "administrator",
    password: "Admin123!",
    full_name: "School Administrator",
    role: "administrator",
    is_active: 1,
  },
  {
    email: "teacher@school.com",
    username: "teacher",
    password: "Admin123!",
    full_name: "Classroom Teacher",
    role: "teacher",
    is_active: 1,
  },
];

async function seed() {
  try {
    const db = getEnvDb();

    // Ensure database exists
    await ensureDatabaseExists({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
    });

    const pool = createAppPool({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      connectionLimit: 5,
    });

    // Run auth schema first
    const schemaPath = path.resolve(__dirname, "../sql/auth_schema.sql");
    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await pool.query(schemaSql);
    console.log("✅ Auth schema ensured.");

    // Insert default users if they don't exist
    for (const user of DEFAULT_USERS) {
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE email = ? OR username = ?",
        [user.email, user.username]
      );

      if (existing.length > 0) {
        console.log(`⏭️  User "${user.email}" already exists, skipping.`);
        continue;
      }

const hashedPassword = await bcrypt.hash(user.password, 12);
      await pool.query(
        `INSERT INTO users (email, username, password, full_name, role, is_active, account_status)
         VALUES (?, ?, ?, ?, ?, ?, 'approved')`,
        [user.email, user.username, hashedPassword, user.full_name, user.role, user.is_active]
      );

      console.log(`✅ Created user "${user.email}" with role "${user.role}".`);
    }

    console.log("\n🎉 Seeding complete! Default credentials:");
    console.log("   Super Admin:    admin@school.com / Admin123!");
    console.log("   Administrator:  administrator@school.com / Admin123!");
    console.log("   Teacher:        teacher@school.com / Admin123!");

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
}

seed();
