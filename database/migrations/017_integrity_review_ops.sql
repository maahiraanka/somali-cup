ALTER TABLE identity_integrity_events
  ADD COLUMN review_status ENUM('UNREVIEWED','REVIEWED','DISMISSED') NOT NULL DEFAULT 'UNREVIEWED' AFTER metadata_json,
  ADD COLUMN review_notes VARCHAR(500) NULL AFTER review_status,
  ADD COLUMN reviewed_by_user_id BIGINT UNSIGNED NULL AFTER review_notes,
  ADD COLUMN reviewed_at DATETIME NULL AFTER reviewed_by_user_id,
  ADD CONSTRAINT fk_iie_reviewed_by FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id),
  ADD INDEX ix_iie_review_status(review_status,created_at);
