ALTER TABLE tournament_advancement_slots
  ADD COLUMN target_starts_at DATETIME NULL AFTER target_slot,
  ADD COLUMN target_lobby_opens_at DATETIME NULL AFTER target_starts_at;
