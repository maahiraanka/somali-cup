import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';
const router=Router();
router.use(requireAdminKey);

router.get('/qualification',async(_req,res,next)=>{
  try{
    const [[season]]=await pool.query("SELECT id,name,status FROM seasons WHERE status='QUALIFICATION' ORDER BY starts_at DESC,id DESC LIMIT 1");
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
    const [[season]]=await conn.query("SELECT id FROM seasons WHERE status='QUALIFICATION' ORDER BY starts_at DESC,id DESC LIMIT 1");
    if(!season) throw Object.assign(new Error('qualification_not_open'),{status:409});
    const [result]=await conn.query(`UPDATE season_cities SET ${fields.join(',')} WHERE season_id=? AND city_id=?`,[...vals,season.id,cityId]);
    if(!result.affectedRows) throw Object.assign(new Error('city_not_in_season'),{status:404});
    for(const [type,delta,meta] of events) await conn.query(`INSERT INTO qualification_events(season_id,city_id,type,delta,metadata_json) VALUES (?,?,?,?,?)`,[season.id,cityId,type,delta,JSON.stringify(meta)]);
    await conn.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (NULL,'QUALIFICATION_CITY_UPDATED','SEASON_CITY',?,?)`,[`${season.id}:${cityId}`,JSON.stringify(req.body)]);
    await conn.commit();
    res.json({ok:true});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
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
        iie.metadata_json,u.public_id,u.display_name
      FROM identity_integrity_events iie
      LEFT JOIN users u ON u.id=iie.user_id
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

router.get('/matches',async(_req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT m.public_id,m.round_code,m.status,m.starts_at,m.lobby_opens_at,m.home_score,m.away_score,m.score_version,
        hc.code home_code,hc.name home_name,ac.code away_code,ac.name away_name
      FROM matches m JOIN cities hc ON hc.id=m.home_city_id JOIN cities ac ON ac.id=m.away_city_id
      ORDER BY m.starts_at DESC,m.id DESC LIMIT 100`);
    res.json({matches:rows});
  }catch(e){next(e)}
});

router.post('/matches',async(req,res,next)=>{
  const homeCode=String(req.body?.homeCityCode||'').trim().toUpperCase();
  const awayCode=String(req.body?.awayCityCode||'').trim().toUpperCase();
  const roundCode=String(req.body?.roundCode||'').trim().slice(0,40);
  const startsAt=req.body?.startsAt;
  const lobbyOpensAt=req.body?.lobbyOpensAt||null;
  if(!homeCode||!awayCode||homeCode===awayCode||!roundCode||!startsAt) return res.status(400).json({error:'invalid_fixture'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[season]]=await conn.query("SELECT id,name,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL') ORDER BY starts_at DESC,id DESC LIMIT 1");
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});
    const [cities]=await conn.query('SELECT id,code FROM cities WHERE code IN (?,?) AND is_active=1',[homeCode,awayCode]);
    if(cities.length!==2) throw Object.assign(new Error('city_not_found'),{status:404});
    const home=cities.find(c=>c.code===homeCode),away=cities.find(c=>c.code===awayCode);
    const publicId=crypto.randomBytes(13).toString('hex');
    const [result]=await conn.query(`INSERT INTO matches(public_id,season_id,round_code,home_city_id,away_city_id,starts_at,lobby_opens_at,status)
      VALUES (?,?,?,?,?,?,?,'SCHEDULED')`,[publicId,season.id,roundCode,home.id,away.id,startsAt,lobbyOpensAt]);
    await conn.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (NULL,'MATCH_CREATED','MATCH',?,?)`,[String(result.insertId),JSON.stringify({publicId,homeCode,awayCode,roundCode,startsAt,lobbyOpensAt})]);
    await conn.commit();
    res.status(201).json({publicId,status:'SCHEDULED'});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

router.patch('/matches/:publicId/state',async(req,res,next)=>{
  const target=String(req.body?.status||'').toUpperCase();
  const transitions={SCHEDULED:['LOBBY','CANCELLED'],LOBBY:['LIVE','CANCELLED'],LIVE:['FINAL','CANCELLED'],FINAL:[],CANCELLED:[]};
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[match]]=await conn.query('SELECT * FROM matches WHERE public_id=? LIMIT 1 FOR UPDATE',[req.params.publicId]);
    if(!match) throw Object.assign(new Error('match_not_found'),{status:404});
    if(!transitions[match.status]?.includes(target)) throw Object.assign(new Error('invalid_match_transition'),{status:409});
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
      [match.id,match.status,target,JSON.stringify({via:'ADMIN_BOOTSTRAP'})]);
    await conn.query(`INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (NULL,'MATCH_STATE_CHANGED','MATCH',?,?)`,[String(match.id),JSON.stringify({from:match.status,to:target,winnerCityId:winner})]);
    await conn.commit();
    res.json({ok:true,from:match.status,to:target,winnerCityId:winner});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

export default router;
