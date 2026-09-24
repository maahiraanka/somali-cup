ALTER TABLE tournament_advancement_slots
  MODIFY COLUMN source_type ENUM('GROUP_RANK','MATCH_WINNER','STAGE_MATCH_WINNER') NOT NULL,
  ADD COLUMN source_stage_id BIGINT UNSIGNED NULL AFTER source_group_id,
  ADD COLUMN source_match_no SMALLINT UNSIGNED NULL AFTER source_stage_id,
  ADD CONSTRAINT fk_tas_source_stage FOREIGN KEY(source_stage_id) REFERENCES tournament_stages(id),
  ADD INDEX ix_tas_stage_match_source(source_stage_id,source_match_no);
