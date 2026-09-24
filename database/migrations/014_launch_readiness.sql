CREATE TABLE launch_acceptance_runs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  run_type ENUM('PREFLIGHT','SAFE_ACCEPTANCE','CONTROLLED_ACCEPTANCE') NOT NULL,
  status ENUM('PASS','FAIL') NOT NULL,
  failures SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  warnings SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  origin VARCHAR(255) NULL,
  evidence_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_lar_type_time(run_type,created_at),
  INDEX ix_lar_status_time(status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
