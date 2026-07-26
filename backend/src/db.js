import mysql from "mysql2/promise";

export function createAppPool({ host, port, user, password, database, connectionLimit }) {
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
  });
}

export async function ensureDatabaseExists({ host, port, user, password, database }) {
  if (!database) throw new Error("DB_NAME is required in .env");

  const conn = await mysql.createConnection({
    host,
    port: Number(port || 3306),
    user,
    password,
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  await conn.end();
}

export function getEnvDb() {
  const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_CONNECTION_LIMIT,
  } = process.env;

  return {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: DB_CONNECTION_LIMIT,
  };
}


