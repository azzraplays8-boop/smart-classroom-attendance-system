import "./env.js"; // must be first so JWT_SECRET etc. are loaded before other imports evaluate
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

import { createAppPool, ensureDatabaseExists, getEnvDb } from "./db.js";
import participantsRouter from "./routes/participants.js";
import attendanceRouter from "./routes/attendance.js";
import settingsRouter from "./routes/settings.js";
import qrRouter from "./routes/qr.js";
import authRouter from "./routes/auth.js";
import organizationsRouter from "./routes/organizations.js";

const __filename = fileURLToPath(import.meta.url);


const __dirname = path.dirname(__filename);

const {
  PORT,
  CORS_ORIGIN,
  DB_ROOT_SQL_PATH,
} = process.env;

const app = express();

// CORS: accept a comma-separated list of allowed origins (e.g. Vercel domains).
// When none are set, fall back to allowing all origins in development.
const allowedOrigins = (CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: false,
  })
);
app.use(express.json({ limit: "10mb" }));

// --- Multer configuration for photo uploads ---
const uploadsDir = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const participantsUploadsDir = path.join(uploadsDir, "participants");
if (!fs.existsSync(participantsUploadsDir)) {
  fs.mkdirSync(participantsUploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, participantsUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `participant-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [".jpg", ".jpeg", ".png"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, JPEG, and PNG files are allowed."), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

async function start() {
  const db = getEnvDb();

  await ensureDatabaseExists({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    ssl: db.ssl,
  });

  const pool = createAppPool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    connectionLimit: db.connectionLimit,
    ssl: db.ssl,
  });


// Run schema + migrations on startup (idempotent SQL, safe to run repeatedly).
  // Set DB_AUTO_MIGRATE=false to disable, e.g. when you provision the schema
  // manually or via a separate migration step.
  const autoMigrate = process.env.DB_AUTO_MIGRATE !== "false";

  if (autoMigrate) {
    // Run schema init
    const schemaSqlPath = DB_ROOT_SQL_PATH
      ? path.resolve(DB_ROOT_SQL_PATH)
      : path.resolve(__dirname, "../sql/schema.sql");

    const schemaSql = fs.readFileSync(schemaSqlPath, "utf8");
    await pool.query(schemaSql);

    // Run auth schema
    const authSchemaPath = path.resolve(__dirname, "../sql/auth_schema.sql");
    const authSchemaSql = fs.readFileSync(authSchemaPath, "utf8");
    await pool.query(authSchemaSql);

    const migrationsDir = path.resolve(__dirname, "../sql/migrations");
    if (fs.existsSync(migrationsDir)) {
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort();

      for (const file of migrationFiles) {
        const migrationSql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        if (migrationSql.trim()) {
          await pool.query(migrationSql);
        }
      }
    }
  }

  // Serve uploaded files statically
  app.use("/uploads", express.static(uploadsDir));

  app.get("/health", (req, res) => res.json({ ok: true }));

  // Routes
app.use("/auth", authRouter({ pool }));
  app.use("/participants", participantsRouter({ pool, upload }));
  app.use("/attendance", attendanceRouter({ pool }));
  app.use("/settings", settingsRouter({ pool }));
  app.use("/qr", qrRouter({ pool }));
  app.use("/organizations", organizationsRouter({ pool }));

  app.use((req, res) => {
    res.status(404).json({ message: "Not found" });
  });

  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-unused-vars
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  });

const port = Number(PORT || 5000);
  // Bind to 0.0.0.0 so Render's reverse proxy can reach the app.
  app.listen(port, "0.0.0.0", () => {
    console.log(`API listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
