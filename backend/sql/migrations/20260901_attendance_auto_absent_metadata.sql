-- Add attendance metadata columns for session-finalized auto-generated absences.
-- Safe to run repeatedly; only adds missing columns.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS source VARCHAR(64) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS auto_generated TINYINT(1) NOT NULL DEFAULT 0 AFTER source;

-- Keep the unique participant/date protection in place while allowing metadata.
-- The existing uq_attendance_participant_date unique key is the guardrail against duplicates.
-- If the index is missing, create it safely.
SET @idx_count := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND INDEX_NAME = 'uq_attendance_participant_date'
);
SET @sql_stmt := IF(@idx_count = 0,
  'ALTER TABLE attendance ADD UNIQUE KEY uq_attendance_participant_date (participant_id, attendance_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Helpful index to support date-based session closure lookups.
SET @idx_count := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND INDEX_NAME = 'idx_attendance_date'
);
SET @sql_stmt := IF(@idx_count = 0,
  'ALTER TABLE attendance ADD INDEX idx_attendance_date (attendance_date)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
