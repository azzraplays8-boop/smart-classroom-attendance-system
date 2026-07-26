-- Create students table for Student Information System
-- MySQL 8.0 compatible

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Identification / profile
  student_number VARCHAR(64) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255) NOT NULL,
  gender VARCHAR(32) NOT NULL,
  date_of_birth DATE NULL,
  email VARCHAR(255) NOT NULL,
  contact_number VARCHAR(64) NOT NULL,

  -- Enrollment
  course VARCHAR(64) NOT NULL,
  year VARCHAR(16) NOT NULL,
  section VARCHAR(16) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  qr_code VARCHAR(255) NULL,
  photo VARCHAR(255) NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_students_student_number (student_number)
);

-- Helpful indexes
-- CREATE INDEX idx_students_course_year ON students (course, year);

