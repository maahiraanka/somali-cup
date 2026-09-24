CREATE TABLE qualification_referrals (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  city_id BIGINT UNSIGNED NOT NULL,
  referrer_user_id BIGINT UNSIGNED NOT NULL,
  referred_user_id BIGINT UNSIGNED NOT NULL,
  source VARCHAR(24) NOT NULL DEFAULT 'share',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_qr_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  CONSTRAINT fk_qr_city FOREIGN KEY(city_id) REFERENCES cities(id),
  CONSTRAINT fk_qr_referrer FOREIGN KEY(referrer_user_id) REFERENCES users(id),
  CONSTRAINT fk_qr_referred FOREIGN KEY(referred_user_id) REFERENCES users(id),
  UNIQUE KEY uq_qr_referred_season(referred_user_id,season_id),
  INDEX ix_qr_referrer_season(referrer_user_id,season_id),
  INDEX ix_qr_city_time(season_id,city_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
