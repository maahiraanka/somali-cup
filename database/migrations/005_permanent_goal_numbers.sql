ALTER TABLE season_cities
  ADD COLUMN next_goal_number INT UNSIGNED NOT NULL DEFAULT 1 AFTER is_open;

ALTER TABLE city_memberships
  ADD COLUMN goal_number INT UNSIGNED NULL AFTER verified_at,
  ADD UNIQUE KEY uq_city_goal_number(season_id,city_id,goal_number);

UPDATE city_memberships cm
JOIN (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY season_id,city_id
           ORDER BY joined_at ASC,id ASC
         ) AS goal_no
  FROM city_memberships
  WHERE verification_status='VERIFIED'
) ranked ON ranked.id=cm.id
SET cm.goal_number=ranked.goal_no
WHERE cm.goal_number IS NULL;

UPDATE season_cities sc
LEFT JOIN (
  SELECT season_id,city_id,COALESCE(MAX(goal_number),0)+1 AS next_no
  FROM city_memberships
  WHERE verification_status='VERIFIED'
  GROUP BY season_id,city_id
) totals
  ON totals.season_id=sc.season_id AND totals.city_id=sc.city_id
SET sc.next_goal_number=COALESCE(totals.next_no,1);
