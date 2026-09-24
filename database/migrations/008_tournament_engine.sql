CREATE TABLE tournament_stages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(24) NOT NULL,
  name VARCHAR(80) NOT NULL,
  stage_type ENUM('GROUP','KNOCKOUT','FINAL') NOT NULL,
  sequence_no SMALLINT UNSIGNED NOT NULL,
  status ENUM('DRAFT','OPEN','COMPLETE') NOT NULL DEFAULT 'DRAFT',
  advance_count SMALLINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_stage_code(season_id,code),
  UNIQUE KEY uq_stage_sequence(season_id,sequence_no),
  CONSTRAINT fk_ts_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  INDEX ix_ts_season_status(season_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_groups (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  stage_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(12) NOT NULL,
  name VARCHAR(60) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_group_code(stage_id,code),
  CONSTRAINT fk_tg_stage FOREIGN KEY(stage_id) REFERENCES tournament_stages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_group_cities (
  group_id BIGINT UNSIGNED NOT NULL,
  city_id BIGINT UNSIGNED NOT NULL,
  seed_no SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  PRIMARY KEY(group_id,city_id),
  CONSTRAINT fk_tgc_group FOREIGN KEY(group_id) REFERENCES tournament_groups(id),
  CONSTRAINT fk_tgc_city FOREIGN KEY(city_id) REFERENCES cities(id),
  INDEX ix_tgc_seed(group_id,seed_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE matches
  ADD COLUMN stage_id BIGINT UNSIGNED NULL AFTER season_id,
  ADD COLUMN group_id BIGINT UNSIGNED NULL AFTER stage_id,
  ADD COLUMN match_no SMALLINT UNSIGNED NULL AFTER round_code,
  ADD COLUMN next_match_id BIGINT UNSIGNED NULL AFTER winner_city_id,
  ADD COLUMN next_match_slot ENUM('HOME','AWAY') NULL AFTER next_match_id,
  ADD CONSTRAINT fk_match_stage FOREIGN KEY(stage_id) REFERENCES tournament_stages(id),
  ADD CONSTRAINT fk_match_group FOREIGN KEY(group_id) REFERENCES tournament_groups(id),
  ADD CONSTRAINT fk_match_next FOREIGN KEY(next_match_id) REFERENCES matches(id),
  ADD INDEX ix_match_stage(stage_id,status),
  ADD INDEX ix_match_group(group_id,status);

CREATE TABLE tournament_advancement_slots (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  target_stage_id BIGINT UNSIGNED NOT NULL,
  target_match_no SMALLINT UNSIGNED NOT NULL,
  target_slot ENUM('HOME','AWAY') NOT NULL,
  source_type ENUM('GROUP_RANK','MATCH_WINNER') NOT NULL,
  source_group_id BIGINT UNSIGNED NULL,
  source_rank SMALLINT UNSIGNED NULL,
  source_match_id BIGINT UNSIGNED NULL,
  resolved_city_id BIGINT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_advancement_target(target_stage_id,target_match_no,target_slot),
  CONSTRAINT fk_tas_target_stage FOREIGN KEY(target_stage_id) REFERENCES tournament_stages(id),
  CONSTRAINT fk_tas_source_group FOREIGN KEY(source_group_id) REFERENCES tournament_groups(id),
  CONSTRAINT fk_tas_source_match FOREIGN KEY(source_match_id) REFERENCES matches(id),
  CONSTRAINT fk_tas_resolved_city FOREIGN KEY(resolved_city_id) REFERENCES cities(id),
  INDEX ix_tas_resolution(target_stage_id,resolved_city_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tournament_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  season_id BIGINT UNSIGNED NOT NULL,
  stage_id BIGINT UNSIGNED NULL,
  event_type ENUM(
    'STAGE_OPENED',
    'STAGE_COMPLETED',
    'GROUPS_CREATED',
    'FIXTURES_GENERATED',
    'ADVANCEMENT_RESOLVED',
    'CHAMPION_CONFIRMED'
  ) NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_te_season FOREIGN KEY(season_id) REFERENCES seasons(id),
  CONSTRAINT fk_te_stage FOREIGN KEY(stage_id) REFERENCES tournament_stages(id),
  INDEX ix_te_season_time(season_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
