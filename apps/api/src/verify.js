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
await check('tournament_stages_table',()=>pool.query("SELECT code,stage_type,status FROM tournament_stages LIMIT 1"));
await check('tournament_groups_table',()=>pool.query("SELECT code,name FROM tournament_groups LIMIT 1"));
await check('tournament_advancement_slots_table',()=>pool.query("SELECT target_stage_id,target_match_no,target_slot,source_type FROM tournament_advancement_slots LIMIT 1"));
await check('tournament_events_table',()=>pool.query("SELECT event_type,created_at FROM tournament_events LIMIT 1"));
await check('competitions_table',()=>pool.query("SELECT slug,competition_type,choice_type,language_preset,status FROM competitions LIMIT 1"));
await check('competition_choices_table',()=>pool.query("SELECT competition_id,name,code,choice_type,status FROM competition_choices LIMIT 1"));
await check('competition_nominations_table',()=>pool.query("SELECT competition_id,name,status FROM competition_nominations LIMIT 1"));
await check('competition_supporters_table',()=>pool.query("SELECT competition_id,choice_id,user_id,supporter_no FROM competition_supporters LIMIT 1"));
await check('competition_device_claims_table',()=>pool.query("SELECT competition_id,user_id,device_hash FROM competition_device_claims LIMIT 1"));
await check('competition_referrals_table',()=>pool.query("SELECT competition_id,choice_id,referrer_user_id,referred_user_id FROM competition_referrals LIMIT 1"));
await check('competition_stages_table',()=>pool.query("SELECT competition_id,code,stage_type,status,rule_type,target,advance_count FROM competition_stages LIMIT 1"));
await check('competition_stage_choices_table',()=>pool.query("SELECT stage_id,choice_id,result_status,entry_supporter_count FROM competition_stage_choices LIMIT 1"));
await check('competition_stage_events_table',()=>pool.query("SELECT competition_id,stage_id,event_type FROM competition_stage_events LIMIT 1"));
await check('competition_creator_schema_ready',async()=>{
  await pool.query("SELECT id,slug,status FROM competitions LIMIT 1");
  await pool.query("SELECT id,competition_id,code FROM competition_choices LIMIT 1");
  await pool.query("SELECT id,competition_id,sequence_no,status FROM competition_stages LIMIT 1");
  await pool.query("SELECT stage_id,choice_id FROM competition_stage_choices LIMIT 1");
});
await check('public_content_empty_migration_applied',async()=>{
  const [[r]]=await pool.query("SELECT filename FROM schema_migrations WHERE filename='023_empty_public_data.sql' LIMIT 1");
  if(!r)throw new Error('empty public data migration not applied');
});
await check('public_content_is_empty',async()=>{
  const [[r]]=await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM cities) cities,
      (SELECT COUNT(*) FROM city_memberships) supporters,
      (SELECT COUNT(*) FROM matches) matches,
      (SELECT COUNT(*) FROM competitions) competitions,
      (SELECT COUNT(*) FROM competition_choices) choices
  `);
  const nonZero=Object.entries(r||{}).filter(([,v])=>Number(v)!==0);
  if(nonZero.length)throw new Error('expected empty public content: '+nonZero.map(([k,v])=>k+'='+v).join(','));
});
await check('match_lifecycle_columns',()=>pool.query("SELECT regulation_ends_at,tiebreak_mode,tiebreak_started_at FROM matches LIMIT 1"));
await check('tournament_stage_rules',()=>pool.query("SELECT tie_policy,match_duration_minutes FROM tournament_stages LIMIT 1"));
await check('admin_credentials_table',()=>pool.query("SELECT user_id,password_updated_at FROM admin_credentials LIMIT 1"));
await check('admin_sessions_table',()=>pool.query("SELECT user_id,expires_at FROM admin_sessions LIMIT 1"));
await check('competition_awards_table',()=>pool.query("SELECT season_id,award_type,status FROM competition_awards LIMIT 1"));
await check('launch_acceptance_runs_table',()=>pool.query("SELECT run_type,status,created_at FROM launch_acceptance_runs LIMIT 1"));
await check('public_launch_mode_setting',async()=>{
  const [[r]]=await pool.query("SELECT setting_value FROM platform_settings WHERE setting_key='PUBLIC_LAUNCH_MODE' LIMIT 1");
  if(!r||!['COMING_SOON','LIVE'].includes(r.setting_value))throw new Error('PUBLIC_LAUNCH_MODE missing or invalid');
});
await pool.end();
if(!ok) process.exit(1);
