CREATE TABLE competition_supporters (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  choice_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  supporter_no INT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','SUSPENDED','REMOVED') NOT NULL DEFAULT 'ACTIVE',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_competition_supporter(competition_id,user_id),
  UNIQUE KEY uq_competition_choice_number(competition_id,choice_id,supporter_no),
  CONSTRAINT fk_cs_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  CONSTRAINT fk_cs_choice FOREIGN KEY(choice_id) REFERENCES competition_choices(id),
  CONSTRAINT fk_cs_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_cs_choice(competition_id,choice_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE competition_choices
  ADD COLUMN next_supporter_no INT UNSIGNED NOT NULL DEFAULT 1 AFTER target;

CREATE TABLE competition_device_claims (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  device_hash CHAR(64) NOT NULL,
  first_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_competition_device(competition_id,device_hash),
  UNIQUE KEY uq_competition_user_device(competition_id,user_id,device_hash),
  CONSTRAINT fk_cdc_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  CONSTRAINT fk_cdc_user FOREIGN KEY(user_id) REFERENCES users(id),
  INDEX ix_cdc_user(user_id,last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE competition_referrals (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  competition_id BIGINT UNSIGNED NOT NULL,
  choice_id BIGINT UNSIGNED NOT NULL,
  referrer_user_id BIGINT UNSIGNED NOT NULL,
  referred_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_competition_referred(competition_id,referred_user_id),
  CONSTRAINT fk_cr_competition FOREIGN KEY(competition_id) REFERENCES competitions(id),
  CONSTRAINT fk_cr_choice FOREIGN KEY(choice_id) REFERENCES competition_choices(id),
  CONSTRAINT fk_cr_referrer FOREIGN KEY(referrer_user_id) REFERENCES users(id),
  CONSTRAINT fk_cr_referred FOREIGN KEY(referred_user_id) REFERENCES users(id),
  INDEX ix_cr_referrer(competition_id,referrer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO competitions(slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations)
SELECT 'best-city-somalia','Best City in Somalia','Best City','STAGED','CITY','CITY','LIVE',1
WHERE NOT EXISTS (SELECT 1 FROM competitions WHERE slug='best-city-somalia');

INSERT INTO competition_choices(competition_id,name,short_name,code,choice_type,legacy_city_id,status,target,sort_order,metadata_json)
SELECT cp.id,c.name,c.name,c.code,'CITY',c.id,'ACTIVE',1000,
  ROW_NUMBER() OVER (ORDER BY c.name),
  JSON_OBJECT('country',c.country,'tier',c.tier)
FROM competitions cp
JOIN cities c ON c.is_active=1
WHERE cp.slug='best-city-somalia'
  AND NOT EXISTS (
    SELECT 1 FROM competition_choices cc
    WHERE cc.competition_id=cp.id AND cc.legacy_city_id=c.id
  );