ALTER TABLE leave_requests
  MODIFY status ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending';
