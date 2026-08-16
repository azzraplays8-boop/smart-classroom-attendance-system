-- Link participants to their registered user account and prevent duplicate user links.
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND COLUMN_NAME = 'user_id'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE participants ADD COLUMN user_id INT NULL AFTER email',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'participants'
    AND INDEX_NAME = 'uq_participants_user'
);
SET @sql = IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX uq_participants_user ON participants (user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.REFERENTIAL_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND CONSTRAINT_NAME = 'fk_participants_user'
);
SET @sql = IF(
  @fk_exists = 0,
  'ALTER TABLE participants ADD CONSTRAINT fk_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
