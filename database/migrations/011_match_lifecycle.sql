ALTER TABLE tournament_stages
  ADD COLUMN tie_policy ENUM('DRAW_ALLOWED','SUDDEN_DEATH') NOT NULL DEFAULT 'SUDDEN_DEATH' AFTER advance_count,
  ADD COLUMN match_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60 AFTER tie_policy;

ALTER TABLE matches
  ADD COLUMN regulation_ends_at DATETIME NULL AFTER starts_at,
  ADD COLUMN tiebreak_mode ENUM('NONE','SUDDEN_DEATH') NOT NULL DEFAULT 'NONE' AFTER score_version,
  ADD COLUMN tiebreak_started_at DATETIME NULL AFTER tiebreak_mode,
  ADD INDEX ix_match_lifecycle(status,lobby_opens_at,starts_at,regulation_ends_at);
