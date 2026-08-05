-- Bulk Import History & Audit Log tables
-- MySQL 8.0 compatible - uses Node.js migration runner to handle checks (idempotent).

-- ── participant_imports ─────────────────────────────────────────────
-- One row per bulk-import job (audit log / history).
SET @t := 'participant_imports';
SET @exists := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @t);
SET @sql := IF(@exists = 0, '
CREATE TABLE participant_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NULL,
  file_size INT NULL,
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  duplicate_rows INT NOT NULL DEFAULT 0,
  invalid_rows INT NOT NULL DEFAULT 0,
  skipped_rows INT NOT NULL DEFAULT 0,
  updated_rows INT NOT NULL DEFAULT 0,
  duplicate_mode VARCHAR(32) NOT NULL DEFAULT ''skip'',
  status VARCHAR(32) NOT NULL DEFAULT ''completed'',
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── participant_import_errors ───────────────────────────────────────
-- One row per invalid/duplicate/skipped row for the Error Report.
SET @t2 := 'participant_import_errors';
SET @exists2 := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @t2);
SET @sql2 := IF(@exists2 = 0, '
CREATE TABLE participant_import_errors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_id INT NOT NULL,
  row_number INT NOT NULL,
  participant_identifier VARCHAR(255) NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_import_errors_import (import_id),
  CONSTRAINT fk_import_errors_import FOREIGN KEY (import_id)
    REFERENCES participant_imports (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4', 'SELECT 1');
PREPARE stmt FROM @sql2; EXECUTE stmt; DEALLOCATE PREPARE stmt;
