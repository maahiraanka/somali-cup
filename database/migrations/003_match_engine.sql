ALTER TABLE matches
  ADD COLUMN public_id CHAR(26) NULL UNIQUE AFTER id,
  ADD COLUMN lobby_opens_at DATETIME NULL AFTER starts_at,
  ADD COLUMN finalised_at DATETIME NULL AFTER ends_at,
  ADD COLUMN winner_city_id BIGINT UNSIGNED NULL AFTER away_score,
  ADD COLUMN score_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER winner_city_id,
  ADD CONSTRAINT fk_match_winner FOREIGN KEY(winner_city_id) REFERENCES cities(id);

ALTER TABLE match_participations
  ADD COLUMN status ENUM('REGISTERED','ACTIVE','REVOKED') NOT NULL DEFAULT 'REGISTERED' AFTER city_id,
  ADD COLUMN activated_at DATETIME NULL AFTER created_at,
  ADD COLUMN revoked_at DATETIME NULL AFTER activated_at,
  ADD INDEX ix_mp_match_status(match_id,status),
  ADD INDEX ix_mp_share_token(match_id,share_token);

CREATE TABLE match_assists (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  city_id BIGINT UNSIGNED NOT NULL,
  assister_participation_id BIGINT UNSIGNED NOT NULL,
  scorer_participation_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assist_scorer(scorer_participation_id),
  CONSTRAINT fk_ma_match FOREIGN KEY(match_id) REFERENCES matches(id),
  CONSTRAINT fk_ma_city FOREIGN KEY(city_id) REFERENCES cities(id),
  CONSTRAINT fk_ma_assister FOREIGN KEY(assister_participation_id) REFERENCES match_participations(id),
  CONSTRAINT fk_ma_scorer FOREIGN KEY(scorer_participation_id) REFERENCES match_participations(id),
  INDEX ix_ma_assister(assister_participation_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_state_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  match_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM('SCHEDULED','LOBBY','LIVE','FINAL','CANCELLED') NULL,
  to_status ENUM('SCHEDULED','LOBBY','LIVE','FINAL','CANCELLED') NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mse_match FOREIGN KEY(match_id) REFERENCES matches(id),
  CONSTRAINT fk_mse_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
  INDEX ix_mse_match_time(match_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
