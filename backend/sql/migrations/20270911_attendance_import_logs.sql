-- Minimal import log table for historical attendance imports.
-- Safe to run repeatedly; only creates the log when missing.

CREATE TABLE IF NOT EXISTS attendance_import_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NULL,
  imported_by VARCHAR(255) NULL,
  total_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  imported_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
