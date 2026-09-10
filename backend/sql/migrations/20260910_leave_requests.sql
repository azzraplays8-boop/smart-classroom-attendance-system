CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT NULL,
  requester_id INT NOT NULL,
  requester_role VARCHAR(32) NOT NULL,
  organization_id INT NULL,
  leave_type VARCHAR(64) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days DECIMAL(6,2) NOT NULL,
  reason TEXT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  rejection_reason TEXT NULL,
  reviewed_by INT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  KEY idx_leave_status (status),
  KEY idx_leave_requester (requester_id),
  KEY idx_leave_participant (participant_id),
  CONSTRAINT fk_leave_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
  CONSTRAINT fk_leave_requester FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leave_adjustments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT NOT NULL,
  organization_id INT NULL,
  leave_type VARCHAR(64) NOT NULL,
  days DECIMAL(6,2) NOT NULL,
  adjustment_type ENUM('ADD','DEDUCT') NOT NULL,
  reason TEXT NOT NULL,
  adjusted_by INT NOT NULL,
  adjusted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_leave_adjustment_participant (participant_id),
  KEY idx_leave_adjustment_type (leave_type),
  CONSTRAINT fk_leave_adjustment_participant FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_adjustment_user FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
