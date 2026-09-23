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
  if(displayName.length<2) return res.status(400).json({error:'display_name_required'});
  if(!/^[A-Z0-9_-]{2,12}$/.test(cityCode)) return res.status(400).json({error:'city_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('qualification_not_open'),{status:409});
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
      VALUES (?,?,?,'SUPPORTER_VERIFIED',1,JSON_OBJECT('method','DEVICE_SESSION'))`,[season.id,city.id,u.insertId]);
    await conn.commit();
    const session=await createSession(u.insertId,req.get('user-agent')||'');
    res.status(201).json({
      token:session.token,expiresAt:session.expiresAt,
      user:{publicId,displayName,nickname,email,role:'PLAYER'},
      season:{id:season.id,name:season.name,status:season.status},
      city:{id:city.id,code:city.code,name:city.name,country:city.country}
    });
  }catch(e){await conn.rollback(); if(e.status) return res.status(e.status).json({error:e.message}); next(e)}finally{conn.release()}
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
