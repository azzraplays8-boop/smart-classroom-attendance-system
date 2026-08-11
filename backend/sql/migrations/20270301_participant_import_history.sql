-- Bulk Import History & Audit Log tables
-- MySQL 8.0 compatible - uses Node.js migration runner to handle checks (idempotent).

-- ── participant_imports ─────────────────────────────────────────────
-- One row per bulk-import job (audit log / history).
CREATE TABLE IF NOT EXISTS participant_imports (
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
  duplicate_mode VARCHAR(32) NOT NULL DEFAULT 'skip',
  status VARCHAR(32) NOT NULL DEFAULT 'completed',
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE participant_imports ENGINE=InnoDB;
ALTER TABLE participant_imports MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
SET @pk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participant_imports'
    AND CONSTRAINT_TYPE = 'PRIMARY KEY'
);
SET @sql := IF(@pk_exists = 0,
  'ALTER TABLE participant_imports ADD PRIMARY KEY (id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── participant_import_errors ───────────────────────────────────────
-- One row per invalid/duplicate/skipped row for the Error Report.
CREATE TABLE IF NOT EXISTS participant_import_errors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  import_id INT NOT NULL,
  `row_number` INT NOT NULL,
  participant_identifier VARCHAR(255) NULL,
  reason VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE participant_import_errors ENGINE=InnoDB;
ALTER TABLE participant_import_errors MODIFY COLUMN import_id INT NOT NULL;
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participant_import_errors'
    AND INDEX_NAME = 'idx_import_errors_import'
);
SET @sql := IF(@idx_exists = 0,
  'ALTER TABLE participant_import_errors ADD INDEX idx_import_errors_import (import_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participant_import_errors'
    AND CONSTRAINT_NAME = 'fk_import_errors_import'
);
SET @sql := IF(@fk_exists = 0,
  'ALTER TABLE participant_import_errors ADD CONSTRAINT fk_import_errors_import FOREIGN KEY (import_id) REFERENCES participant_imports (id) ON DELETE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
