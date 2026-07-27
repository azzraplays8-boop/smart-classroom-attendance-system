-- Add photo column to participants table
SET @col := 'photo';
SET @exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = @col
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `participants` ADD COLUMN `photo` VARCHAR(255) NULL AFTER `qr_code`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

