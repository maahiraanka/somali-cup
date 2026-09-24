CREATE TABLE competition_stages (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  stage_type ENUM('QUALIFICATION','GROUP','SEMI_FINAL','FINAL') NOT NULL,
  sequence_no SMALLINT UNSIGNED NOT NULL,
  status ENUM('DRAFT','OPEN','COMPLETE') NOT NULL DEFAULT 'DRAFT',
  rule_type ENUM('TARGET','TOP_N','TARGET_OR_TOP_N','HIGHEST_AT_CLOSE') NOT NULL DEFAULT 'TARGET',
  target INT UNSIGNED NULL,
  advance_count SMALLINT UNSIGNED NULL,
  group_size SMALLINT UNSIGNED NULL,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_competition_stage_code(competition_id,code),
  UNIQUE KEY uq_competition_stage_sequence(competition_id,sequence_no),
  CONSTRAINT fk_cstage_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  INDEX ix_cstage_status(competition_id,status,sequence_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE competition_stage_choices (
  stage_id BIGINT UNSIGNED NOT NULL,
  choice_id BIGINT UNSIGNED NOT NULL,
  group_code VARCHAR(16) NULL,
  seed_no SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  entry_supporter_count INT UNSIGNED NOT NULL DEFAULT 0,
  final_supporter_count INT UNSIGNED NULL,
  result_status ENUM('ACTIVE','QUALIFIED','ELIMINATED','WINNER') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(stage_id,choice_id),
  CONSTRAINT fk_csc_stage FOREIGN KEY(stage_id) REFERENCES competition_stages(id),
  CONSTRAINT fk_csc_choice FOREIGN KEY(choice_id) REFERENCES competition_choices(id),
  INDEX ix_csc_group(stage_id,group_code,seed_no),
  INDEX ix_csc_result(stage_id,result_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE competition_stage_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  stage_id BIGINT UNSIGNED NULL,
  event_type ENUM('STAGE_OPENED','STAGE_CLOSED','CHOICES_ADVANCED','WINNER_CONFIRMED') NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cse_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  CONSTRAINT fk_cse_stage FOREIGN KEY(stage_id) REFERENCES competition_stages(id),
  INDEX ix_cse_competition_time(competition_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'QUALIFICATION','Round 1','QUALIFICATION',1,'OPEN','TARGET',1000,NULL,NULL
FROM competitions
WHERE slug='best-city-somalia'
  AND NOT EXISTS (
    SELECT 1 FROM competition_stages cs
    WHERE cs.competition_id=competitions.id AND cs.code='QUALIFICATION'
  );

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'GROUP','Group Round','GROUP',2,'DRAFT','TARGET_OR_TOP_N',2500,2,4
FROM competitions
WHERE slug='best-city-somalia'
  AND NOT EXISTS (
    SELECT 1 FROM competition_stages cs
    WHERE cs.competition_id=competitions.id AND cs.code='GROUP'
  );

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'SEMI_FINAL','Semi Final','SEMI_FINAL',3,'DRAFT','TOP_N',5000,2,NULL
FROM competitions
WHERE slug='best-city-somalia'
  AND NOT EXISTS (
    SELECT 1 FROM competition_stages cs
    WHERE cs.competition_id=competitions.id AND cs.code='SEMI_FINAL'
  );

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'FINAL','Final','FINAL',4,'DRAFT','HIGHEST_AT_CLOSE',10000,1,NULL
FROM competitions
WHERE slug='best-city-somalia'
  AND NOT EXISTS (
    SELECT 1 FROM competition_stages cs
    WHERE cs.competition_id=competitions.id AND cs.code='FINAL'
  );

INSERT INTO competition_stage_choices(stage_id,choice_id,seed_no,entry_supporter_count)
SELECT cs.id,cc.id,cc.sort_order,
  (SELECT COUNT(*) FROM competition_supporters sp WHERE sp.competition_id=cc.competition_id AND sp.choice_id=cc.id AND sp.status='ACTIVE')
FROM competition_stages cs
JOIN competition_choices cc ON cc.competition_id=cs.competition_id AND cc.status='ACTIVE'
JOIN competitions cp ON cp.id=cs.competition_id
WHERE cp.slug='best-city-somalia' AND cs.code='QUALIFICATION'
  AND NOT EXISTS (
    SELECT 1 FROM competition_stage_choices x
    WHERE x.stage_id=cs.id AND x.choice_id=cc.id
  );