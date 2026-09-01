// Temporary reproduction script: call GET /attendance/me as a viewer
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "localhost", port: 3306, user: "root",
  password: "21RONfoewbo@38124", database: "smart_attendance",
});
const [users] = await c.query("SELECT * FROM users WHERE email = ?", ["viewer.test@example.com"]);
const u = users[0];
await c.end();

const secret = "dev-only-secret-key-9f3a7c2e1b8d4a6f5e3c7b9d2a1f4e8c";
const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, secret, { expiresIn: "1h" });

const res = await fetch("http://localhost:5000/attendance/me", {
  headers: { Authorization: `Bearer ${token}` },
});
const text = await res.text();
console.log("STATUS", res.status);
console.log("BODY", text.slice(0, 2000));
