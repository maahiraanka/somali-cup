-- One-time cleanup moved out of runtime seed logic.
UPDATE cities
SET is_active=0
WHERE country<>'Somalia';

UPDATE matches
SET status='CANCELLED'
WHERE public_id='sc2027mellondonqf000000001'
  AND status NOT IN ('FINAL','CANCELLED');
