-- Email notification log — prevents duplicate absence emails per participant
-- per session (one absence email per participant per attendance_date, unless
-- an authorized admin manually triggers a resend).
CREATE TABLE IF NOT EXISTS attendance_email_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  participant_id INT NOT NULL,
  attendance_date DATE NOT NULL,
  email_type VARCHAR(32) NOT NULL,          -- 'absence' | 'checkin'
  recipient_email VARCHAR(255) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'skipped'
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email_log (participant_id, attendance_date, email_type)
);
