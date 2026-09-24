import { pool } from './db/pool.js';
let ok=true;
async function check(name,fn){try{await fn();console.log('PASS',name)}catch(e){ok=false;console.error('FAIL',name,e.message)}}
await check('db_connection',()=>pool.query('SELECT 1'));
await check('identity_sessions_table',()=>pool.query('SELECT id FROM identity_sessions LIMIT 1'));
await check('qualification_columns',()=>pool.query('SELECT qualification_target,is_open FROM season_cities LIMIT 1'));
await check('verified_membership_columns',()=>pool.query('SELECT verification_status,verification_method,goal_number FROM city_memberships LIMIT 1'));
await check('goal_sequence_column',()=>pool.query('SELECT next_goal_number FROM season_cities LIMIT 1'));
await check('goal_numbers_complete',async()=>{
  const [[r]]=await pool.query(`SELECT COUNT(*) missing
    FROM city_memberships
    WHERE verification_status='VERIFIED' AND goal_number IS NULL`);
  if(Number(r.missing)>0) throw new Error(`${r.missing} verified memberships missing goal_number`);
});
await check('goal_numbers_unique',async()=>{
  const [[r]]=await pool.query(`SELECT COUNT(*) duplicate_groups FROM (
    SELECT season_id,city_id,goal_number
    FROM city_memberships
    WHERE goal_number IS NOT NULL
    GROUP BY season_id,city_id,goal_number
    HAVING COUNT(*)>1
  ) d`);
  if(Number(r.duplicate_groups)>0) throw new Error(`${r.duplicate_groups} duplicate Goal-number groups`);
});
await check('goal_sequence_ahead',async()=>{
  const [[r]]=await pool.query(`SELECT COUNT(*) bad_sequences FROM (
    SELECT sc.season_id,sc.city_id,sc.next_goal_number,COALESCE(MAX(cm.goal_number),0) max_goal
    FROM season_cities sc
    LEFT JOIN city_memberships cm
      ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id
      AND cm.verification_status='VERIFIED'
    GROUP BY sc.season_id,sc.city_id,sc.next_goal_number
    HAVING sc.next_goal_number<=COALESCE(MAX(cm.goal_number),0)
  ) q`);
  if(Number(r.bad_sequences)>0) throw new Error(`${r.bad_sequences} city Goal sequences are not ahead of assigned Goals`);
});
await check('active_qualification_season',async()=>{const [[s]]=await pool.query("SELECT id FROM seasons WHERE status='QUALIFICATION' LIMIT 1");if(!s) throw new Error('seed required: no qualification season')});
await check('match_engine_columns',()=>pool.query("SELECT public_id,lobby_opens_at,finalised_at,winner_city_id,score_version FROM matches LIMIT 1"));
await check('match_participation_state',()=>pool.query("SELECT status,activated_at,revoked_at FROM match_participations LIMIT 1"));
await check('match_assists_table',()=>pool.query("SELECT id FROM match_assists LIMIT 1"));
await check('match_state_events_table',()=>pool.query("SELECT id FROM match_state_events LIMIT 1"));
await check('funnel_analytics_table',()=>pool.query("SELECT event_name,created_at FROM funnel_events LIMIT 1"));
await check('season_device_claims_table',()=>pool.query("SELECT device_hash,last_seen_at FROM season_device_claims LIMIT 1"));
await check('identity_integrity_events_table',()=>pool.query("SELECT event_type,created_at FROM identity_integrity_events LIMIT 1"));
await pool.end();
if(!ok) process.exit(1);
