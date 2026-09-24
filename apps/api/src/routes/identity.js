import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { createSession, makePublicId, requireSession, hashSessionToken, hashDeviceKey } from '../auth.js';

const router=Router();
const clean=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';
const hashUa=(v)=>v?crypto.createHash('sha256').update(v).digest('hex'):null;
const networkHash=(req)=>{
  if(!config.integritySecret)return null;
  const raw=String(req.ip||req.socket?.remoteAddress||'');
  return raw?crypto.createHmac('sha256',config.integritySecret).update(raw).digest('hex'):null;
};

async function activeSeason(conn=pool){
  const [[season]]=await conn.query("SELECT id,name,status FROM seasons WHERE status='QUALIFICATION' ORDER BY starts_at DESC,id DESC LIMIT 1");
  return season;
}

router.post('/join', async (req,res,next)=>{
  try{
    const [[op]]=await pool.query("SELECT setting_value FROM platform_settings WHERE setting_key='JOIN_OPERATIONS_MODE' LIMIT 1");
    if(op?.setting_value==='FROZEN')return res.status(503).json({error:'joins_temporarily_frozen'});
  }catch(e){return next(e)}

  const displayName=clean(req.body?.displayName,120);
  const nickname=clean(req.body?.nickname||displayName,80);
  const email=clean(req.body?.email,190).toLowerCase()||null;
  const cityCode=clean(req.body?.cityCode,12).toUpperCase();
  const source=clean(req.body?.source,24)||'direct';
  const referredBy=clean(req.body?.referredBy,80)||null;
  const refPublicId=clean(req.body?.refPublicId,64)||null;
  const deviceKey=clean(req.body?.deviceKey,128);
  if(deviceKey.length<24) return res.status(400).json({error:'device_key_required'});
  const deviceHash=hashDeviceKey(deviceKey);
  const netHash=networkHash(req);
  const uaHash=hashUa(req.get('user-agent')||'');
  if(displayName.length<2) return res.status(400).json({error:'display_name_required'});
  if(!/^[A-Z0-9_-]{2,12}$/.test(cityCode)) return res.status(400).json({error:'city_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('qualification_not_open'),{status:409});
    await conn.query(`INSERT INTO identity_integrity_events(season_id,event_type,device_hash,network_hash,user_agent_hash,metadata_json)
      VALUES (?,'JOIN_ATTEMPT',?,?,?,JSON_OBJECT('cityCode',?,'source',?))`,[season.id,deviceHash,netHash,uaHash,cityCode,source]);
    if(netHash){
      const [[burst]]=await conn.query(`SELECT COUNT(*) total FROM identity_integrity_events
        WHERE event_type='JOIN_ATTEMPT' AND network_hash=? AND created_at>=UTC_TIMESTAMP()-INTERVAL 10 MINUTE`,[netHash]);
      if(Number(burst?.total||0)===5){
        await conn.query(`INSERT INTO identity_integrity_events(season_id,event_type,network_hash,user_agent_hash,metadata_json)
          VALUES (?,'NETWORK_BURST_SIGNAL',?,?,JSON_OBJECT('windowMinutes',10,'attempts',5))`,[season.id,netHash,uaHash]);
      }
    }

    // A valid existing device session is already a supporter identity.
    // Never create a second user/membership for the same active season.
    const auth=req.get('authorization')||'';
    const existingToken=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(existingToken){
      const tokenHash=hashSessionToken(existingToken);
      const [[existingIdentity]]=await conn.query(`
        SELECT s.user_id,u.public_id,u.display_name,u.nickname,u.email,u.role
        FROM identity_sessions s
        JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=? AND s.revoked_at IS NULL
          AND s.expires_at>UTC_TIMESTAMP() AND u.status='ACTIVE'
        LIMIT 1`,[tokenHash]);

      if(!existingIdentity){
        throw Object.assign(new Error('invalid_session'),{status:401});
      }

      const [[existingMembership]]=await conn.query(`
        SELECT cm.city_id,c.code,c.name,c.country
        FROM city_memberships cm
        JOIN cities c ON c.id=cm.city_id
        WHERE cm.user_id=? AND cm.season_id=? AND cm.status='ACTIVE'
        LIMIT 1`,[existingIdentity.user_id,season.id]);

      if(existingMembership){
        const err=Object.assign(new Error('already_representing_city'),{status:409});
        err.payload={
          error:'already_representing_city',
          city:{
            id:existingMembership.city_id,
            code:existingMembership.code,
            name:existingMembership.name,
            country:existingMembership.country
          }
        };
        throw err;
      }
    }

    if(deviceHash){
      const [[claimed]]=await conn.query(`
        SELECT sdc.user_id,c.code,c.name,c.country
        FROM season_device_claims sdc
        JOIN city_memberships cm ON cm.user_id=sdc.user_id AND cm.season_id=sdc.season_id AND cm.status='ACTIVE'
        JOIN cities c ON c.id=cm.city_id
        WHERE sdc.season_id=? AND sdc.device_hash=?
        LIMIT 1 FOR UPDATE
      `,[season.id,deviceHash]);
      if(claimed){
        await conn.query(`INSERT INTO identity_integrity_events(season_id,user_id,event_type,device_hash,network_hash,user_agent_hash,metadata_json)
          VALUES (?,?,'DUPLICATE_DEVICE_BLOCKED',?,?,?,JSON_OBJECT('attemptedCity',?,'existingCity',?))`,
          [season.id,claimed.user_id,deviceHash,netHash,uaHash,cityCode,claimed.code]);
        const err=Object.assign(new Error('device_already_registered'),{status:409});
        err.payload={error:'device_already_registered',city:{code:claimed.code,name:claimed.name,country:claimed.country}};
        throw err;
      }
    }

    const [[city]]=await conn.query(`SELECT c.id,c.name,c.country,c.code,sc.is_open,sc.status,sc.next_goal_number
      FROM cities c JOIN season_cities sc ON sc.city_id=c.id AND sc.season_id=?
      WHERE c.code=? AND c.is_active=1 LIMIT 1 FOR UPDATE`,[season.id,cityCode]);
    if(!city || !city.is_open || city.status==='ELIMINATED') throw Object.assign(new Error('city_not_open'),{status:409});
    let referrer=null;
    if(refPublicId){
      const [[candidate]]=await conn.query(`
        SELECT u.id,u.public_id,u.display_name,u.nickname,cm.city_id
        FROM users u
        JOIN city_memberships cm ON cm.user_id=u.id
        WHERE u.public_id=? AND u.status='ACTIVE'
          AND cm.season_id=? AND cm.status='ACTIVE'
          AND cm.verification_status='VERIFIED'
        LIMIT 1
      `,[refPublicId,season.id]);
      if(candidate && Number(candidate.city_id)===Number(city.id)) referrer=candidate;
    }
    if(email){
      const [[existing]]=await conn.query('SELECT id FROM users WHERE email=? LIMIT 1',[email]);
      if(existing) throw Object.assign(new Error('email_already_registered'),{status:409});
    }
    const publicId=makePublicId();
    const goalNumber=Math.max(1,Number(city.next_goal_number||1));
    const [u]=await conn.query(`INSERT INTO users(public_id,display_name,nickname,email,home_city_id,role,status,last_seen_at)
      VALUES (?,?,?,?,?,'PLAYER','ACTIVE',UTC_TIMESTAMP())`,[publicId,displayName,nickname,email,city.id]);
    await conn.query(`UPDATE season_cities SET next_goal_number=? WHERE season_id=? AND city_id=?`,[goalNumber+1,season.id,city.id]);
    await conn.query(`INSERT INTO city_memberships(user_id,season_id,city_id,status,verification_status,verification_method,verified_at,goal_number)
      VALUES (?,?,?,'ACTIVE','VERIFIED','DEVICE_SESSION',UTC_TIMESTAMP(),?)`,[u.insertId,season.id,city.id,goalNumber]);
    if(deviceHash){
      await conn.query(`INSERT INTO season_device_claims(season_id,user_id,device_hash) VALUES (?,?,?)`,[season.id,u.insertId,deviceHash]);
      await conn.query(`INSERT INTO identity_integrity_events(season_id,user_id,event_type,device_hash,network_hash,user_agent_hash,metadata_json)
        VALUES (?,?,'DEVICE_CLAIMED',?,?,?,JSON_OBJECT('cityCode',?))`,[season.id,u.insertId,deviceHash,netHash,uaHash,city.code]);
    }
    if(referrer && Number(referrer.id)!==Number(u.insertId)){
      await conn.query(`INSERT IGNORE INTO qualification_referrals(season_id,city_id,referrer_user_id,referred_user_id,source)
        VALUES (?,?,?,?,?)`,[season.id,city.id,referrer.id,u.insertId,source]);
    }
    await conn.query(`INSERT INTO qualification_events(season_id,city_id,user_id,type,delta,metadata_json)
      VALUES (?,?,?,'SUPPORTER_VERIFIED',1,JSON_OBJECT('method','DEVICE_SESSION','source',?,'referredBy',?,'refPublicId',?))`,[season.id,city.id,u.insertId,source,referredBy,referrer?.public_id||null]);
    const [[cityStats]]=await conn.query(`
      SELECT sc.qualification_target,
             COUNT(cm.id) verified_supporters
      FROM season_cities sc
      LEFT JOIN city_memberships cm
        ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id
       AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
      WHERE sc.season_id=? AND sc.city_id=?
      GROUP BY sc.qualification_target
    `,[season.id,city.id]);
    const [raceRows]=await conn.query(`
      SELECT c.id,c.code,c.name,
             COUNT(cm.id) verified_supporters
      FROM season_cities sc
      JOIN cities c ON c.id=sc.city_id AND c.is_active=1
      LEFT JOIN city_memberships cm
        ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id
       AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
      WHERE sc.season_id=?
      GROUP BY c.id,c.code,c.name,sc.sort_order
      ORDER BY verified_supporters DESC,sc.sort_order ASC,c.name ASC
    `,[season.id]);
    const cityIndex=raceRows.findIndex(r=>Number(r.id)===Number(city.id));
    const rivalRow=cityIndex===0?raceRows[1]:raceRows[Math.max(0,cityIndex-1)];
    const currentGoals=Number(cityStats?.verified_supporters||0);
    const rivalGoals=Number(rivalRow?.verified_supporters||0);
    const rivalry=!rivalRow?null:{
      cityRank:cityIndex>=0?cityIndex+1:null,
      rival:{code:rivalRow.code,name:rivalRow.name,goals:rivalGoals},
      relation:currentGoals>rivalGoals?'LEADING':currentGoals<rivalGoals?'BEHIND':'TIED',
      gap:Math.abs(currentGoals-rivalGoals)
    };
    const [[impact]]=await conn.query(`
      WITH RECURSIVE tree AS (
        SELECT referred_user_id,1 depth
        FROM qualification_referrals
        WHERE season_id=? AND referrer_user_id=?
        UNION ALL
        SELECT qr.referred_user_id,t.depth+1
        FROM qualification_referrals qr
        JOIN tree t ON qr.referrer_user_id=t.referred_user_id
        WHERE qr.season_id=? AND t.depth<12
      )
      SELECT
        (SELECT COUNT(*) FROM qualification_referrals WHERE season_id=? AND referrer_user_id=?) assists,
        COUNT(*) branch
      FROM tree
    `,[season.id,u.insertId,season.id,season.id,u.insertId]);
    await conn.commit();
    const session=await createSession(u.insertId,req.get('user-agent')||'');
    const supporterNumber=Number(cityStats?.verified_supporters||0);
    const qualificationTarget=Number(cityStats?.qualification_target||0);
    res.status(201).json({
      token:session.token,expiresAt:session.expiresAt,
      user:{publicId,displayName,nickname,email,role:'PLAYER'},
      season:{id:season.id,name:season.name,status:season.status},
      city:{
        id:city.id,code:city.code,name:city.name,country:city.country,
        goalNumber,
        supporterNumber,
        verified_supporters:supporterNumber,
        qualification_target:qualificationTarget,
        progress_pct:qualificationTarget?Math.min(100,Number((supporterNumber*100/qualificationTarget).toFixed(1))):0
      },
      rivalry,
      impact:{goal:1,assists:Number(impact?.assists||0),branch:Number(impact?.branch||0)}
    });
  }catch(e){
    await conn.rollback();
    if(e.status) return res.status(e.status).json(e.payload||{error:e.message});
    if(e.code==='ER_DUP_ENTRY' && deviceHash) return res.status(409).json({error:'device_already_registered'});
    next(e);
  }finally{conn.release()}
});

router.post('/recover-device',async(req,res,next)=>{
  const deviceKey=clean(req.body?.deviceKey,128);
  if(deviceKey.length<24) return res.status(400).json({error:'device_key_required'});
  const deviceHash=hashDeviceKey(deviceKey);
  try{
    const [[claim]]=await pool.query(`
      SELECT sdc.user_id,sdc.season_id,u.public_id,u.status,c.code,c.name
      FROM season_device_claims sdc
      JOIN users u ON u.id=sdc.user_id
      JOIN city_memberships cm ON cm.user_id=sdc.user_id AND cm.season_id=sdc.season_id AND cm.status='ACTIVE'
      JOIN cities c ON c.id=cm.city_id
      JOIN seasons s ON s.id=sdc.season_id
      WHERE sdc.device_hash=? AND u.status='ACTIVE'
        AND s.status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL')
      ORDER BY sdc.id DESC
      LIMIT 1
    `,[deviceHash]);
    if(!claim) return res.status(404).json({error:'device_identity_not_found'});
    const session=await createSession(claim.user_id,req.get('user-agent')||'');
    await pool.query('UPDATE season_device_claims SET last_seen_at=UTC_TIMESTAMP() WHERE season_id=? AND user_id=? AND device_hash=?',[claim.season_id,claim.user_id,deviceHash]);
    await pool.query(`INSERT INTO identity_integrity_events(season_id,user_id,event_type,device_hash,network_hash,user_agent_hash,metadata_json)
      VALUES (?,?,'DEVICE_RECOVERED',?,?,?,JSON_OBJECT('cityCode',?))`,
      [claim.season_id,claim.user_id,deviceHash,networkHash(req),hashUa(req.get('user-agent')||''),claim.code]);
    res.json({recovered:true,token:session.token,expiresAt:session.expiresAt,city:{code:claim.code,name:claim.name}});
  }catch(e){next(e)}
});

router.get('/me',requireSession,async(req,res,next)=>{
  try{
    const [[membership]]=await pool.query(`SELECT cm.season_id,cm.city_id,cm.status,cm.verification_status,cm.goal_number,cm.joined_at,c.code,c.name,c.country,s.name season_name,s.status season_status
      FROM city_memberships cm JOIN cities c ON c.id=cm.city_id JOIN seasons s ON s.id=cm.season_id
      WHERE cm.user_id=? ORDER BY cm.joined_at DESC LIMIT 1`,[req.identity.user_id]);
    let qualificationImpact={goal:membership?.verification_status==='VERIFIED'?1:0,goalNumber:Number(membership?.goal_number||0),assists:0,branch:0};
    if(membership?.season_id){
      const [[impact]]=await pool.query(`
        WITH RECURSIVE tree AS (
          SELECT referred_user_id,1 depth
          FROM qualification_referrals
          WHERE season_id=? AND referrer_user_id=?
          UNION ALL
          SELECT qr.referred_user_id,t.depth+1
          FROM qualification_referrals qr
          JOIN tree t ON qr.referrer_user_id=t.referred_user_id
          WHERE qr.season_id=? AND t.depth<12
        )
        SELECT
          (SELECT COUNT(*) FROM qualification_referrals WHERE season_id=? AND referrer_user_id=?) assists,
          COUNT(*) branch
        FROM tree
      `,[membership.season_id,req.identity.user_id,membership.season_id,membership.season_id,req.identity.user_id]);
      const [[latestAssist]]=await pool.query(`
        SELECT qr.id,u.display_name,u.nickname,qr.created_at
        FROM qualification_referrals qr
        JOIN users u ON u.id=qr.referred_user_id
        WHERE qr.season_id=? AND qr.referrer_user_id=?
        ORDER BY qr.id DESC
        LIMIT 1
      `,[membership.season_id,req.identity.user_id]);
      qualificationImpact={
        ...qualificationImpact,
        assists:Number(impact?.assists||0),
        branch:Number(impact?.branch||0),
        latestAssist:latestAssist?{
          id:Number(latestAssist.id),
          name:latestAssist.nickname||latestAssist.display_name||'Someone',
          createdAt:latestAssist.created_at
        }:null
      };
    }
    let deviceClaim=null;
    if(membership?.season_id){
      [[deviceClaim]]=await pool.query('SELECT id FROM season_device_claims WHERE season_id=? AND user_id=? LIMIT 1',[membership.season_id,req.identity.user_id]);
    }
    res.json({user:{publicId:req.identity.public_id,displayName:req.identity.display_name,nickname:req.identity.nickname,email:req.identity.email,role:req.identity.role},membership,qualificationImpact,integrity:{level:deviceClaim?'DEVICE_BOUND':'SESSION_ONLY'}});
  }catch(e){next(e)}
});

router.post('/logout',requireSession,async(req,res,next)=>{
  try{await pool.query('UPDATE identity_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[req.identity.session_id]);res.json({ok:true})}catch(e){next(e)}
});

export default router;
