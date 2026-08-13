// Quick test to verify authMiddleware imports and exports work
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

import("./src/auth/authMiddleware.js").then(m => {
  console.log("authMiddleware.js imports OK");
  console.log("authenticate is:", typeof m.authenticate);
  console.log("authenticate arity:", m.authenticate.length);
  console.log("authorize is:", typeof m.authorize);
  console.log("authorizePermission is:", typeof m.authorizePermission);
  console.log("generateToken is:", typeof m.generateToken);
  console.log("PERMISSION_KEYS is:", typeof m.PERMISSION_KEYS);
}).catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
