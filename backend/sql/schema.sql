-- Create participants table for Universal Attendance Management Platform
-- MySQL 8.0 compatible

CREATE TABLE IF NOT EXISTS participants (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Identification / profile
  participant_identifier VARCHAR(64) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255) NOT NULL,
  gender VARCHAR(32) NOT NULL,
  date_of_birth DATE NULL,
  email VARCHAR(255) NOT NULL,
  contact_number VARCHAR(64) NOT NULL,

  -- Organization grouping
  department VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL,
  group_name VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  qr_code VARCHAR(255) NULL,
  photo VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_participants_identifier (participant_identifier)
);

-- Helpful indexes
-- CREATE INDEX idx_participants_department_level ON participants (department, level);

