import crypto from 'node:crypto';
import { Router } from 'express';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';
import { getLaunchReadiness } from '../launchReadiness.js';
import { progressTournament } from '../tournamentProgress.js';
const execFileAsync=promisify(execFile);
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const apiRoot=path.resolve(__dirname,'..');
const launchRuns=new Set();

async function runLaunchScript(kind,adminUserId=null){
  const scripts={
    preflight:'preflight.js',
    safe:'acceptanceSafe.js',
    controlled:'acceptanceControlled.js'
  };
  const file=scripts[kind];
  if(!file)throw Object.assign(new Error('invalid_launch_check'),{status:400});
  if(launchRuns.has(kind))throw Object.assign(new Error('launch_check_already_running'),{status:409});
  launchRuns.add(kind);
  try{
    const env={...process.env};
    let tempAdminSessionId=null;
    if(kind==='controlled'){
      env.ACCEPTANCE_MUTATIONS='I_UNDERSTAND_THIS_CREATES_TEMPORARY_RECORDS';
      if(adminUserId){
        const token=crypto.randomBytes(32).toString('base64url');
        const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt=new Date(Date.now()+10*60*1000);
        const [created]=await pool.query(
          'INSERT INTO admin_sessions(user_id,token_hash,user_agent_hash,expires_at) VALUES (?,?,NULL,?)',
          [adminUserId,tokenHash,expiresAt]
        );
        tempAdminSessionId=Number(created.insertId);
        env.ACCEPTANCE_ADMIN_TOKEN=token;
        delete env.ACCEPTANCE_ADMIN_KEY;
      }else if(process.env.ADMIN_BOOTSTRAP_KEY){
        env.ACCEPTANCE_ADMIN_KEY=process.env.ADMIN_BOOTSTRAP_KEY;
      }
    }
    try{
      const {stdout,stderr}=await execFileAsync(process.execPath,[path.join(apiRoot,file)],{
        env,timeout:180000,maxBuffer:1024*1024
      });
      return {ok:true,stdout:String(stdout||'').slice(-16000),stderr:String(stderr||'').slice(-8000)};
    }finally{
      if(tempAdminSessionId){
        await pool.query('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[tempAdminSessionId]).catch(()=>{});
      }
    }
  }catch(e){
    const err=Object.assign(new Error('launch_check_failed'),{status:409});
    err.payload={
      error:'launch_check_failed',
      message:String(e.message||'Controlled acceptance process failed'),
      exitCode:e.code??null,
      signal:e.signal??null,
      killed:Boolean(e.killed),
      stdout:String(e.stdout||'').slice(-16000),
      stderr:String(e.stderr||'').slice(-8000),
      command:process.execPath+' '+path.join(apiRoot,file)
    };
    throw err;
  }finally{
    launchRuns.delete(kind);
  }
}

const router=Router();
router.use(requireAdminKey);


router.get('/launch-readiness',async(_req,res,next)=>{
  try{
    res.json(await getLaunchReadiness());
  }catch(e){next(e)}
});

router.post('/launch-checks/:kind',async(req,res,next)=>{
  const kind=String(req.params.kind||'').toLowerCase();
  if(!['preflight','safe','controlled'].includes(kind))return res.status(404).json({error:'launch_check_not_found'});
  if(kind==='controlled'){
    const confirmation=String(req.body?.confirmation||'');
    if(confirmation!=='RUN CONTROLLED ACCEPTANCE'){
      return res.status(400).json({error:'controlled_acceptance_confirmation_required'});
    }
  }
  try{
    const result=await runLaunchScript(kind,req.admin?.user_id||null);
    await pool.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'LAUNCH_CHECK_RUN','LAUNCH_ACCEPTANCE',?,JSON_OBJECT('kind',?,'result','PASS'))
    `,[req.admin?.user_id||null,kind,kind]);
    res.json({...result,kind,readiness:await getLaunchReadiness()});
  }catch(e){
    await pool.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'LAUNCH_CHECK_RUN','LAUNCH_ACCEPTANCE',?,JSON_OBJECT('kind',?,'result','FAIL'))
    `,[req.admin?.user_id||null,kind,kind]).catch(()=>{});
    if(e.status){
      const payload=e.payload||{error:e.message};
      const runType=kind==='preflight'?'PREFLIGHT':kind==='safe'?'SAFE_ACCEPTANCE':'CONTROLLED_ACCEPTANCE';
      let structuredEvidence=null;
      if(kind==='controlled'){
        const [[latest]]=await pool.query(`
          SELECT id,status,failures,warnings,evidence_json,created_at
          FROM launch_acceptance_runs
          WHERE run_type='CONTROLLED_ACCEPTANCE'
          ORDER BY id DESC LIMIT 1
        `).catch(()=>[[null]]);
        if(latest){
          structuredEvidence={
            id:Number(latest.id),
            status:latest.status,
            failures:Number(latest.failures||0),
            warnings:Number(latest.warnings||0),
            evidence:latest.evidence_json,
            createdAt:latest.created_at
          };
        }
      }
      await pool.query(`
        INSERT INTO launch_acceptance_runs(run_type,status,failures,warnings,origin,evidence_json)
        VALUES (?, 'FAIL', 1, 0, ?, ?)
      `,[
        runType,
        process.env.APP_ORIGIN||null,
        JSON.stringify({source:'CONTROL_CENTRE_RUNNER',kind,...payload,structuredEvidence})
      ]).catch(()=>{});
      return res.status(e.status).json({...payload,structuredEvidence});
    }
    next(e);
  }
});

router.post('/repair-fixture-lifecycle',async(req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.query(`
      SELECT id,public_id,status,lobby_opens_at,starts_at
      FROM matches
      WHERE status IN ('LOBBY','LIVE')
        AND (
          (status='LOBBY' AND lobby_opens_at>UTC_TIMESTAMP())
          OR
          (status='LIVE' AND starts_at>UTC_TIMESTAMP())
        )
      FOR UPDATE
    `);
    const repaired=[];
    for(const m of rows){
      let target='SCHEDULED';
      if(m.lobby_opens_at){
        const [[dueLobby]]=await conn.query('SELECT ?<=UTC_TIMESTAMP() due',[m.lobby_opens_at]);
        if(Number(dueLobby?.due||0)===1)target='LOBBY';
      }
      if(m.starts_at){
        const [[dueStart]]=await conn.query('SELECT ?<=UTC_TIMESTAMP() due',[m.starts_at]);
        if(Number(dueStart?.due||0)===1)target='LIVE';
      }
      if(target!==m.status){
        await conn.query("UPDATE matches SET status=?,tiebreak_mode='NONE',tiebreak_started_at=NULL WHERE id=?",[target,m.id]);
        await conn.query(`
          INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json)
          VALUES (?,?,?,JSON_OBJECT('via','ADMIN_LIFECYCLE_REPAIR'))
        `,[m.id,m.status,target]);
        repaired.push({publicId:m.public_id,from:m.status,to:target});
      }
    }
    await conn.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'FIXTURE_LIFECYCLE_REPAIRED','MATCH_SET','PRELAUNCH',?)
    `,[req.admin?.user_id||null,JSON.stringify({repaired})]);
    await conn.commit();
    res.json({ok:true,repairedCount:repaired.length,repaired});
  }catch(e){
    await conn.rollback();
    next(e);
  }finally{conn.release()}
});

router.post('/launch-mode',async(req,res,next)=>{
  const mode=String(req.body?.mode||'').toUpperCase();
  if(!['COMING_SOON','LIVE'].includes(mode))return res.status(400).json({error:'invalid_launch_mode'});
  try{
    if(mode==='LIVE'){
      const readiness=await getLaunchReadiness();
      if(readiness.blockers>0){
        return res.status(409).json({error:'launch_blocked',blockers:readiness.blockers,checks:readiness.checks.filter(c=>c.status==='BLOCKER')});
      }
    }
    await pool.query(`
      INSERT INTO platform_settings(setting_key,setting_value,updated_by_user_id)
      VALUES ('PUBLIC_LAUNCH_MODE',?,?)
      ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_user_id=VALUES(updated_by_user_id)
    `,[mode,req.admin?.user_id||null]);
    await pool.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'PUBLIC_LAUNCH_MODE_CHANGED','PLATFORM_SETTING','PUBLIC_LAUNCH_MODE',JSON_OBJECT('mode',?))
    `,[req.admin?.user_id||null,mode]);
    res.json({ok:true,mode});
  }catch(e){next(e)}
});

router.get('/operations',async(_req,res,next)=>{
  try{
    const [rows]=await pool.query("SELECT setting_key,setting_value,updated_at FROM platform_settings WHERE setting_key IN ('JOIN_OPERATIONS_MODE','MATCH_OPERATIONS_MODE')");
    const settings=Object.fromEntries(rows.map(r=>[r.setting_key,{value:r.setting_value,updatedAt:r.updated_at}]));
    res.json({
      joins:settings.JOIN_OPERATIONS_MODE?.value||'OPEN',
      matches:settings.MATCH_OPERATIONS_MODE?.value||'OPEN',
      updated:{joins:settings.JOIN_OPERATIONS_MODE?.updatedAt||null,matches:settings.MATCH_OPERATIONS_MODE?.updatedAt||null}
    });
  }catch(e){next(e)}
});

router.patch('/operations',async(req,res,next)=>{
  const area=String(req.body?.area||'').toUpperCase();
  const mode=String(req.body?.mode||'').toUpperCase();
  const reason=String(req.body?.reason||'').trim().slice(0,255);
  const key=area==='JOINS'?'JOIN_OPERATIONS_MODE':area==='MATCHES'?'MATCH_OPERATIONS_MODE':null;
  if(!key||!['OPEN','FROZEN'].includes(mode))return res.status(400).json({error:'invalid_operations_change'});
  if(reason.length<5)return res.status(400).json({error:'reason_required'});
  if(String(req.body?.confirmation||'')!=='CONFIRM OPERATIONS CHANGE')return res.status(400).json({error:'operations_confirmation_required'});
  try{
    await pool.query(
      "INSERT INTO platform_settings(setting_key,setting_value,updated_by_user_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value),updated_by_user_id=VALUES(updated_by_user_id)",
      [key,mode,req.admin?.user_id||null]
    );
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,mode==='FROZEN'?'OPERATIONS_FROZEN':'OPERATIONS_REOPENED','PLATFORM_SETTING',key,JSON.stringify({area,mode,reason})]
    );
    res.json({ok:true,area,mode});
  }catch(e){next(e)}
});

router.get('/overview',async(_req,res,next)=>{
  try{
    const [[season]]=await pool.query("SELECT id,name,status,starts_at,ends_at FROM seasons ORDER BY id DESC LIMIT 1");
    if(!season)return res.json({season:null});
    const [[summary]]=await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM season_cities WHERE season_id=?) cities,
        (SELECT COUNT(*) FROM city_memberships WHERE season_id=? AND status='ACTIVE' AND verification_status='VERIFIED') verifiedSupporters,
        (SELECT COUNT(*) FROM qualification_referrals WHERE season_id=?) qualificationAssists,
        (SELECT COUNT(*) FROM matches WHERE season_id=? AND status='LIVE') liveMatches,
        (SELECT COUNT(*) FROM matches WHERE season_id=? AND status='LOBBY') lobbyMatches,
        (SELECT COUNT(*) FROM matches WHERE season_id=? AND status='SCHEDULED') scheduledMatches,
        (SELECT COUNT(*) FROM matches WHERE season_id=? AND status='FINAL') finalMatches,
        (SELECT COUNT(*) FROM match_assists ma JOIN matches m ON m.id=ma.match_id WHERE m.season_id=?) matchAssists,
        (SELECT COUNT(*) FROM competition_awards WHERE season_id=? AND status='CONFIRMED') confirmedAwards
    `,[season.id,season.id,season.id,season.id,season.id,season.id,season.id,season.id,season.id]);
    const [[integrity]]=await pool.query(`
      SELECT
        SUM(event_type='DUPLICATE_DEVICE_BLOCKED') duplicateBlocks,
        SUM(event_type='NETWORK_BURST_SIGNAL') burstSignals
      FROM identity_integrity_events
      WHERE season_id=? AND created_at>=UTC_TIMESTAMP()-INTERVAL 7 DAY
    `,[season.id]);
    const [stages]=await pool.query(`
      SELECT code,name,stage_type,status,sequence_no
      FROM tournament_stages WHERE season_id=?
      ORDER BY sequence_no
    `,[season.id]);
    const [leaders]=await pool.query(`
      SELECT c.code,c.name,COUNT(cm.id) verified_supporters,sc.qualification_target,sc.status
      FROM season_cities sc
      JOIN cities c ON c.id=sc.city_id
      LEFT JOIN city_memberships cm ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id
        AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
      WHERE sc.season_id=?
      GROUP BY c.id,c.code,c.name,sc.qualification_target,sc.status
      ORDER BY verified_supporters DESC,c.name
      LIMIT 5
    `,[season.id]);
    const [recentAudit]=await pool.query(`
      SELECT al.id,al.action,al.entity_type,al.entity_id,al.created_at,u.display_name actor_name
      FROM audit_log al
      LEFT JOIN users u ON u.id=al.actor_user_id
      ORDER BY al.id DESC LIMIT 8
    `);
    res.json({
      season,
      summary:{
        cities:Number(summary.cities||0),
        verifiedSupporters:Number(summary.verifiedSupporters||0),
        qualificationAssists:Number(summary.qualificationAssists||0),
        liveMatches:Number(summary.liveMatches||0),
        lobbyMatches:Number(summary.lobbyMatches||0),
        scheduledMatches:Number(summary.scheduledMatches||0),
        finalMatches:Number(summary.finalMatches||0),
        matchAssists:Number(summary.matchAssists||0),
        confirmedAwards:Number(summary.confirmedAwards||0)
      },
      integrity:{
        duplicateBlocks:Number(integrity?.duplicateBlocks||0),
        burstSignals:Number(integrity?.burstSignals||0)
      },
      stages,
      leaders:leaders.map(r=>({...r,verified_supporters:Number(r.verified_supporters||0),qualification_target:Number(r.qualification_target||0)})),
      recentAudit
    });
  }catch(e){next(e)}
});

router.get('/audit',async(req,res,next)=>{
  try{
    const limit=Math.max(10,Math.min(200,Number(req.query.limit)||100));
    const [rows]=await pool.query(`
      SELECT al.id,al.action,al.entity_type,al.entity_id,al.metadata_json,al.created_at,
        u.public_id actor_public_id,u.display_name actor_name,u.email actor_email
      FROM audit_log al
      LEFT JOIN users u ON u.id=al.actor_user_id
      ORDER BY al.id DESC
      LIMIT ?
    `,[limit]);
    res.json({audit:rows});
  }catch(e){next(e)}
});

router.post('/tournament/progress',async(req,res,next)=>{
  try{
    const result=await progressTournament();
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'TOURNAMENT_MANUAL_PROGRESSION','SEASON','ACTIVE',JSON.stringify(result)]);
    res.json(result);
  }catch(e){next(e)}
});

router.get('/tournament-config',async(_req,res,next)=>{
  try{
    const [[season]]=await pool.query("SELECT id,name,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL','COMPLETE') ORDER BY id DESC LIMIT 1");
    if(!season)return res.json({season:null,stages:[],cities:[]});
    const [cities]=await pool.query(`
      SELECT c.id,c.code,c.name,sc.status
      FROM season_cities sc JOIN cities c ON c.id=sc.city_id
      WHERE sc.season_id=? AND c.is_active=1
      ORDER BY c.name
    `,[season.id]);
    const [stages]=await pool.query(`
      SELECT id,code,name,stage_type,sequence_no,status,advance_count,tie_policy,match_duration_minutes
      FROM tournament_stages WHERE season_id=? ORDER BY sequence_no
    `,[season.id]);
    const output=[];
    for(const stage of stages){
      const item={...stage,id:Number(stage.id),sequence_no:Number(stage.sequence_no),match_duration_minutes:Number(stage.match_duration_minutes||60),groups:[]};
      if(stage.stage_type==='GROUP'){
        const [groups]=await pool.query('SELECT id,code,name FROM tournament_groups WHERE stage_id=? ORDER BY code',[stage.id]);
        for(const g of groups){
          const [members]=await pool.query(`
            SELECT c.id,c.code,c.name,tgc.seed_no
            FROM tournament_group_cities tgc JOIN cities c ON c.id=tgc.city_id
            WHERE tgc.group_id=? ORDER BY tgc.seed_no,c.name
          `,[g.id]);
          item.groups.push({...g,id:Number(g.id),cities:members.map(x=>({...x,id:Number(x.id),seed_no:Number(x.seed_no)}))});
        }
      }
      output.push(item);
    }
    res.json({season,cities,stages:output});
  }catch(e){next(e)}
});

router.post('/tournament/stages',async(req,res,next)=>{
  const code=String(req.body?.code||'').trim().toUpperCase().slice(0,24);
  const name=String(req.body?.name||'').trim().slice(0,80);
  const type=String(req.body?.stageType||'').toUpperCase();
  const sequence=Number(req.body?.sequenceNo);
  const tiePolicy=String(req.body?.tiePolicy||'SUDDEN_DEATH').toUpperCase();
  const duration=Math.max(1,Math.min(1440,Number(req.body?.matchDurationMinutes)||60));
  const advance=req.body?.advanceCount===null||req.body?.advanceCount===''?null:Number(req.body?.advanceCount);
  if(!code||!name||!['GROUP','KNOCKOUT','FINAL'].includes(type)||!Number.isInteger(sequence)||sequence<1)return res.status(400).json({error:'invalid_tournament_stage'});
  if(!['DRAW_ALLOWED','SUDDEN_DEATH'].includes(tiePolicy))return res.status(400).json({error:'invalid_tie_policy'});
  try{
    const [[season]]=await pool.query("SELECT id FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL') ORDER BY id DESC LIMIT 1");
    if(!season)return res.status(409).json({error:'active_season_required'});
    const [result]=await pool.query(`
      INSERT INTO tournament_stages(season_id,code,name,stage_type,sequence_no,status,advance_count,tie_policy,match_duration_minutes)
      VALUES (?,?,?,?,?,'DRAFT',?,?,?)
    `,[season.id,code,name,type,sequence,Number.isInteger(advance)?advance:null,tiePolicy,duration]);
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'TOURNAMENT_STAGE_CREATED','TOURNAMENT_STAGE',String(result.insertId),JSON.stringify({code,name,type,sequence,tiePolicy,duration,advance})]);
    res.status(201).json({ok:true,id:Number(result.insertId)});
  }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'stage_code_or_sequence_already_exists'});next(e)}
});

router.patch('/tournament/stages/:stageId',async(req,res,next)=>{
  const stageId=Number(req.params.stageId);
  const name=String(req.body?.name||'').trim().slice(0,80);
  const status=String(req.body?.status||'').toUpperCase();
  const tiePolicy=String(req.body?.tiePolicy||'').toUpperCase();
  const duration=Number(req.body?.matchDurationMinutes);
  if(!Number.isInteger(stageId)||stageId<1||!name||!['DRAFT','OPEN','COMPLETE'].includes(status)||!['DRAW_ALLOWED','SUDDEN_DEATH'].includes(tiePolicy)||!Number.isInteger(duration)||duration<1||duration>1440){
    return res.status(400).json({error:'invalid_stage_update'});
  }
  try{
    const [result]=await pool.query('UPDATE tournament_stages SET name=?,status=?,tie_policy=?,match_duration_minutes=? WHERE id=?',[name,status,tiePolicy,duration,stageId]);
    if(!result.affectedRows)return res.status(404).json({error:'stage_not_found'});
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'TOURNAMENT_STAGE_UPDATED','TOURNAMENT_STAGE',String(stageId),JSON.stringify({name,status,tiePolicy,duration})]);
    res.json({ok:true});
  }catch(e){next(e)}
});

router.post('/tournament/groups',async(req,res,next)=>{
  const stageId=Number(req.body?.stageId);
  const code=String(req.body?.code||'').trim().toUpperCase().slice(0,12);
  const name=String(req.body?.name||'').trim().slice(0,60);
  if(!Number.isInteger(stageId)||stageId<1||!code||!name)return res.status(400).json({error:'invalid_group'});
  try{
    const [[stage]]=await pool.query("SELECT id FROM tournament_stages WHERE id=? AND stage_type='GROUP' LIMIT 1",[stageId]);
    if(!stage)return res.status(409).json({error:'group_stage_required'});
    const [result]=await pool.query('INSERT INTO tournament_groups(stage_id,code,name) VALUES (?,?,?)',[stageId,code,name]);
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'TOURNAMENT_GROUP_CREATED','TOURNAMENT_GROUP',String(result.insertId),JSON.stringify({stageId,code,name})]);
    res.status(201).json({ok:true,id:Number(result.insertId)});
  }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'group_code_already_exists'});next(e)}
});

router.post('/tournament/groups/:groupId/cities',async(req,res,next)=>{
  const groupId=Number(req.params.groupId);
  const cityCode=String(req.body?.cityCode||'').trim().toUpperCase();
  const seedNo=Math.max(1,Math.min(1000,Number(req.body?.seedNo)||100));
  if(!Number.isInteger(groupId)||groupId<1||!cityCode)return res.status(400).json({error:'invalid_group_city'});
  try{
    const [[city]]=await pool.query('SELECT id,name FROM cities WHERE code=? AND is_active=1 LIMIT 1',[cityCode]);
    if(!city)return res.status(404).json({error:'city_not_found'});
    const [[group]]=await pool.query('SELECT id,stage_id FROM tournament_groups WHERE id=? LIMIT 1',[groupId]);
    if(!group)return res.status(404).json({error:'group_not_found'});
    const [[existing]]=await pool.query(`
      SELECT tg.id group_id,tg.name group_name
      FROM tournament_group_cities tgc
      JOIN tournament_groups tg ON tg.id=tgc.group_id
      WHERE tg.stage_id=? AND tgc.city_id=? AND tg.id<>?
      LIMIT 1
    `,[group.stage_id,city.id,groupId]);
    if(existing)return res.status(409).json({error:'city_already_in_stage_group',groupName:existing.group_name});
    await pool.query('INSERT INTO tournament_group_cities(group_id,city_id,seed_no) VALUES (?,?,?) ON DUPLICATE KEY UPDATE seed_no=VALUES(seed_no)',[groupId,city.id,seedNo]);
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'TOURNAMENT_GROUP_CITY_ASSIGNED','TOURNAMENT_GROUP',String(groupId),JSON.stringify({cityCode,cityId:city.id,seedNo})]);
    res.json({ok:true});
  }catch(e){next(e)}
});

router.delete('/tournament/groups/:groupId/cities/:cityCode',async(req,res,next)=>{
  const groupId=Number(req.params.groupId);
  const cityCode=String(req.params.cityCode||'').trim().toUpperCase();
  try{
    const [[city]]=await pool.query('SELECT id FROM cities WHERE code=? LIMIT 1',[cityCode]);
    if(!city)return res.status(404).json({error:'city_not_found'});
    await pool.query('DELETE FROM tournament_group_cities WHERE group_id=? AND city_id=?',[groupId,city.id]);
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'TOURNAMENT_GROUP_CITY_REMOVED','TOURNAMENT_GROUP',String(groupId),JSON.stringify({cityCode,cityId:city.id})]);
    res.json({ok:true});
  }catch(e){next(e)}
});

router.get('/supporters',async(req,res,next)=>{
  try{
    const q=String(req.query.q||'').trim().slice(0,80);
    const like='%'+q+'%';
    const [rows]=await pool.query(`
      SELECT u.id user_id,u.public_id,u.display_name,u.nickname,u.email,u.status,u.created_at,
        c.code city_code,c.name city_name,
        cm.goal_number,cm.verification_status,cm.joined_at,
        (SELECT COUNT(*) FROM qualification_referrals qr WHERE qr.season_id=cm.season_id AND qr.referrer_user_id=u.id) assists,
        (SELECT COUNT(*) FROM qualification_referrals qr2 WHERE qr2.season_id=cm.season_id AND (qr2.referrer_user_id=u.id OR qr2.referred_user_id=u.id)) referral_links,
        (SELECT COUNT(*) FROM season_device_claims sdc WHERE sdc.user_id=u.id) device_claims,
        (SELECT COUNT(*) FROM identity_integrity_events iie WHERE iie.user_id=u.id AND iie.event_type IN ('DUPLICATE_DEVICE_BLOCKED','NETWORK_BURST_SIGNAL')) integrity_flags
      FROM users u
      JOIN city_memberships cm ON cm.user_id=u.id
      JOIN cities c ON c.id=cm.city_id
      WHERE u.role='PLAYER'
        AND (?='' OR u.display_name LIKE ? OR u.nickname LIKE ? OR u.email LIKE ? OR u.public_id LIKE ?)
      ORDER BY cm.joined_at DESC
      LIMIT 100
    `,[q,like,like,like,like]);
    res.json({supporters:rows.map(r=>({...r,goal_number:Number(r.goal_number||0),assists:Number(r.assists||0)}))});
  }catch(e){next(e)}
});

router.patch('/season',async(req,res,next)=>{
  const target=String(req.body?.status||'').toUpperCase();
  const allowed=['QUALIFICATION','GROUP','KNOCKOUT','FINAL','COMPLETE','ARCHIVED'];
  if(!allowed.includes(target))return res.status(400).json({error:'invalid_season_status'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[season]]=await conn.query('SELECT * FROM seasons ORDER BY id DESC LIMIT 1 FOR UPDATE');
    if(!season)throw Object.assign(new Error('season_not_found'),{status:404});
    const forward={
      DRAFT:['QUALIFICATION'],
      QUALIFICATION:['GROUP'],
      GROUP:['KNOCKOUT'],
      KNOCKOUT:['FINAL'],
      FINAL:['COMPLETE'],
      COMPLETE:['ARCHIVED'],
      ARCHIVED:[]
    };
    if(!forward[season.status]?.includes(target))throw Object.assign(new Error('invalid_season_transition'),{status:409});
    if(String(req.body?.confirmation||'')!=='CONFIRM SEASON CHANGE')throw Object.assign(new Error('season_change_confirmation_required'),{status:400});
    await conn.query(
      ['COMPLETE','ARCHIVED'].includes(target)
        ? 'UPDATE seasons SET status=?,ends_at=COALESCE(ends_at,UTC_TIMESTAMP()) WHERE id=?'
        : 'UPDATE seasons SET status=? WHERE id=?',
      [target,season.id]
    );
    if(season.status==='QUALIFICATION'&&target!=='QUALIFICATION'){
      await conn.query('UPDATE season_cities SET is_open=0 WHERE season_id=?',[season.id]);
    }
    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'SEASON_STATUS_CHANGED','SEASON',String(season.id),JSON.stringify({from:season.status,to:target})]
    );
    await conn.commit();
    res.json({ok:true,from:season.status,to:target});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.get('/qualification',async(_req,res,next)=>{
  try{
    const [[season]]=await pool.query("SELECT id,name,status,starts_at,ends_at FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL','COMPLETE') ORDER BY id DESC LIMIT 1");
    if(!season) return res.json({season:null,cities:[]});
    const [cities]=await pool.query(`SELECT c.id,c.code,c.name,c.country,c.tier,sc.status,sc.qualification_target,sc.is_open,
      SUM(cm.status='ACTIVE' AND cm.verification_status='VERIFIED') verified_supporters
      FROM season_cities sc JOIN cities c ON c.id=sc.city_id
      LEFT JOIN city_memberships cm ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id
      WHERE sc.season_id=? GROUP BY c.id,c.code,c.name,c.country,c.tier,sc.status,sc.qualification_target,sc.is_open ORDER BY verified_supporters DESC,c.name`,[season.id]);
    res.json({season,cities});
  }catch(e){next(e)}
});

router.patch('/qualification/cities/:cityId',async(req,res,next)=>{
  const cityId=Number(req.params.cityId);
  if(!Number.isInteger(cityId)||cityId<1) return res.status(400).json({error:'invalid_city'});
  const allowedStatus=['QUALIFYING','QUALIFIED','ELIMINATED','CHAMPION'];
  const fields=[]; const vals=[]; const events=[];
  if(req.body?.status!==undefined){if(!allowedStatus.includes(req.body.status)) return res.status(400).json({error:'invalid_status'});fields.push('status=?');vals.push(req.body.status);events.push(['STATUS_CHANGED',0,{status:req.body.status}]);}
  if(req.body?.qualificationTarget!==undefined){const n=Number(req.body.qualificationTarget);if(!Number.isInteger(n)||n<1||n>10000000)return res.status(400).json({error:'invalid_target'});fields.push('qualification_target=?');vals.push(n);events.push(['TARGET_CHANGED',0,{qualificationTarget:n}]);}
  if(req.body?.isOpen!==undefined){const open=!!req.body.isOpen;fields.push('is_open=?');vals.push(open?1:0);events.push([open?'CITY_OPENED':'CITY_CLOSED',0,{isOpen:open}]);}
  if(!fields.length) return res.status(400).json({error:'nothing_to_update'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[season]]=await conn.query("SELECT id,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL','COMPLETE') ORDER BY id DESC LIMIT 1");
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});
    const [result]=await conn.query(`UPDATE season_cities SET ${fields.join(',')} WHERE season_id=? AND city_id=?`,[...vals,season.id,cityId]);
    if(!result.affectedRows) throw Object.assign(new Error('city_not_in_season'),{status:404});
    for(const [type,delta,meta] of events) await conn.query(`INSERT INTO qualification_events(season_id,city_id,type,delta,metadata_json) VALUES (?,?,?,?,?)`,[season.id,cityId,type,delta,JSON.stringify(meta)]);
    await conn.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,'QUALIFICATION_CITY_UPDATED','SEASON_CITY',?,?)`,[req.admin?.user_id||null,`${season.id}:${cityId}`,JSON.stringify(req.body)]);
    await conn.commit();
    res.json({ok:true});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

router.patch('/supporters/:publicId/status',async(req,res,next)=>{
  const target=String(req.body?.status||'').toUpperCase();
  if(!['ACTIVE','SUSPENDED'].includes(target))return res.status(400).json({error:'invalid_supporter_status'});
  const reason=String(req.body?.reason||'').trim().slice(0,255);
  if(reason.length<5)return res.status(400).json({error:'reason_required'});
  if(String(req.body?.confirmation||'')!=='CONFIRM SUPPORTER STATUS')return res.status(400).json({error:'supporter_status_confirmation_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[user]]=await conn.query("SELECT id,public_id,status,role FROM users WHERE public_id=? LIMIT 1 FOR UPDATE",[req.params.publicId]);
    if(!user)throw Object.assign(new Error('supporter_not_found'),{status:404});
    if(user.role!=='PLAYER')throw Object.assign(new Error('player_only_operation'),{status:409});
    const from=user.status;
    if(from===target){await conn.commit();return res.json({ok:true,changed:false,status:target})}
    await conn.query('UPDATE users SET status=? WHERE id=?',[target,user.id]);
    if(target==='SUSPENDED'){
      await conn.query('UPDATE identity_sessions SET revoked_at=UTC_TIMESTAMP() WHERE user_id=? AND revoked_at IS NULL',[user.id]);
    }
    await conn.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,target==='SUSPENDED'?'SUPPORTER_SUSPENDED':'SUPPORTER_REINSTATED','USER',String(user.id),JSON.stringify({publicId:user.public_id,from,to:target,reason})]);
    await conn.commit();
    res.json({ok:true,changed:true,from,to:target});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.get('/integrity',async(req,res,next)=>{
  try{
    const days=Math.max(1,Math.min(30,Number(req.query.days)||7));
    const [[summary]]=await pool.query(`
      SELECT
        SUM(event_type='DUPLICATE_DEVICE_BLOCKED') duplicateDeviceBlocks,
        SUM(event_type='DEVICE_RECOVERED') deviceRecoveries,
        SUM(event_type='NETWORK_BURST_SIGNAL') networkBurstSignals,
        SUM(event_type='DEVICE_CLAIMED') deviceClaims
      FROM identity_integrity_events
      WHERE created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY
    `,[days]);
    const [recent]=await pool.query(`
      SELECT iie.id,iie.event_type,iie.created_at,iie.user_id,
        LEFT(iie.device_hash,12) device_hint,
        LEFT(iie.network_hash,12) network_hint,
        iie.metadata_json,iie.review_status,iie.review_notes,iie.reviewed_at,
        ru.display_name reviewed_by_name,
        u.public_id,u.display_name
      FROM identity_integrity_events iie
      LEFT JOIN users u ON u.id=iie.user_id
      LEFT JOIN users ru ON ru.id=iie.reviewed_by_user_id
      WHERE iie.event_type IN ('DUPLICATE_DEVICE_BLOCKED','NETWORK_BURST_SIGNAL','DEVICE_RECOVERED')
        AND iie.created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY
      ORDER BY iie.id DESC
      LIMIT 100
    `,[days]);
    res.json({
      days,
      summary:{
        duplicateDeviceBlocks:Number(summary?.duplicateDeviceBlocks||0),
        deviceRecoveries:Number(summary?.deviceRecoveries||0),
        networkBurstSignals:Number(summary?.networkBurstSignals||0),
        deviceClaims:Number(summary?.deviceClaims||0)
      },
      recent
    });
  }catch(e){next(e)}
});

router.patch('/integrity/:eventId/review',async(req,res,next)=>{
  const eventId=Number(req.params.eventId);
  const status=String(req.body?.status||'').toUpperCase();
  const notes=String(req.body?.notes||'').trim().slice(0,500);
  if(!Number.isInteger(eventId)||eventId<1)return res.status(400).json({error:'invalid_integrity_event'});
  if(!['REVIEWED','DISMISSED'].includes(status))return res.status(400).json({error:'invalid_review_status'});
  if(notes.length<3)return res.status(400).json({error:'review_notes_required'});
  try{
    const [result]=await pool.query(
      'UPDATE identity_integrity_events SET review_status=?,review_notes=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?',
      [status,notes,req.admin?.user_id||null,eventId]
    );
    if(!result.affectedRows)return res.status(404).json({error:'integrity_event_not_found'});
    await pool.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,status==='DISMISSED'?'INTEGRITY_SIGNAL_DISMISSED':'INTEGRITY_SIGNAL_REVIEWED','INTEGRITY_EVENT',String(eventId),JSON.stringify({status,notes})]);
    res.json({ok:true,status});
  }catch(e){next(e)}
});

router.get('/matches',async(_req,res,next)=>{
  try{
    const [[season]]=await pool.query("SELECT id,name,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL','COMPLETE') ORDER BY id DESC LIMIT 1");
    const [cities]=await pool.query("SELECT code,name FROM cities WHERE is_active=1 ORDER BY name");
    const [rows]=await pool.query(`
      SELECT m.public_id,m.round_code,m.status,m.starts_at,m.lobby_opens_at,m.regulation_ends_at,m.ends_at,m.finalised_at,
        m.home_score,m.away_score,m.score_version,m.tiebreak_mode,m.winner_city_id,
        hc.code home_code,hc.name home_name,ac.code away_code,ac.name away_name,
        wc.code winner_code,wc.name winner_name,
        (SELECT COUNT(*) FROM match_participations mp WHERE mp.match_id=m.id) participation_total,
        (SELECT COUNT(*) FROM scoring_events se WHERE se.match_id=m.id AND se.type='GOAL') verified_goals
      FROM matches m
      JOIN cities hc ON hc.id=m.home_city_id
      JOIN cities ac ON ac.id=m.away_city_id
      LEFT JOIN cities wc ON wc.id=m.winner_city_id
      ORDER BY FIELD(m.status,'LIVE','LOBBY','SCHEDULED','FINAL','CANCELLED'),m.starts_at ASC,m.id DESC
      LIMIT 100`);
    res.json({season,cities,matches:rows.map(x=>({...x,participation_total:Number(x.participation_total||0),verified_goals:Number(x.verified_goals||0)}))});
  }catch(e){next(e)}
});

router.post('/matches',async(req,res,next)=>{
  const homeCode=String(req.body?.homeCityCode||'').trim().toUpperCase();
  const awayCode=String(req.body?.awayCityCode||'').trim().toUpperCase();
  const roundCode=String(req.body?.roundCode||'').trim().slice(0,40);
  const startsAt=req.body?.startsAt;
  const lobbyOpensAt=req.body?.lobbyOpensAt||null;
  const durationMinutes=Math.max(1,Math.min(1440,Number(req.body?.durationMinutes)||60));
  const regulationEndsAt=startsAt?new Date(new Date(startsAt).getTime()+durationMinutes*60000):null;
  if(!homeCode||!awayCode||homeCode===awayCode||!roundCode||!startsAt||Number.isNaN(regulationEndsAt?.getTime())) return res.status(400).json({error:'invalid_fixture'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[season]]=await conn.query("SELECT id,name,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL') ORDER BY starts_at DESC,id DESC LIMIT 1");
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});
    const [cities]=await conn.query('SELECT id,code FROM cities WHERE code IN (?,?) AND is_active=1',[homeCode,awayCode]);
    if(cities.length!==2) throw Object.assign(new Error('city_not_found'),{status:404});
    const home=cities.find(c=>c.code===homeCode),away=cities.find(c=>c.code===awayCode);
    const publicId=crypto.randomBytes(13).toString('hex');
    const [result]=await conn.query(`INSERT INTO matches(public_id,season_id,round_code,home_city_id,away_city_id,starts_at,regulation_ends_at,lobby_opens_at,status)
      VALUES (?,?,?,?,?,?,?,?,'SCHEDULED')`,[publicId,season.id,roundCode,home.id,away.id,startsAt,regulationEndsAt,lobbyOpensAt]);
    await conn.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'MATCH_CREATED','MATCH',?,?)`,[req.admin?.user_id||null,String(result.insertId),JSON.stringify({publicId,homeCode,awayCode,roundCode,startsAt,regulationEndsAt,lobbyOpensAt,durationMinutes})]);
    await conn.commit();
    res.status(201).json({publicId,status:'SCHEDULED'});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

router.patch('/matches/:publicId',async(req,res,next)=>{
  const startsAt=req.body?.startsAt;
  const lobbyOpensAt=req.body?.lobbyOpensAt||null;
  const roundCode=String(req.body?.roundCode||'').trim().slice(0,40);
  const homeCode=String(req.body?.homeCityCode||'').trim().toUpperCase();
  const awayCode=String(req.body?.awayCityCode||'').trim().toUpperCase();
  const durationMinutes=Math.max(1,Math.min(1440,Number(req.body?.durationMinutes)||60));
  if(!startsAt||!roundCode||!homeCode||!awayCode||homeCode===awayCode)return res.status(400).json({error:'invalid_fixture'});
  const startDate=new Date(startsAt);
  if(Number.isNaN(startDate.getTime()))return res.status(400).json({error:'invalid_fixture_time'});
  const regulationEndsAt=new Date(startDate.getTime()+durationMinutes*60000);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[match]]=await conn.query('SELECT * FROM matches WHERE public_id=? LIMIT 1 FOR UPDATE',[req.params.publicId]);
    if(!match)throw Object.assign(new Error('match_not_found'),{status:404});
    if(!['SCHEDULED','LOBBY'].includes(match.status))throw Object.assign(new Error('fixture_edit_locked_after_live'),{status:409});
    const [cities]=await conn.query('SELECT id,code FROM cities WHERE code IN (?,?) AND is_active=1',[homeCode,awayCode]);
    if(cities.length!==2)throw Object.assign(new Error('city_not_found'),{status:404});
    const home=cities.find(c=>c.code===homeCode),away=cities.find(c=>c.code===awayCode);
    const before={homeCityId:match.home_city_id,awayCityId:match.away_city_id,roundCode:match.round_code,startsAt:match.starts_at,lobbyOpensAt:match.lobby_opens_at,regulationEndsAt:match.regulation_ends_at};
    await conn.query('UPDATE matches SET home_city_id=?,away_city_id=?,round_code=?,starts_at=?,lobby_opens_at=?,regulation_ends_at=? WHERE id=?',
      [home.id,away.id,roundCode,startDate,lobbyOpensAt,regulationEndsAt,match.id]);
    await conn.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MATCH_UPDATED','MATCH',String(match.id),JSON.stringify({before,after:{homeCode,awayCode,roundCode,startsAt,lobbyOpensAt,regulationEndsAt,durationMinutes}})]);
    await conn.commit();
    res.json({ok:true});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.post('/matches/:publicId/score-adjustment',async(req,res,next)=>{
  const homeScore=Number(req.body?.homeScore);
  const awayScore=Number(req.body?.awayScore);
  const reason=String(req.body?.reason||'').trim().slice(0,255);
  if(!Number.isInteger(homeScore)||homeScore<0||!Number.isInteger(awayScore)||awayScore<0||reason.length<5){
    return res.status(400).json({error:'valid_scores_and_reason_required'});
  }
  if(String(req.body?.confirmation||'')!=='CONFIRM SCORE CORRECTION'){
    return res.status(400).json({error:'score_correction_confirmation_required'});
  }
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[match]]=await conn.query('SELECT * FROM matches WHERE public_id=? LIMIT 1 FOR UPDATE',[req.params.publicId]);
    if(!match)throw Object.assign(new Error('match_not_found'),{status:404});
    if(match.status!=='LIVE')throw Object.assign(new Error('score_correction_live_only'),{status:409});
    const adjustments=[
      {cityId:match.home_city_id,delta:homeScore-Number(match.home_score||0),side:'HOME'},
      {cityId:match.away_city_id,delta:awayScore-Number(match.away_score||0),side:'AWAY'}
    ].filter(x=>x.delta!==0);
    if(!adjustments.length){await conn.commit();return res.json({ok:true,changed:false})}
    for(const a of adjustments){
      const idem='admin-adjust:'+match.id+':'+Date.now()+':'+a.side+':'+crypto.randomBytes(4).toString('hex');
      await conn.query("INSERT INTO scoring_events(match_id,city_id,participation_id,type,points,reason,idempotency_key) VALUES (?,?,NULL,'ADJUSTMENT',?,?,?)",
        [match.id,a.cityId,a.delta,'ADMIN CORRECTION: '+reason,idem]);
    }
    const before={homeScore:Number(match.home_score||0),awayScore:Number(match.away_score||0)};
    await conn.query('UPDATE matches SET home_score=?,away_score=?,score_version=score_version+1 WHERE id=?',[homeScore,awayScore,match.id]);
    await conn.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MATCH_SCORE_CORRECTED','MATCH',String(match.id),JSON.stringify({before,after:{homeScore,awayScore},reason})]);
    await conn.commit();
    res.json({ok:true,changed:true});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.patch('/matches/:publicId/state',async(req,res,next)=>{
  const target=String(req.body?.status||'').toUpperCase();
  const transitions={SCHEDULED:['LOBBY','CANCELLED'],LOBBY:['LIVE','CANCELLED'],LIVE:['FINAL','CANCELLED'],FINAL:[],CANCELLED:['SCHEDULED']};
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[match]]=await conn.query('SELECT * FROM matches WHERE public_id=? LIMIT 1 FOR UPDATE',[req.params.publicId]);
    if(!match) throw Object.assign(new Error('match_not_found'),{status:404});
    if(!transitions[match.status]?.includes(target)) throw Object.assign(new Error('invalid_match_transition'),{status:409});
    if(target==='CANCELLED'&&String(req.body?.confirmation||'')!=='CANCEL MATCH')throw Object.assign(new Error('cancel_match_confirmation_required'),{status:400});
    if(match.status==='CANCELLED'&&target==='SCHEDULED'&&String(req.body?.confirmation||'')!=='REOPEN MATCH')throw Object.assign(new Error('reopen_match_confirmation_required'),{status:400});
    let winner=null;
    if(target==='FINAL'){
      const tied=Number(match.home_score)===Number(match.away_score);
      let tiePolicy=String(match.round_code||'').toUpperCase()==='GROUP'?'DRAW_ALLOWED':'SUDDEN_DEATH';
      if(match.stage_id){
        const [[stage]]=await conn.query('SELECT tie_policy FROM tournament_stages WHERE id=? LIMIT 1',[match.stage_id]);
        if(stage?.tie_policy)tiePolicy=stage.tie_policy;
      }
      if(tied&&tiePolicy==='SUDDEN_DEATH'){
        await conn.query("UPDATE matches SET tiebreak_mode='SUDDEN_DEATH',tiebreak_started_at=COALESCE(tiebreak_started_at,UTC_TIMESTAMP()) WHERE id=?",[match.id]);
        await conn.query("INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json) VALUES (?,'LIVE','LIVE',JSON_OBJECT('via','ADMIN','mode','SUDDEN_DEATH'))",[match.id]);
        await conn.commit();
        return res.status(409).json({error:'sudden_death_required',status:'LIVE',tiebreakMode:'SUDDEN_DEATH'});
      }
      winner=tied?null:(Number(match.home_score)>Number(match.away_score)?match.home_city_id:match.away_city_id);
      await conn.query("UPDATE matches SET status='FINAL',winner_city_id=?,finalised_at=UTC_TIMESTAMP(),ends_at=COALESCE(ends_at,UTC_TIMESTAMP()),tiebreak_mode='NONE' WHERE id=?",[winner,match.id]);
    }else{
      await conn.query('UPDATE matches SET status=? WHERE id=?',[target,match.id]);
    }
    await conn.query(`INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json) VALUES (?,?,?,?)`,
      [match.id,match.status,target,JSON.stringify({via:'ADMIN',actorUserId:req.admin?.user_id||null})]);
    await conn.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'MATCH_STATE_CHANGED','MATCH',?,?)`,[req.admin?.user_id||null,String(match.id),JSON.stringify({from:match.status,to:target,winnerCityId:winner})]);
    await conn.commit();
    res.json({ok:true,from:match.status,to:target,winnerCityId:winner});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

export default router;
