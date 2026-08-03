-- Migration: Rename attendance.student_id -> attendance.participant_id
-- Idempotent: safe to run multiple times without data loss.
--
-- The project was migrated from Student -> Participant terminology.
-- The live `attendance` table still uses the legacy `student_id` column,
-- but the backend code (and the canonical schema) reference `participant_id`.
-- This migration renames the column while preserving all existing data,
-- and updates the unique key name to match the canonical schema.

-- ── Step 1: Rename student_id -> participant_id (only if student_id exists) ──
SET @has_student_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'student_id'
);

SET @has_participant_id := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'participant_id'
);

-- Only rename if student_id exists AND participant_id does NOT already exist.
SET @rename_sql := IF(
  @has_student_id > 0 AND @has_participant_id = 0,
  'ALTER TABLE `attendance` CHANGE COLUMN `student_id` `participant_id` INT NOT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @rename_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 2: Rename the unique key (student_id, attendance_date) -> (participant_id, attendance_date) ──
-- Drop the legacy unique key if it still exists.
SET @has_legacy_uk := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND INDEX_NAME = 'uq_attendance_student_date'
);

SET @drop_legacy_uk_sql := IF(
  @has_legacy_uk > 0,
  'ALTER TABLE `attendance` DROP INDEX `uq_attendance_student_date`',
  'SELECT 1'
);
PREPARE stmt FROM @drop_legacy_uk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add the canonical unique key if it does not already exist.
SET @has_canonical_uk := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND INDEX_NAME = 'uq_attendance_participant_date'
);

SET @add_canonical_uk_sql := IF(
  @has_canonical_uk = 0,
  'ALTER TABLE `attendance` ADD UNIQUE KEY `uq_attendance_participant_date` (`participant_id`, `attendance_date`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_canonical_uk_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── Step 3: Ensure the attendance_date index still exists ──
SET @has_date_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND INDEX_NAME = 'idx_attendance_date'
);

SET @add_date_idx_sql := IF(
  @has_date_idx = 0,
  'ALTER TABLE `attendance` ADD INDEX `idx_attendance_date` (`attendance_date`)',
  'SELECT 1'
);
PREPARE stmt FROM @add_date_idx_sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

