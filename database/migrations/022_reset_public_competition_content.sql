DELETE FROM competition_stage_events;
DELETE FROM competition_stage_choices;
DELETE FROM competition_stages;
DELETE FROM competition_referrals;
DELETE FROM competition_device_claims;
DELETE FROM competition_supporters;
DELETE FROM competition_nominations;
DELETE FROM competition_choices;
DELETE FROM competitions;

INSERT INTO competitions(
  slug,name,short_name,competition_type,choice_type,language_preset,status,
  allow_nominations,starts_at,ends_at,legacy_season_id
)
SELECT
  'somali-cup',s.name,'Somali Cup','STAGED','CITY','CUP',
  CASE WHEN s.status='COMPLETE' THEN 'COMPLETE' ELSE 'LIVE' END,
  0,s.starts_at,s.ends_at,s.id
FROM seasons s
WHERE s.id=(SELECT id FROM seasons ORDER BY id DESC LIMIT 1);

INSERT INTO competition_choices(
  competition_id,name,short_name,code,choice_type,legacy_city_id,status,target,sort_order,metadata_json
)
SELECT cp.id,c.name,c.name,c.code,'CITY',c.id,
  CASE WHEN sc.status='CHAMPION' THEN 'WINNER' WHEN sc.status='ELIMINATED' THEN 'ELIMINATED' ELSE 'ACTIVE' END,
  sc.qualification_target,sc.sort_order,
  JSON_OBJECT('country',c.country,'tier',c.tier)
FROM competitions cp
JOIN season_cities sc ON sc.season_id=cp.legacy_season_id
JOIN cities c ON c.id=sc.city_id
WHERE cp.slug='somali-cup' AND c.is_active=1;

INSERT INTO competitions(
  slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations
)
VALUES ('best-city-somalia','Best City in Somalia','Best City','STAGED','CITY','CITY','LIVE',1);

INSERT INTO competition_choices(
  competition_id,name,short_name,code,choice_type,legacy_city_id,status,target,next_supporter_no,sort_order,metadata_json
)
SELECT cp.id,c.name,c.name,c.code,'CITY',c.id,'ACTIVE',1000,1,c.id,
  JSON_OBJECT('country',c.country,'tier',c.tier)
FROM competitions cp
JOIN cities c ON c.is_active=1
WHERE cp.slug='best-city-somalia';

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size,starts_at
)
SELECT id,'QUALIFICATION','Round 1','QUALIFICATION',1,'OPEN','TARGET',1000,NULL,NULL,UTC_TIMESTAMP()
FROM competitions WHERE slug='best-city-somalia';

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'GROUP','Group Round','GROUP',2,'DRAFT','TARGET_OR_TOP_N',2500,2,4
FROM competitions WHERE slug='best-city-somalia';

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'SEMI_FINAL','Semi Final','SEMI_FINAL',3,'DRAFT','TOP_N',NULL,2,NULL
FROM competitions WHERE slug='best-city-somalia';

INSERT INTO competition_stages(
  competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size
)
SELECT id,'FINAL','Final','FINAL',4,'DRAFT','HIGHEST_AT_CLOSE',NULL,1,NULL
FROM competitions WHERE slug='best-city-somalia';

INSERT INTO competition_stage_choices(stage_id,choice_id,seed_no,entry_supporter_count)
SELECT cs.id,cc.id,cc.sort_order,0
FROM competition_stages cs
JOIN competitions cp ON cp.id=cs.competition_id
JOIN competition_choices cc ON cc.competition_id=cp.id AND cc.status='ACTIVE'
WHERE cp.slug='best-city-somalia' AND cs.code='QUALIFICATION';

INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json)
SELECT cp.id,cs.id,'STAGE_OPENED',JSON_OBJECT('resetToDefaults',TRUE,'source','migration_022')
FROM competitions cp
JOIN competition_stages cs ON cs.competition_id=cp.id AND cs.code='QUALIFICATION'
WHERE cp.slug='best-city-somalia';