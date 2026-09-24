import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const migrationsDir=path.resolve(__dirname,'../../../../database/migrations');

export async function migrateDatabase(){
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  const [rows]=await pool.query('SELECT filename FROM schema_migrations');
  const applied=new Set(rows.map(r=>r.filename));
  const files=(await fs.readdir(migrationsDir)).filter(f=>f.endsWith('.sql')).sort();

  for(const file of files){
    if(applied.has(file)) continue;
    const sql=await fs.readFile(path.join(migrationsDir,file),'utf8');
    const statements=sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean);
    console.log('[db] applying',file,'statements=',statements.length);
    for(const statement of statements){
      await pool.query(statement);
    }
    await pool.query('INSERT INTO schema_migrations(filename) VALUES (?)',[file]);
    console.log('[db] applied',file);
  }
}

export async function seedDatabase(){
  const cities=[
    ['Mogadishu','Somalia','MOG','PREMIER'],
    ['Hargeisa','Somalia','HAR','PREMIER'],
    ['Kismayo','Somalia','KIS','PREMIER'],
    ['Garowe','Somalia','GAR','PREMIER'],
    ['Bosaso','Somalia','BOS','PREMIER'],
    ['Baidoa','Somalia','BAI','PREMIER'],
    ['Beledweyne','Somalia','BLW','CHAMPIONSHIP'],
    ['Galkayo','Somalia','GAL','CHAMPIONSHIP'],
    ['Jowhar','Somalia','JOW','CHAMPIONSHIP'],
    ['Burco','Somalia','BUR','CHAMPIONSHIP']
  ];

  // Somali Cup is a Somalia-city competition. Retire any older diaspora demo cities.
  await pool.query('UPDATE cities SET is_active=0');
  for(const city of cities){
    await pool.query(
      'INSERT INTO cities(name,country,code,tier,is_active) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name),country=VALUES(country),tier=VALUES(tier),is_active=1',
      city
    );
  }

  await pool.query(
    "INSERT INTO seasons(id,name,status,starts_at) VALUES (1,'Somali Cup 2027','QUALIFICATION','2027-01-01') ON DUPLICATE KEY UPDATE name=VALUES(name),status='QUALIFICATION'"
  );

  const [all]=await pool.query('SELECT id,tier FROM cities WHERE is_active=1');
  for(const city of all){
    const target=city.tier==='PREMIER'?500:city.tier==='CHAMPIONSHIP'?300:150;
    await pool.query(
      `INSERT INTO season_cities(season_id,city_id,status,qualification_total,qualification_target,sort_order,is_open)
       VALUES (1,?,'QUALIFYING',0,?,100,1)
       ON DUPLICATE KEY UPDATE qualification_target=VALUES(qualification_target),is_open=1`,
      [city.id,target]
    );
  }

  const [fixtureCities]=await pool.query("SELECT id,code FROM cities WHERE is_active=1");
  const cityId=Object.fromEntries(fixtureCities.map(c=>[c.code,c.id]));
  const fixtures=[
    ['sc2027-mog-har-group-01','MOG','HAR','2027-06-12 09:30:00','2027-06-12 09:00:00'],
    ['sc2027-kis-gar-group-01','KIS','GAR','2027-06-12 10:00:00','2027-06-12 09:30:00'],
    ['sc2027-bos-bai-group-01','BOS','BAI','2027-06-12 10:30:00','2027-06-12 10:00:00'],
    ['sc2027-blw-gal-group-01','BLW','GAL','2027-06-12 11:00:00','2027-06-12 10:30:00'],
    ['sc2027-jow-bur-group-01','JOW','BUR','2027-06-12 11:30:00','2027-06-12 11:00:00']
  ];

  // Retire the old single demo fixture without deleting linked test history.
  await pool.query("UPDATE matches SET status='CANCELLED' WHERE public_id='sc2027mellondonqf000000001'");

  for(const [publicId,homeCode,awayCode,startsAt,lobbyOpensAt] of fixtures){
    if(!cityId[homeCode]||!cityId[awayCode]) continue;
    const regulationEndsAt=new Date(new Date(startsAt+'Z').getTime()+60*60*1000);
    await pool.query(
      `INSERT INTO matches(public_id,season_id,round_code,home_city_id,away_city_id,starts_at,regulation_ends_at,lobby_opens_at,status)
       VALUES (?,1,'GROUP',?,?,?,?,?,'SCHEDULED')
       ON DUPLICATE KEY UPDATE
         home_city_id=VALUES(home_city_id),
         away_city_id=VALUES(away_city_id),
         round_code=VALUES(round_code),
         starts_at=VALUES(starts_at),
         regulation_ends_at=COALESCE(regulation_ends_at,VALUES(regulation_ends_at)),
         lobby_opens_at=VALUES(lobby_opens_at)`,
      [publicId,cityId[homeCode],cityId[awayCode],startsAt,regulationEndsAt,lobbyOpensAt]
    );
  }

  console.log('[db] seed complete');
}

export async function bootstrapDatabase(){
  await migrateDatabase();
  await seedDatabase();
  const [[check]]=await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='seasons') seasons_table,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='matches') matches_table
  `);
  if(!Number(check.seasons_table)||!Number(check.matches_table)){
    throw new Error('database_bootstrap_incomplete');
  }
  console.log('[db] bootstrap verified');
}
