ALTER TABLE competition_awards
  ADD COLUMN award_scope_key VARCHAR(140)
    GENERATED ALWAYS AS (
      CONCAT(season_id,':',award_type,':',COALESCE(match_id,0))
    ) STORED,
  ADD UNIQUE KEY uq_competition_award_scope(award_scope_key);
