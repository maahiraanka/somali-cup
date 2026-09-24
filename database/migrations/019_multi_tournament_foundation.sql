CREATE TABLE competitions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(140) NOT NULL,
  short_name VARCHAR(80) NOT NULL,
  competition_type ENUM('STAGED','GOAL_RACE','TIMED','HEAD_TO_HEAD') NOT NULL DEFAULT 'STAGED',
  choice_type ENUM('CITY','UNIVERSITY','CLUB','BUSINESS','PERSON','COMMUNITY','CUSTOM') NOT NULL DEFAULT 'CITY',
  language_preset ENUM('CUP','CITY','UNIVERSITY','CLUB','FAN','SIMPLE') NOT NULL DEFAULT 'SIMPLE',
  language_overrides_json JSON NULL,
  status ENUM('DRAFT','OPEN','LIVE','COMPLETE','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  allow_nominations TINYINT(1) NOT NULL DEFAULT 0,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  legacy_season_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_competition_legacy_season(legacy_season_id),
  CONSTRAINT fk_competition_legacy_season FOREIGN KEY(legacy_season_id) REFERENCES seasons(id),
  INDEX ix_competition_status(status,starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE competition_choices (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(140) NOT NULL,
  short_name VARCHAR(80) NULL,
  code VARCHAR(24) NOT NULL,
  choice_type ENUM('CITY','UNIVERSITY','CLUB','BUSINESS','PERSON','COMMUNITY','CUSTOM') NOT NULL,
  legacy_city_id BIGINT UNSIGNED NULL,
  status ENUM('ACTIVE','PAUSED','ELIMINATED','WINNER') NOT NULL DEFAULT 'ACTIVE',
  target INT UNSIGNED NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 100,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_competition_choice_code(competition_id,code),
  UNIQUE KEY uq_competition_legacy_city(competition_id,legacy_city_id),
  CONSTRAINT fk_choice_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  CONSTRAINT fk_choice_legacy_city FOREIGN KEY(legacy_city_id) REFERENCES cities(id),
  INDEX ix_choice_competition_status(competition_id,status,sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE competition_nominations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(140) NOT NULL,
  location_text VARCHAR(160) NULL,
  note VARCHAR(500) NULL,
  status ENUM('PENDING','APPROVED','MERGED','REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_nomination_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  CONSTRAINT fk_nomination_reviewer FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id),
  INDEX ix_nomination_status(competition_id,status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO competitions(slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations,starts_at,ends_at,legacy_season_id)
SELECT 'somali-cup',s.name,'Somali Cup','STAGED','CITY','CUP',
  CASE WHEN s.status='COMPLETE' THEN 'COMPLETE' ELSE 'LIVE' END,
  0,s.starts_at,s.ends_at,s.id
FROM seasons s
WHERE s.id=(SELECT id FROM seasons ORDER BY id DESC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM competitions WHERE slug='somali-cup');

INSERT INTO competition_choices(competition_id,name,short_name,code,choice_type,legacy_city_id,status,target,sort_order,metadata_json)
SELECT cp.id,c.name,c.name,c.code,'CITY',c.id,
  CASE WHEN sc.status='CHAMPION' THEN 'WINNER' WHEN sc.status='ELIMINATED' THEN 'ELIMINATED' ELSE 'ACTIVE' END,
  sc.qualification_target,sc.sort_order,
  JSON_OBJECT('country',c.country,'tier',c.tier)
FROM competitions cp
JOIN season_cities sc ON sc.season_id=cp.legacy_season_id
JOIN cities c ON c.id=sc.city_id
WHERE cp.slug='somali-cup'
  AND NOT EXISTS (
    SELECT 1 FROM competition_choices cc
    WHERE cc.competition_id=cp.id AND cc.legacy_city_id=c.id
  );