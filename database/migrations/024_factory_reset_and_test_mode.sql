ALTER TABLE users
  ADD COLUMN is_test TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
  ADD INDEX ix_users_test_role(is_test,role);

ALTER TABLE competitions
  ADD COLUMN is_test TINYINT(1) NOT NULL DEFAULT 0 AFTER allow_nominations,
  ADD INDEX ix_competitions_test_status(is_test,status);

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

UPDATE audit_log al
JOIN users u ON u.id=al.actor_user_id
SET al.actor_user_id=NULL
WHERE u.role<>'ADMIN';

UPDATE platform_settings ps
JOIN users u ON u.id=ps.updated_by_user_id
SET ps.updated_by_user_id=NULL
WHERE u.role<>'ADMIN';

DELETE s FROM identity_sessions s
JOIN users u ON u.id=s.user_id
WHERE u.role<>'ADMIN';

UPDATE users SET home_city_id=NULL WHERE home_city_id IS NOT NULL;
DELETE FROM cities;

DELETE FROM users WHERE role<>'ADMIN';

DELETE FROM seasons;
INSERT INTO seasons(id,name,status,starts_at,ends_at)
VALUES (1,'Somali Cup','QUALIFICATION',NULL,NULL);
