import { pool } from './pool.js';
const cities=[
  ['Melbourne','Australia','MEL','PREMIER'],['London','United Kingdom','LON','PREMIER'],['Toronto','Canada','TOR','PREMIER'],['Nairobi','Kenya','NAI','PREMIER'],
  ['Minneapolis','United States','MIN','PREMIER'],['Mogadishu','Somalia','MOG','PREMIER'],['Stockholm','Sweden','STO','CHAMPIONSHIP'],['Hargeisa','Somalia','HAR','CHAMPIONSHIP'],
  ['Perth','Australia','PER','CHAMPIONSHIP'],['Birmingham','United Kingdom','BHM','CHAMPIONSHIP'],['Dubai','United Arab Emirates','DXB','CHAMPIONSHIP'],['Oslo','Norway','OSL','CHAMPIONSHIP']
];
for(const c of cities) await pool.query('INSERT INTO cities(name,country,code,tier,is_active) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),country=VALUES(country),tier=VALUES(tier),is_active=1',c);
await pool.query("INSERT INTO seasons(id,name,status,starts_at) VALUES (1,'Somali Cup 2027','QUALIFICATION','2027-01-01') ON DUPLICATE KEY UPDATE name=VALUES(name),status='QUALIFICATION'");
const [all]=await pool.query('SELECT id,tier FROM cities WHERE is_active=1');
for(const city of all){const target=city.tier==='PREMIER'?500:city.tier==='CHAMPIONSHIP'?300:150;await pool.query(`INSERT INTO season_cities(season_id,city_id,status,qualification_total,qualification_target,sort_order,is_open) VALUES (1,?,'QUALIFYING',0,?,100,1) ON DUPLICATE KEY UPDATE qualification_target=VALUES(qualification_target),is_open=1`,[city.id,target]);}

const [[mel]]=await pool.query("SELECT id FROM cities WHERE code='MEL' LIMIT 1");
const [[lon]]=await pool.query("SELECT id FROM cities WHERE code='LON' LIMIT 1");
if(mel&&lon){
  await pool.query(`
    INSERT INTO matches(public_id,season_id,round_code,home_city_id,away_city_id,starts_at,lobby_opens_at,status)
    VALUES ('sc2027mellondonqf000000001',1,'QUARTERFINAL',?,?, '2027-06-12 09:30:00','2027-06-12 09:00:00','LOBBY')
    ON DUPLICATE KEY UPDATE home_city_id=VALUES(home_city_id),away_city_id=VALUES(away_city_id),round_code=VALUES(round_code)`,
    [mel.id,lon.id]
  );
}
await pool.end(); console.log('seeded Somali Cup v0.3 qualification + demo match');

