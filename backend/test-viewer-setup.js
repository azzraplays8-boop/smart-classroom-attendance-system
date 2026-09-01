import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "localhost", port: 3306, user: "root",
  password: "21RONfoewbo@38124", database: "smart_attendance",
});

await c.query(
  "INSERT IGNORE INTO users (email, username, password, role, full_name, account_status, is_active) VALUES (?, ?, ?, 'viewer', 'Viewer Test', 'approved', 1)",
  ["viewer.test@example.com", "viewertest", "x"]
);
const [u] = await c.query("SELECT id, email, role FROM users WHERE email = ?", ["viewer.test@example.com"]);
console.log("USER", JSON.stringify(u));
await c.query("UPDATE participants SET user_id = ?, email = ? WHERE id = 1", [u[0].id, "viewer.test@example.com"]);
const [p] = await c.query("SELECT id, email, user_id FROM participants WHERE id = 1");
console.log("PART", JSON.stringify(p));
await c.end();
