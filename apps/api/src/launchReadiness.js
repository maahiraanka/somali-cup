import { pool } from './db/pool.js';
import { config } from './config.js';

const fmt=n=>Number(n||0).toLocaleString();

export async function getLaunchReadiness(){
  const checks=[];
  const add=(id,label,status,detail,category='CORE')=>checks.push({id,label,status,detail,category});

  add('production_mode','Production mode',config.env==='production'?'PASS':'BLOCKER',config.env==='production'?'NODE_ENV=production':'NODE_ENV='+config.env,'ENVIRONMENT');
  let https=false;
  try{https=new URL(config.appOrigin).protocol==='https:'}catch{}
  add('https_origin','HTTPS application origin',https?'PASS':'BLOCKER',config.appOrigin||'APP_ORIGIN missing','ENVIRONMENT');

  const sessionSecret=String(process.env.SESSION_SECRET||'');
  const integritySecret=String(process.env.INTEGRITY_SECRET||'');
  add('session_secret','Session secret',sessionSecret.length>=32?'PASS':'BLOCKER',sessionSecret.length>=32?'32+ characters configured':'SESSION_SECRET must be at least 32 characters','SECURITY');
  add('integrity_secret','Integrity secret',integritySecret.length>=32&&integritySecret!==sessionSecret?'PASS':'BLOCKER',
    integritySecret.length<32?'INTEGRITY_SECRET must be at least 32 characters':integritySecret===sessionSecret?'Use a separate INTEGRITY_SECRET':'Separate integrity secret configured','SECURITY');

  const [[versionRow]]=await pool.query('SELECT VERSION() version');
  const rawVersion=String(versionRow?.version||'');
  const vm=rawVersion.match(/^(\d+)\.(\d+)/);
  const mysql8=vm&&Number(vm[1])>=8;
  add('mysql_8','MySQL compatibility',mysql8?'PASS':'BLOCKER',rawVersion||'Unknown version','DATABASE');

  const [[migration]]=await pool.query("SELECT COUNT(*) total FROM schema_migrations WHERE filename='015_public_launch_mode.sql'");
  add('migrations','Latest migration applied',Number(migration?.total||0)>0?'PASS':'BLOCKER',
    Number(migration?.total||0)>0?'015_public_launch_mode.sql applied':'Latest migration missing','DATABASE');

  const [[cities]]=await pool.query(`
    SELECT COUNT(*) total,
      SUM(country='Somalia') somalia,
      SUM(country<>'Somalia') non_somalia
    FROM cities WHERE is_active=1
  `);
  const cityOk=Number(cities?.total||0)===10&&Number(cities?.non_somalia||0)===0;
  add('cities','Somalia-only launch cities',cityOk?'PASS':'BLOCKER',
    fmt(Number(cities?.total||0))+' active · '+fmt(Number(cities?.non_somalia||0))+' non-Somalia','COMPETITION');

  const [[goals]]=await pool.query(`
    SELECT
      SUM(verification_status='VERIFIED' AND goal_number IS NULL) missing,
      COUNT(*) verified
    FROM city_memberships
  `);
  add('goal_complete','Permanent Goal numbers',Number(goals?.missing||0)===0?'PASS':'BLOCKER',
    Number(goals?.missing||0)===0?fmt(Number(goals?.verified||0))+' verified memberships complete':fmt(Number(goals?.missing||0))+' verified memberships missing Goal numbers','INTEGRITY');

  const [[duplicates]]=await pool.query(`
    SELECT COUNT(*) duplicate_groups FROM (
      SELECT season_id,city_id,goal_number
      FROM city_memberships
      WHERE goal_number IS NOT NULL
      GROUP BY season_id,city_id,goal_number
      HAVING COUNT(*)>1
    ) x
  `);
  add('goal_unique','Goal-number uniqueness',Number(duplicates?.duplicate_groups||0)===0?'PASS':'BLOCKER',
    Number(duplicates?.duplicate_groups||0)===0?'No duplicate Goal numbers':fmt(Number(duplicates.duplicate_groups))+' duplicate groups','INTEGRITY');

  const [[sequence]]=await pool.query(`
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
  add('goal_sequence','Goal sequence health',Number(sequence?.bad||0)===0?'PASS':'BLOCKER',
    Number(sequence?.bad||0)===0?'All city Goal sequences are ahead':'Bad sequences: '+fmt(Number(sequence.bad)),'INTEGRITY');

  const [[fixtureHealth]]=await pool.query(`
    SELECT
      SUM(status IN ('SCHEDULED','LOBBY','LIVE') AND regulation_ends_at IS NULL) missing_regulation,
      SUM(status='LOBBY' AND lobby_opens_at>UTC_TIMESTAMP()) early_lobby,
      SUM(status='LIVE' AND starts_at>UTC_TIMESTAMP()) early_live
    FROM matches
  `);
  const fixturesOk=Number(fixtureHealth?.missing_regulation||0)===0&&Number(fixtureHealth?.early_lobby||0)===0&&Number(fixtureHealth?.early_live||0)===0;
  add('fixture_health','Fixture lifecycle health',fixturesOk?'PASS':'BLOCKER',
    fixturesOk?'No timing contradictions':
    'missing regulation='+fmt(Number(fixtureHealth?.missing_regulation||0))+
    ' · early lobby='+fmt(Number(fixtureHealth?.early_lobby||0))+
    ' · early live='+fmt(Number(fixtureHealth?.early_live||0)),'MATCHES');

  const [[admins]]=await pool.query('SELECT COUNT(*) total FROM admin_credentials');
  add('admin_account','Administrator account',Number(admins?.total||0)>0?'PASS':'BLOCKER',
    Number(admins?.total||0)>0?fmt(Number(admins.total))+' admin credential record(s)':'Create the first administrator at /admin','OPERATIONS');

  const [[season]]=await pool.query("SELECT id,name,status,starts_at FROM seasons ORDER BY id DESC LIMIT 1");
  add('season','Competition season',season?'PASS':'BLOCKER',season?season.name+' · '+season.status:'No season configured','COMPETITION');

  let stageCount=0;
  if(season?.id){
    const [[stageRow]]=await pool.query('SELECT COUNT(*) total FROM tournament_stages WHERE season_id=?',[season.id]);
    stageCount=Number(stageRow?.total||0);
  }
  add('tournament','Tournament structure',stageCount>0?'PASS':'WARNING',
    stageCount>0?fmt(stageCount)+' stage(s) configured':'Not required for qualification launch; configure before Cup stage begins','COMPETITION');

  const [evidenceRows]=await pool.query(`
    SELECT lar.*
    FROM launch_acceptance_runs lar
    JOIN (
      SELECT run_type,MAX(id) id
      FROM launch_acceptance_runs
      GROUP BY run_type
    ) latest ON latest.id=lar.id
  `);
  const evidenceByType=Object.fromEntries(evidenceRows.map(r=>[r.run_type,r]));
  for(const [type,label] of [
    ['PREFLIGHT','Production preflight'],
    ['SAFE_ACCEPTANCE','Safe HTTP acceptance'],
    ['CONTROLLED_ACCEPTANCE','Controlled transaction acceptance']
  ]){
    const row=evidenceByType[type];
    const ok=row?.status==='PASS';
    add('evidence_'+type.toLowerCase(),label,ok?'PASS':'BLOCKER',
      row?row.status+' · '+new Date(row.created_at).toISOString():'No Hostinger evidence recorded yet','PROOF');
  }

  const [[setting]]=await pool.query("SELECT setting_value,updated_at FROM platform_settings WHERE setting_key='PUBLIC_LAUNCH_MODE' LIMIT 1");
  const launchMode=setting?.setting_value||'COMING_SOON';

  const blockers=checks.filter(c=>c.status==='BLOCKER').length;
  const warnings=checks.filter(c=>c.status==='WARNING').length;
  const overall=blockers?'BLOCKED':warnings?'REVIEW':'READY';

  return {
    overall,blockers,warnings,launchMode,checks,
    evidence:evidenceRows.map(r=>({
      id:Number(r.id),type:r.run_type,status:r.status,failures:Number(r.failures||0),warnings:Number(r.warnings||0),
      origin:r.origin,createdAt:r.created_at,evidence:r.evidence_json
    }))
  };
}
