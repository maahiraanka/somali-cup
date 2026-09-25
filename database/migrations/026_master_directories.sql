CREATE TABLE master_directory_entries (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  entity_type VARCHAR(30) NOT NULL,
  name VARCHAR(140) NOT NULL,
  short_name VARCHAR(100) NULL,
  code VARCHAR(24) NOT NULL,
  country VARCHAR(120) NULL,
  region VARCHAR(120) NULL,
  category VARCHAR(120) NULL,
  aliases_json JSON NULL,
  image_url VARCHAR(500) NULL,
  metadata_json JSON NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_master_directory_type_code(entity_type,code),
  INDEX ix_master_directory_type_active(entity_type,is_active),
  INDEX ix_master_directory_name(entity_type,name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE competition_choices
  ADD COLUMN master_entry_id BIGINT UNSIGNED NULL AFTER legacy_city_id,
  ADD UNIQUE KEY uq_competition_master_entry(competition_id,master_entry_id),
  ADD INDEX ix_competition_choice_master(master_entry_id),
  ADD CONSTRAINT fk_competition_choice_master
    FOREIGN KEY(master_entry_id) REFERENCES master_directory_entries(id);
