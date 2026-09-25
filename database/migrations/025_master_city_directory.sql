ALTER TABLE cities
  ADD COLUMN region VARCHAR(120) NULL AFTER country,
  ADD COLUMN aliases_json JSON NULL AFTER tier,
  ADD COLUMN image_url VARCHAR(500) NULL AFTER aliases_json,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD INDEX ix_cities_country_active(country,is_active),
  ADD INDEX ix_cities_region(region);

UPDATE cities
SET region=NULL,
    aliases_json=JSON_ARRAY()
WHERE aliases_json IS NULL;
