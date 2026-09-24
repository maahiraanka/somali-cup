CREATE TABLE season_device_claims (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  device_hash CHAR(64) NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_season_device(season_id,device_hash),
  UNIQUE KEY uq_season_user_device(season_id,user_id,device_hash),
  CONSTRAINT fk_sdc_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  CONSTRAINT fk_sdc_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_sdc_user(user_id,last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE identity_integrity_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  event_type ENUM(
    'DEVICE_CLAIMED',
    'DEVICE_RECOVERED',
    'DUPLICATE_DEVICE_BLOCKED',
    'JOIN_ATTEMPT',
    'NETWORK_BURST_SIGNAL'
  ) NOT NULL,
  device_hash CHAR(64) NULL,
  network_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_iie_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  CONSTRAINT fk_iie_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_iie_type_time(event_type,created_at),
  INDEX ix_iie_network_time(network_hash,created_at),
  INDEX ix_iie_device_time(device_hash,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
