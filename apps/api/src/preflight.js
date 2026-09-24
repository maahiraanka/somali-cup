import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import { config } from './config.js';
import { recordLaunchEvidence } from './launchEvidence.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const migrationsDir=path.resolve(__dirname,'../../../database/migrations');
let failures=0;
let warnings=0;

const pass=(name,detail='')=>console.log('PASS',name,detail);
const warn=(name,detail='')=>{warnings++;console.warn('WARN',name,detail)};
const fail=(name,detail='')=>{failures++;console.error('FAIL',name,detail)};

async function check(name,fn,{warning=false}={}){
  try{
    const detail=await fn();
    pass(name,detail||'');
  }catch(e){
    warning?warn(name,e.message):fail(name,e.message);
  }
}

await check('node_22_plus',()=>{
  const major=Number(process.versions.node.split('.')[0]);
  if(major<22)throw new Error('Node '+process.versions.node+' found; Node 22+ required');
  return process.versions.node;
});

await check('production_mode',()=>{
  if(config.env!=='production')throw new Error('NODE_ENV='+config.env+'; expected production');
  return config.env;
});

await check('https_app_origin',()=>{
  const u=new URL(config.appOrigin);
  if(u.protocol!=='https:')throw new Error('APP_ORIGIN must use https');
  return u.origin;
});

await check('session_secret_strength',()=>{
  const v=String(process.env.SESSION_SECRET||'');
  if(v.length<32)throw new Error('SESSION_SECRET must be at least 32 characters');
  return 'configured';
});

await check('integrity_secret_strength',()=>{
  const v=String(process.env.INTEGRITY_SECRET||'');
  if(v.length<32)throw new Error('INTEGRITY_SECRET must be separate and at least 32 characters');
  return 'configured';
});

await check('database_connection',async()=>{
  const [[r]]=await pool.query('SELECT DATABASE() db');
  if(!r?.db)throw new Error('no active database selected');
  return r.db;
});

await check('mysql_8_plus',async()=>{
  const [[r]]=await pool.query('SELECT VERSION() version');
  const raw=String(r.version||'');
  const match=raw.match(/^(\d+)\.(\d+)/);
  if(!match)throw new Error('could not parse MySQL version '+raw);
  const major=Number(match[1]),minor=Number(match[2]);
  if(major<8)throw new Error(raw+' found; MySQL 8+ required for window functions and recursive CTEs');
  return raw;
});

await check('all_migrations_applied',async()=>{
  const files=(await fs.readdir(migrationsDir)).filter(f=>f.endsWith('.sql')).sort();
  const [rows]=await pool.query('SELECT filename FROM schema_migrations');
  const applied=new Set(rows.map(r=>r.filename));
  const missing=files.filter(f=>!applied.has(f));
  if(missing.length)throw new Error('missing: '+missing.join(', '));
  return files.length+' migrations';
});

await check('somalia_only_active_cities',async()=>{
  const [[r]]=await pool.query(`
    SELECT COUNT(*) total,
      SUM(country='Somalia') somalia,
      SUM(country<>'Somalia') non_somalia
    FROM cities WHERE is_active=1
  `);
  if(Number(r.total)!==10)throw new Error('expected 10 active launch cities; found '+Number(r.total));
  if(Number(r.non_somalia||0)>0)throw new Error(Number(r.non_somalia)+' active non-Somalia cities found');
  return '10 active Somalia cities';
});

await check('active_season',async()=>{
  const [[r]]=await pool.query("SELECT id,name,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL') ORDER BY id DESC LIMIT 1");
  if(!r)throw new Error('no active competition season');
  return r.name+' · '+r.status;
});

await check('verified_goal_numbers_complete',async()=>{
  const [[r]]=await pool.query(`
    SELECT COUNT(*) missing FROM city_memberships
    WHERE verification_status='VERIFIED' AND goal_number IS NULL
  `);
  if(Number(r.missing)>0)throw new Error(r.missing+' verified memberships missing Goal numbers');
  return 'complete';
});

await check('verified_goal_numbers_unique',async()=>{
  const [[r]]=await pool.query(`
    SELECT COUNT(*) duplicate_groups FROM (
      SELECT season_id,city_id,goal_number
      FROM city_memberships
      WHERE goal_number IS NOT NULL
      GROUP BY season_id,city_id,goal_number
      HAVING COUNT(*)>1
    ) x
  `);
  if(Number(r.duplicate_groups)>0)throw new Error(r.duplicate_groups+' duplicate Goal-number groups');
  return 'unique';
});

await check('goal_sequences_ahead',async()=>{
  const [[r]]=await pool.query(`
    SELECT COUNT(*) bad FROM (
      SELECT sc.season_id,sc.city_id,sc.next_goal_number,COALESCE(MAX(cm.goal_number),0) max_goal
      FROM season_cities sc
      LEFT JOIN city_memberships cm
        ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id
        AND cm.verification_status='VERIFIED'
      GROUP BY sc.season_id,sc.city_id,sc.next_goal_number
      HAVING sc.next_goal_number<=COALESCE(MAX(cm.goal_number),0)
    ) x
  `);
  if(Number(r.bad)>0)throw new Error(r.bad+' city sequences are behind assigned Goals');
  return 'healthy';
});

await check('match_state_time_consistency',async()=>{
  const [[r]]=await pool.query(`
    SELECT
      SUM(status='LOBBY' AND lobby_opens_at>UTC_TIMESTAMP()) early_lobby,
      SUM(status='LIVE' AND starts_at>UTC_TIMESTAMP()) early_live
    FROM matches
    WHERE status IN ('SCHEDULED','LOBBY','LIVE')
  `);
  const earlyLobby=Number(r.early_lobby||0),earlyLive=Number(r.early_live||0);
  if(earlyLobby||earlyLive)throw new Error('early lobby='+earlyLobby+', early live='+earlyLive);
  return 'consistent';
});

await check('regulation_windows_present',async()=>{
  const [[r]]=await pool.query(`
    SELECT COUNT(*) missing
    FROM matches
    WHERE status IN ('SCHEDULED','LOBBY','LIVE')
      AND regulation_ends_at IS NULL
  `);
  if(Number(r.missing)>0)throw new Error(r.missing+' active/upcoming matches missing regulation_ends_at');
  return 'complete';
});

await check('admin_account_created',async()=>{
  const [[r]]=await pool.query('SELECT COUNT(*) total FROM admin_credentials');
  if(Number(r.total)<1)throw new Error('no admin account yet; open /admin and complete First-time setup');
  return r.total+' admin credential record(s)';
},{warning:true});

await check('device_binding_coverage',async()=>{
  const [[r]]=await pool.query(`
    SELECT
      COUNT(*) verified,
      SUM(EXISTS(
        SELECT 1 FROM season_device_claims sdc
        WHERE sdc.season_id=cm.season_id AND sdc.user_id=cm.user_id
      )) device_bound
    FROM city_memberships cm
    WHERE cm.verification_status='VERIFIED' AND cm.status='ACTIVE'
  `);
  const verified=Number(r.verified||0),bound=Number(r.device_bound||0);
  if(verified&&bound<verified)throw new Error((verified-bound)+' verified supporter(s) are session-only legacy identities');
  return bound+'/'+verified+' device-bound';
},{warning:true});

console.log('\nPRELAUNCH SUMMARY',JSON.stringify({failures,warnings}));
await recordLaunchEvidence({
  runType:'PREFLIGHT',
  status:failures>0?'FAIL':'PASS',
  failures,warnings,
  origin:config.appOrigin,
  evidence:{node:process.versions.node,environment:config.env}
});
await pool.end();
if(failures>0)process.exit(1);
