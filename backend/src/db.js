import mysql from "mysql2/promise";
import fs from "fs";

/**
 * Resolve the `ssl` option passed to the MySQL driver from environment
 * variables. Managed MySQL providers (Railway, Aiven, TiDB Cloud) normally
 * require TLS, which is enabled with `DB_SSL=true`.
 *
 * Supported values for DB_SSL:
 *   true / 1 / required  → enable TLS (relaxed certificate verification)
 *   false / 0 / none     → disable TLS (local development)
 *
 * If DB_SSL_CA_PATH points to a PEM certificate bundle from the provider,
 * it is used so the server certificate can be verified properly.
 */
function resolveSsl() {
  const flag = String(process.env.DB_SSL || "").toLowerCase();

  if (!flag || flag === "false" || flag === "0" || flag === "none" || flag === "disabled") {
    return undefined;
  }

  if (process.env.DB_SSL_CA_PATH) {
    try {
      return { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH, "utf8") };
    } catch (err) {
      throw new Error(`DB_SSL_CA_PATH could not be read: ${err.message}`);
    }
  }

  return { rejectUnauthorized: false };
}

/**
 * Parse a MySQL connection URL into a config object.
 * Example: mysql://user:pass@host:3306/dbname?ssl-mode=REQUIRED
 */
function parseDatabaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid URL. Expected: mysql://USER:PASSWORD@HOST:PORT/DBNAME"
    );
  }

  const sslParam = (
    parsed.searchParams.get("ssl-mode") ||
    parsed.searchParams.get("sslMode") ||
    ""
  ).toLowerCase();

  return {
    host: parsed.hostname || undefined,
    port: Number(parsed.port || 3306),
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname ? decodeURIComponent(parsed.pathname.replace(/^\//, "")) : undefined,
    ssl:
      sslParam === "required" || sslParam === "true" || sslParam === "1"
        ? { rejectUnauthorized: false }
        : resolveSsl(),
  };
}

/**
 * Build the connection config strictly from process.env.
 * A single DATABASE_URL takes precedence over individual DB_* variables.
 */
function buildConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return parseDatabaseUrl(process.env.DATABASE_URL);
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: resolveSsl(),
  };
}

export function createAppPool({ host, port, user, password, database, connectionLimit, ssl }) {
  return mysql.createPool({
    host,
    port: Number(port || 3306),
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: Number(connectionLimit || 10),
    queueLimit: 0,
    multipleStatements: true,
    ...(ssl ? { ssl } : {}),
  });
}

export async function ensureDatabaseExists({ host, port, user, password, database, ssl }) {
  if (!database) {
    throw new Error("DB_NAME is required in .env (or DATABASE_URL must include a database name)");
  }

  const conn = await mysql.createConnection({
    host,
    port: Number(port || 3306),
    user,
    password,
    ...(ssl ? { ssl } : {}),
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await conn.end();
}

export function getEnvDb() {
  const cfg = buildConnectionConfig();

  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    ssl: cfg.ssl,
  };
}

