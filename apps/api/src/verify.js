import { pool } from './db/pool.js';
let ok=true;
async function check(name,fn){try{await fn();console.log('PASS',name)}catch(e){ok=false;console.error('FAIL',name,e.message)}}
await check('db_connection',()=>pool.query('SELECT 1'));
await check('identity_sessions_table',()=>pool.query('SELECT id FROM identity_sessions LIMIT 1'));
await check('qualification_columns',()=>pool.query('SELECT qualification_target,is_open FROM season_cities LIMIT 1'));
await check('verified_membership_columns',()=>pool.query('SELECT verification_status,verification_method FROM city_memberships LIMIT 1'));
await check('active_qualification_season',async()=>{const [[s]]=await pool.query("SELECT id FROM seasons WHERE status='QUALIFICATION' LIMIT 1");if(!s) throw new Error('seed required: no qualification season')});
await pool.end();
if(!ok) process.exit(1);
