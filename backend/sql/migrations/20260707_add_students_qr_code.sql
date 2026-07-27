-- Add qr_code column to participants if it does not exist
SET @cnt := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = 'qr_code'
);

SET @sql_stmt := IF(@cnt = 0,
  'ALTER TABLE participants ADD COLUMN qr_code VARCHAR(255) NULL',
  'SELECT 1');

PREPARE stmt FROM @sql_stmt;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
