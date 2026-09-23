ALTER TABLE users
  ADD COLUMN nickname VARCHAR(80) NULL AFTER display_name,
  ADD COLUMN home_city_id BIGINT UNSIGNED NULL AFTER email,
  ADD COLUMN last_seen_at DATETIME NULL AFTER status,
  ADD CONSTRAINT fk_user_home_city FOREIGN KEY(home_city_id) REFERENCES cities(id);

ALTER TABLE city_memberships
  ADD COLUMN verification_status ENUM('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'VERIFIED' AFTER status,
  ADD COLUMN verification_method ENUM('DEVICE_SESSION','EMAIL','ADMIN') NOT NULL DEFAULT 'DEVICE_SESSION' AFTER verification_status,
  ADD COLUMN verified_at DATETIME NULL AFTER verification_method,
  ADD INDEX ix_cm_season_city_verified(season_id,city_id,status,verification_status);

ALTER TABLE season_cities
  ADD COLUMN qualification_target INT UNSIGNED NOT NULL DEFAULT 500 AFTER qualification_total,
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 100 AFTER qualification_target,
  ADD COLUMN is_open TINYINT(1) NOT NULL DEFAULT 1 AFTER sort_order;

CREATE TABLE identity_sessions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_agent_hash CHAR(64) NULL,
  expires_at DATETIME NOT NULL,
  last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_session_user(user_id,revoked_at,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE qualification_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  city_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  type ENUM('SUPPORTER_VERIFIED','SUPPORTER_REJECTED','TARGET_CHANGED','STATUS_CHANGED','CITY_OPENED','CITY_CLOSED') NOT NULL,
  delta INT NOT NULL DEFAULT 0,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qe_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  CONSTRAINT fk_qe_city FOREIGN KEY(city_id) REFERENCES cities(id),
  CONSTRAINT fk_qe_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_qe_city_time(season_id,city_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
