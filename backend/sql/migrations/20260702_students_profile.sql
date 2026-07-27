-- Safe migration for Universal Attendance Management Platform
-- Adds missing columns to `participants` without deleting existing data.
-- Compatible with MySQL 8.0

-- Note: This script is idempotent (uses IF NOT EXISTS / existence checks where possible)

SET @table := 'participants';

-- Helper: add column if not exists
-- MySQL doesn't support IF NOT EXISTS for ADD COLUMN reliably, so we check information_schema.

-- Legacy column `name` is being replaced by split fields.
-- We keep `name` as-is to avoid breaking old deployments until cleanup is confirmed.

-- participant_identifier already exists in current schema; keep as-is.


-- Split full name fields
SET @col := 'last_name';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `last_name` VARCHAR(255) NOT NULL DEFAULT ""',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := 'first_name';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `first_name` VARCHAR(255) NOT NULL DEFAULT "" AFTER `last_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col := 'middle_name';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `middle_name` VARCHAR(255) NOT NULL DEFAULT "" AFTER `first_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- gender
SET @col := 'gender';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `gender` VARCHAR(32) NOT NULL DEFAULT "" AFTER `middle_name`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- date_of_birth
SET @col := 'date_of_birth';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `date_of_birth` DATE NULL AFTER `gender`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- email
SET @col := 'email';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `email` VARCHAR(255) NOT NULL DEFAULT "" AFTER `date_of_birth`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contact_number
SET @col := 'contact_number';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `contact_number` VARCHAR(64) NOT NULL DEFAULT "" AFTER `email`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- year
SET @col := 'year';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = @table
    AND COLUMN_NAME = @col
);
-- year already exists; keep.

-- section already exists; keep.

-- created_at / updated_at already exist; keep.

-- course already exists; keep.

-- Backfill split name fields from existing `name` column if possible.
-- `name` format in frontend is "Last, First Middle".
-- Legacy backfill disabled because the current schema does not include the legacy `name` column.
-- This avoids startup failures on databases without the legacy column.
-- Backfill missing emails/contact/gender to empty defaults (already defaulted).

