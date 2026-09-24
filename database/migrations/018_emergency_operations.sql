INSERT INTO platform_settings(setting_key,setting_value)
VALUES
  ('JOIN_OPERATIONS_MODE','OPEN'),
  ('MATCH_OPERATIONS_MODE','OPEN')
ON DUPLICATE KEY UPDATE setting_value=setting_value;
