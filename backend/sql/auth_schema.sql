-- Authentication Schema for Smart Classroom Attendance System
-- Version 1.0

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Login credentials
  email VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL, -- bcrypt hashed

  -- Profile
  full_name VARCHAR(255) NOT NULL,

  -- Role-based access
  role ENUM('super_admin', 'administrator', 'teacher') NOT NULL DEFAULT 'teacher',

  -- Account status
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Constraints
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
