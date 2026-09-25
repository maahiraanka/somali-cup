INSERT INTO cities(name,country,region,code,tier,aliases_json,image_url,is_active)
VALUES
('Mogadishu','Somalia','Banaadir','MOG','PREMIER',JSON_ARRAY('Muqdisho','Xamar'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Mogadishu%20Skyline%2017th%20picture.jpg',1),
('Hargeisa','Somalia','Maroodi Jeex','HAR','PREMIER',JSON_ARRAY('Hargeysa'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Hargeysa%20plane%20monument.jpg',1),
('Bosaso','Somalia','Bari','BOS','PREMIER',JSON_ARRAY('Boosaaso','Bossaso'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Bosaso%20Seaport.jpg',1),
('Kismayo','Somalia','Lower Juba','KIS','PREMIER',JSON_ARRAY('Kismaayo'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Aerial%20views%20of%20Kismayo%2005%20%288071373584%29.jpg',1),
('Baidoa','Somalia','Bay','BDO','PREMIER',JSON_ARRAY('Baydhabo'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Baidoa%20Market.jpg',1),
('Galkayo','Somalia','Mudug','GLK','PREMIER',JSON_ARRAY('Gaalkacyo'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Gaalkacyo.jpg',1),
('Garowe','Somalia','Nugaal','GAR','PREMIER',JSON_ARRAY('Garoowe'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/From%20the%20Heart%20of%20Garowe-%20A%20Panoramic%20View%20of%20Puntland%E2%80%99s%20Capital.png',1),
('Berbera','Somalia','Sahil','BER','PREMIER',JSON_ARRAY(),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Port%20de%20Berbera.jpg',1),
('Burao','Somalia','Togdheer','BUR','PREMIER',JSON_ARRAY('Burco'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Burao%20city%2C%20Somaliland.jpg',1),
('Beledweyne','Somalia','Hiraan','BLW','PREMIER',JSON_ARRAY('Belet Weyne','Beled Weyne'),'https://commons.wikimedia.org/wiki/Special:Redirect/file/Beledweyne%2001.jpg',1)
ON DUPLICATE KEY UPDATE
  country=VALUES(country),
  region=VALUES(region),
  tier=VALUES(tier),
  aliases_json=VALUES(aliases_json),
  image_url=VALUES(image_url),
  is_active=1;
