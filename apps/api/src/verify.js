import { pool } from './db/pool.js';
let ok=true;
async function check(name,fn){try{await fn();console.log('PASS',name)}catch(e){ok=false;console.error('FAIL',name,e.message)}}
await check('db_connection',()=>pool.query('SELECT 1'));
await check('identity_sessions_table',()=>pool.query('SELECT id FROM identity_sessions LIMIT 1'));
await check('qualification_columns',()=>pool.query('SELECT qualification_target,is_open FROM season_cities LIMIT 1'));
await check('verified_membership_columns',()=>pool.query('SELECT verification_status,verification_method FROM city_memberships LIMIT 1'));
await check('active_qualification_season',async()=>{const [[s]]=await pool.query("SELECT id FROM seasons WHERE status='QUALIFICATION' LIMIT 1");if(!s) throw new Error('seed required: no qualification season')});
await pool.end();
await check('match_engine_columns',()=>pool.query("SELECT public_id,lobby_opens_at,finalised_at,winner_city_id,score_version FROM matches LIMIT 1"));
await check('match_participation_state',()=>pool.query("SELECT status,activated_at,revoked_at FROM match_participations LIMIT 1"));
await check('match_assists_table',()=>pool.query("SELECT id FROM match_assists LIMIT 1"));
await check('match_state_events_table',()=>pool.query("SELECT id FROM match_state_events LIMIT 1"));
if(!ok) process.exit(1);
