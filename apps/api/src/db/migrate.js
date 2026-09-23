import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const dir=path.resolve(__dirname,'../../../../database/migrations');
await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
const [rows]=await pool.query('SELECT filename FROM schema_migrations');
const done=new Set(rows.map(r=>r.filename));
for(const file of (await fs.readdir(dir)).filter(f=>f.endsWith('.sql')).sort()){
  if(done.has(file)) continue;
  const sql=await fs.readFile(path.join(dir,file),'utf8');
  const conn=await pool.getConnection();
  try{await conn.beginTransaction(); for(const stmt of sql.split(/;\s*(?:\n|$)/).map(s=>s.trim()).filter(Boolean)) await conn.query(stmt); await conn.query('INSERT INTO schema_migrations(filename) VALUES (?)',[file]); await conn.commit(); console.log('applied',file);}catch(e){await conn.rollback(); throw e;}finally{conn.release();}
}
await pool.end();
