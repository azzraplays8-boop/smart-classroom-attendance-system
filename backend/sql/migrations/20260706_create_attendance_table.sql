-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  time_in DATETIME NULL,
  time_out DATETIME NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Present',
  remarks TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_participant_date (participant_id, attendance_date)
);

-- Index for lookups by attendance_date
SET @idx_count := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
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
