DELETE FROM competition_stage_events;
DELETE FROM competition_stage_choices;
DELETE FROM competition_stages;
DELETE FROM competition_referrals;
DELETE FROM competition_device_claims;
DELETE FROM competition_supporters;
DELETE FROM competition_nominations;
DELETE FROM competition_choices;
DELETE FROM competitions;

DELETE FROM competition_awards;
DELETE FROM funnel_events;
DELETE FROM awards;
DELETE FROM scoring_events;
DELETE FROM match_assists;
DELETE FROM match_state_events;
UPDATE match_participations SET parent_participation_id=NULL WHERE parent_participation_id IS NOT NULL;
DELETE FROM match_participations;
DELETE FROM tournament_advancement_slots;
DELETE FROM matches;
DELETE FROM tournament_group_cities;
DELETE FROM tournament_groups;
DELETE FROM tournament_events;
DELETE FROM tournament_stages;

DELETE FROM qualification_referrals;
DELETE FROM qualification_events;
DELETE FROM city_memberships;
DELETE FROM season_cities;
DELETE FROM season_device_claims;
DELETE FROM identity_integrity_events;
DELETE FROM moderation_cases;

UPDATE users SET home_city_id=NULL WHERE home_city_id IS NOT NULL;
DELETE FROM cities;
