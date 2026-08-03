-- QR Code Management fields for participants table
-- MySQL 8.0 compatible - uses Node.js migration runner to handle column checks

-- This file is idempotent: safe to run multiple times without data loss.

-- Add qr_uuid column (VARCHAR(36) for UUID storage)
SET @col := 'qr_uuid';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `qr_uuid` VARCHAR(36) NULL AFTER `qr_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add qr_generated_at column (TIMESTAMP, when QR was generated)
SET @col := 'qr_generated_at';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `qr_generated_at` TIMESTAMP NULL AFTER `qr_uuid`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add qr_image column (VARCHAR(255), path to generated QR image file)
SET @col := 'qr_image';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `qr_image` VARCHAR(255) NULL AFTER `qr_generated_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add printed column (TINYINT(1), 0 = not printed, 1 = printed)
SET @col := 'printed';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `printed` TINYINT(1) NOT NULL DEFAULT 0 AFTER `qr_image`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add qr_status column (VARCHAR(20), values: 'missing', 'generated', 'printed')
SET @col := 'qr_status';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  "ALTER TABLE `participants` ADD COLUMN `qr_status` VARCHAR(20) NOT NULL DEFAULT 'missing' AFTER `printed`",
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add last_regenerated column (TIMESTAMP, when QR was last regenerated)
SET @col := 'last_regenerated';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `last_regenerated` TIMESTAMP NULL AFTER `qr_status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add performance indexes for frequent QR queries (idempotent via IF NOT EXISTS pattern)
SET @idx_count := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND INDEX_NAME = 'idx_participants_qr_status'
);
SET @sql_stmt := IF(@idx_count = 0,
  'ALTER TABLE `participants` ADD INDEX `idx_participants_qr_status` (`qr_status`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_count := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND INDEX_NAME = 'idx_participants_qr_uuid'
);
SET @sql_stmt := IF(@idx_count = 0,
  'ALTER TABLE `participants` ADD INDEX `idx_participants_qr_uuid` (`qr_uuid`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql_stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: ensure all existing participants have qr_status = 'missing' as default
UPDATE participants SET qr_status = 'missing' WHERE qr_status IS NULL OR qr_status = '';


