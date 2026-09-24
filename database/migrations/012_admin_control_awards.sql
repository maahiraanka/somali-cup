CREATE TABLE admin_credentials (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  password_salt VARCHAR(128) NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  password_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  CONSTRAINT fk_admin_cred_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_agent_hash CHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_session_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_admin_session_user(user_id,revoked_at,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE competition_awards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  match_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  award_type ENUM('TOP_PLAYMAKER','GLOBAL_CONNECTOR','FINAL_ASSIST','PLAYER_OF_TOURNAMENT') NOT NULL,
  scope ENUM('SEASON','MATCH') NOT NULL DEFAULT 'SEASON',
  metric_name VARCHAR(64) NOT NULL,
  metric_value INT UNSIGNED NOT NULL DEFAULT 0,
  evidence_json JSON NOT NULL,
  status ENUM('CONFIRMED','REVOKED') NOT NULL DEFAULT 'CONFIRMED',
  confirmed_by_user_id BIGINT UNSIGNED NULL,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ca_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  CONSTRAINT fk_ca_match FOREIGN KEY(match_id) REFERENCES matches(id),
  CONSTRAINT fk_ca_user FOREIGN KEY(user_id) REFERENCES users(id),
  CONSTRAINT fk_ca_admin FOREIGN KEY(confirmed_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_competition_award(season_id,award_type,match_id),
  INDEX ix_ca_user(user_id,season_id),
  INDEX ix_ca_status(season_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
