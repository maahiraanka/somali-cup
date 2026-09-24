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
    const conn=await pool.getConnection();
    try{
      await conn.beginTransaction();
      for(const statement of statements)await conn.query(statement);
      await conn.query('INSERT INTO schema_migrations(filename) VALUES (?)',[file]);
      await conn.commit();
      console.log('[db] applied',file);
    }catch(e){
      await conn.rollback();
      throw e;
    }finally{
      conn.release();
    }
  }
}

export async function seedDatabase(){
  // Production runtime must never recreate demo/public content.
  // Public content is created intentionally from Admin.
  await pool.query(
    "INSERT IGNORE INTO seasons(id,name,status,starts_at) VALUES (1,'Somali Cup','QUALIFICATION',NULL)"
  );
  console.log('[db] empty runtime seed complete');
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
