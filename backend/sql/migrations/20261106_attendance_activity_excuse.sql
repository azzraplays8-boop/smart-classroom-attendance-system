-- Activity/session label + excuse reason on attendance records (both nullable,
-- historical rows stay valid). No destructive changes; monthly calculations
-- still derive month/year from attendance_date.
SET @col_count := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'activity'
);
SET @sql := IF(@col_count = 0,
  'ALTER TABLE attendance ADD COLUMN activity VARCHAR(255) NULL AFTER status',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_count := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'attendance'
    AND COLUMN_NAME = 'excuse_reason'
);
SET @sql := IF(@col_count = 0,
  'ALTER TABLE attendance ADD COLUMN excuse_reason VARCHAR(255) NULL AFTER activity',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
