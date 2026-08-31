// Loads .env at import time. Import this module FIRST (before any module
// that reads process.env at the top level, e.g. authMiddleware.js),
// because ES module imports are evaluated before the importing file's body runs.
import dotenv from "dotenv";

dotenv.config();
