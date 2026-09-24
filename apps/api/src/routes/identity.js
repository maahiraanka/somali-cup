import { Router } from 'express';
import { pool } from '../db/pool.js';
import { createSession, makePublicId, requireSession, hashSessionToken } from '../auth.js';

const router=Router();
const clean=(v,max=120)=>typeof v==='string'?v.trim().slice(0,max):'';

async function activeSeason(conn=pool){
  const [[season]]=await conn.query("SELECT id,name,status FROM seasons WHERE status='QUALIFICATION' ORDER BY starts_at DESC,id DESC LIMIT 1");
  return season;
}

router.post('/join', async (req,res,next)=>{
  const displayName=clean(req.body?.displayName,120);
  const nickname=clean(req.body?.nickname||displayName,80);
  const email=clean(req.body?.email,190).toLowerCase()||null;
  const cityCode=clean(req.body?.cityCode,12).toUpperCase();
  const source=clean(req.body?.source,24)||'direct';
  const referredBy=clean(req.body?.referredBy,80)||null;
  if(displayName.length<2) return res.status(400).json({error:'display_name_required'});
  if(!/^[A-Z0-9_-]{2,12}$/.test(cityCode)) return res.status(400).json({error:'city_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('qualification_not_open'),{status:409});

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

    const [[city]]=await conn.query(`SELECT c.id,c.name,c.country,c.code,sc.is_open,sc.status
      FROM cities c JOIN season_cities sc ON sc.city_id=c.id AND sc.season_id=?
      WHERE c.code=? AND c.is_active=1 LIMIT 1`,[season.id,cityCode]);
    if(!city || !city.is_open || city.status==='ELIMINATED') throw Object.assign(new Error('city_not_open'),{status:409});
    if(email){
      const [[existing]]=await conn.query('SELECT id FROM users WHERE email=? LIMIT 1',[email]);
      if(existing) throw Object.assign(new Error('email_already_registered'),{status:409});
    }
    const publicId=makePublicId();
    const [u]=await conn.query(`INSERT INTO users(public_id,display_name,nickname,email,home_city_id,role,status,last_seen_at)
      VALUES (?,?,?,?,?,'PLAYER','ACTIVE',UTC_TIMESTAMP())`,[publicId,displayName,nickname,email,city.id]);
    await conn.query(`INSERT INTO city_memberships(user_id,season_id,city_id,status,verification_status,verification_method,verified_at)
      VALUES (?,?,?,'ACTIVE','VERIFIED','DEVICE_SESSION',UTC_TIMESTAMP())`,[u.insertId,season.id,city.id]);
    await conn.query(`INSERT INTO qualification_events(season_id,city_id,user_id,type,delta,metadata_json)
      VALUES (?,?,?,'SUPPORTER_VERIFIED',1,JSON_OBJECT('method','DEVICE_SESSION','source',?,'referredBy',?))`,[season.id,city.id,u.insertId,source,referredBy]);
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
        supporterNumber,
        verified_supporters:supporterNumber,
        qualification_target:qualificationTarget,
        progress_pct:qualificationTarget?Math.min(100,Number((supporterNumber*100/qualificationTarget).toFixed(1))):0
      },
      rivalry
    });
  }catch(e){
    await conn.rollback();
    if(e.status) return res.status(e.status).json(e.payload||{error:e.message});
    next(e);
  }finally{conn.release()}
});

router.get('/me',requireSession,async(req,res,next)=>{
  try{
    const [[membership]]=await pool.query(`SELECT cm.season_id,cm.city_id,cm.status,cm.verification_status,cm.joined_at,c.code,c.name,c.country,s.name season_name,s.status season_status
      FROM city_memberships cm JOIN cities c ON c.id=cm.city_id JOIN seasons s ON s.id=cm.season_id
      WHERE cm.user_id=? ORDER BY cm.joined_at DESC LIMIT 1`,[req.identity.user_id]);
    res.json({user:{publicId:req.identity.public_id,displayName:req.identity.display_name,nickname:req.identity.nickname,email:req.identity.email,role:req.identity.role},membership});
  }catch(e){next(e)}
});

router.post('/logout',requireSession,async(req,res,next)=>{
  try{await pool.query('UPDATE identity_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[req.identity.session_id]);res.json({ok:true})}catch(e){next(e)}
});

export default router;
