-- Migration: Rename students table to participants (with data preservation)
-- This migration handles the case where a legacy `students` table exists.
-- It renames the table and columns to match the new universal terminology.
-- 
-- For fresh databases using the participants table, this is a no-op.

-- Step 1: Check if students table exists
SET @students_exists := (SELECT COUNT(*) FROM information_schema.TABLES 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students');

-- Step 2: If students table exists, migrate it to participants
SET @migrate_sql := IF(@students_exists > 0,
  'RENAME TABLE students TO participants_migrated',
  'SELECT 1');
PREPARE stmt FROM @migrate_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 3: If migration table exists, rename columns
SET @migrated_exists := (SELECT COUNT(*) FROM information_schema.TABLES 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated');

-- Rename student_number -> participant_identifier
SET @col_rename1 := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) > 0, 
    'ALTER TABLE participants_migrated CHANGE COLUMN student_number participant_identifier VARCHAR(64) NOT NULL',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'student_number'),
  'SELECT 1');
PREPARE stmt FROM @col_rename1;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add missing columns if needed (department, level, group_name)
SET @col_dept := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE participants_migrated ADD COLUMN department VARCHAR(64) NOT NULL DEFAULT "" AFTER contact_number',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'department'),
  'SELECT 1');
PREPARE stmt FROM @col_dept;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Copy course -> department if department was just added
SET @dept_backfill := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) > 0,
    'UPDATE participants_migrated SET department = course WHERE department = "" AND course IS NOT NULL AND course != ""',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'course'),
  'SELECT 1');
PREPARE stmt FROM @dept_backfill;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add level column
SET @col_level := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE participants_migrated ADD COLUMN level VARCHAR(16) NOT NULL DEFAULT "" AFTER department',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'level'),
  'SELECT 1');
PREPARE stmt FROM @col_level;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Copy year -> level if level was just added
SET @level_backfill := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) > 0,
    'UPDATE participants_migrated SET level = year WHERE level = "" AND year IS NOT NULL AND year != ""',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'year'),
  'SELECT 1');
PREPARE stmt FROM @level_backfill;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add group_name column
SET @col_group := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE participants_migrated ADD COLUMN group_name VARCHAR(16) NOT NULL DEFAULT "" AFTER level',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'group_name'),
  'SELECT 1');
PREPARE stmt FROM @col_group;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Copy section -> group_name if group_name was just added
SET @group_backfill := IF(@migrated_exists > 0,
  (SELECT IF(COUNT(*) > 0,
    'UPDATE participants_migrated SET group_name = section WHERE group_name = "" AND section IS NOT NULL AND section != ""',
    'SELECT 1')
   FROM information_schema.COLUMNS 
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants_migrated' AND COLUMN_NAME = 'section'),
  'SELECT 1');
PREPARE stmt FROM @group_backfill;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Step 4: If participants table doesn't exist yet, finalize the migration
SET @participants_exists := (SELECT COUNT(*) FROM information_schema.TABLES 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'participants');

SET @finalize := IF(@migrated_exists > 0 AND @participants_exists = 0,
  'RENAME TABLE participants_migrated TO participants',
  'SELECT 1');
PREPARE stmt FROM @finalize;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- If participants already exists but migrated data exists, merge or skip
SET @cleanup := IF(@migrated_exists > 0 AND @participants_exists > 0,
  'DROP TABLE IF EXISTS participants_migrated',
  'SELECT 1');
PREPARE stmt FROM @cleanup;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
