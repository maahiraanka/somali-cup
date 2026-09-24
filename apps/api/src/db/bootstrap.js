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
    ['Melbourne','Australia','MEL','PREMIER'],['London','United Kingdom','LON','PREMIER'],['Toronto','Canada','TOR','PREMIER'],['Nairobi','Kenya','NAI','PREMIER'],
    ['Minneapolis','United States','MIN','PREMIER'],['Mogadishu','Somalia','MOG','PREMIER'],['Stockholm','Sweden','STO','CHAMPIONSHIP'],['Hargeisa','Somalia','HAR','CHAMPIONSHIP'],
    ['Perth','Australia','PER','CHAMPIONSHIP'],['Birmingham','United Kingdom','BHM','CHAMPIONSHIP'],['Dubai','United Arab Emirates','DXB','CHAMPIONSHIP'],['Oslo','Norway','OSL','CHAMPIONSHIP']
  ];

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

  const [[mel]]=await pool.query("SELECT id FROM cities WHERE code='MEL' LIMIT 1");
  const [[lon]]=await pool.query("SELECT id FROM cities WHERE code='LON' LIMIT 1");
  if(mel&&lon){
    await pool.query(
      `INSERT INTO matches(public_id,season_id,round_code,home_city_id,away_city_id,starts_at,lobby_opens_at,status)
       VALUES ('sc2027mellondonqf000000001',1,'QUARTERFINAL',?,?, '2027-06-12 09:30:00','2027-06-12 09:00:00','LOBBY')
       ON DUPLICATE KEY UPDATE home_city_id=VALUES(home_city_id),away_city_id=VALUES(away_city_id),round_code=VALUES(round_code)`,
      [mel.id,lon.id]
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
