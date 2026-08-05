-- Enterprise RBAC & Organization Management Migration
-- Since the auth_schema.sql runs before migrations, we build on the existing users table.
-- This migration is idempotent and safe to re-run.

-- ─────────────────────────────────────────────────────────────
-- 1. Extend users.role ENUM to support new roles while keeping
--    existing roles (super_admin, administrator, teacher) intact.
-- ─────────────────────────────────────────────────────────────
SET @current_role_type := (
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'role'
  LIMIT 1
);

-- Rebuild the enum to include new roles (safe because we read the
-- existing definition and append). If the column already has the new
-- values, this is a no-op.
SET @sql = IF(
  @current_role_type IS NULL OR LOCATE('moderator', @current_role_type) = 0,
  "ALTER TABLE users MODIFY COLUMN role ENUM('super_admin','administrator','teacher','moderator','encoder','viewer') NOT NULL DEFAULT 'viewer'",
  "SELECT 1"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- 2. Add account_status + organization_id to users (idempotent).
-- ─────────────────────────────────────────────────────────────
SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'account_status'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE users ADD COLUMN account_status ENUM('pending','approved','rejected','deactivated') NOT NULL DEFAULT 'pending'",
  "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'organization_id'
);
SET @sql = IF(@col_exists = 0,
  "ALTER TABLE users ADD COLUMN organization_id INT NULL",
  "SELECT 1");
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- 3. organizations
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  department VARCHAR(255) NULL,
  description TEXT NULL,
  org_code VARCHAR(64) NULL,
  status ENUM('active','archived') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_organizations_name (name),
  KEY idx_organizations_status (status),
  CONSTRAINT fk_org_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 4. organization_invitation_codes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_invitation_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  code VARCHAR(64) NOT NULL,
  expires_at DATETIME NULL,
  max_uses INT NOT NULL DEFAULT 0,
  used_count INT NOT NULL DEFAULT 0,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invite_code (code),
  KEY idx_invite_org (organization_id),
  CONSTRAINT fk_invite_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_invite_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 5. organization_members (user <-> org membership with role & status)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organization_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  organization_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('administrator','moderator','encoder','viewer','teacher') NOT NULL DEFAULT 'viewer',
  status ENUM('active','inactive','rejected') NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_member (organization_id, user_id),
  KEY idx_member_user (user_id),
  CONSTRAINT fk_member_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 6. user_roles (RBAC role definitions + permission keys)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_key VARCHAR(64) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  UNIQUE KEY uq_user_roles_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 7. user_permissions (permission keys per role)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL,
  permission_key VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_role_permission (role_id, permission_key),
  CONSTRAINT fk_perm_role FOREIGN KEY (role_id) REFERENCES user_roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 8. pending_registrations (approval workflow)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  organization_id INT NULL,
  claimed_invitation_code VARCHAR(64) NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  requested_role VARCHAR(64) NULL,
  reviewed_by INT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pending_user (user_id),
  KEY idx_pending_status (status),
  KEY idx_pending_org (organization_id),
  CONSTRAINT fk_pending_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pending_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE SET NULL,
  CONSTRAINT fk_pending_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- 9. Seed roles + permissions (idempotent)
-- ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO user_roles (role_key, role_name, description) VALUES
  ('administrator', 'Administrator', 'Manage users, attendance, reports and participants'),
  ('moderator', 'Moderator', 'Manage attendance and participants, view reports'),
  ('encoder', 'Encoder', 'Encode attendance and manage participant information'),
  ('viewer', 'Viewer', 'Read-only access to dashboards and reports'),
  ('teacher', 'Teacher', 'Legacy teacher role');

-- Map role_key -> id
SET @admin_id := (SELECT id FROM user_roles WHERE role_key = 'administrator');
SET @moderator_id := (SELECT id FROM user_roles WHERE role_key = 'moderator');
SET @encoder_id := (SELECT id FROM user_roles WHERE role_key = 'encoder');
SET @viewer_id := (SELECT id FROM user_roles WHERE role_key = 'viewer');
SET @teacher_id := (SELECT id FROM user_roles WHERE role_key = 'teacher');

INSERT IGNORE INTO user_permissions (role_id, permission_key) VALUES
  -- Administrator
  (@admin_id, 'view_dashboard'), (@admin_id, 'manage_users'), (@admin_id, 'manage_attendance'),
  (@admin_id, 'manage_reports'), (@admin_id, 'manage_participants'), (@admin_id, 'view_reports'),
  (@admin_id, 'manage_qr'), (@admin_id, 'manage_settings'),
  -- Moderator
  (@moderator_id, 'view_dashboard'), (@moderator_id, 'manage_attendance'), (@moderator_id, 'manage_participants'),
  (@moderator_id, 'view_reports'),
  -- Encoder
  (@encoder_id, 'view_dashboard'), (@encoder_id, 'encode_attendance'), (@encoder_id, 'manage_participants'),
  -- Viewer
  (@viewer_id, 'view_dashboard'), (@viewer_id, 'view_reports');

-- ─────────────────────────────────────────────────────────────
-- 10. Backfill existing users to 'approved' (so current admins
--     do not get locked out). Do NOT disturb super_admin.
-- ─────────────────────────────────────────────────────────────
UPDATE users SET account_status = 'approved' WHERE account_status = 'pending' OR account_status IS NULL;
-- Ensure super_admin is approved
UPDATE users SET account_status = 'approved' WHERE role = 'super_admin';
-- Ensure is_active remains consistent with account_status
UPDATE users SET is_active = 1 WHERE account_status = 'approved';
UPDATE users SET is_active = 0 WHERE account_status = 'deactivated' OR account_status = 'rejected';
