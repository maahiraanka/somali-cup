import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { makePublicId, makeAdminToken, requireAdminKey } from '../auth.js';

const router=Router();
const clean=(v,max=190)=>typeof v==='string'?v.trim().slice(0,max):'';
const hashToken=v=>crypto.createHash('sha256').update(v).digest('hex');
const uaHash=v=>v?crypto.createHash('sha256').update(v).digest('hex'):null;

function passwordParts(password,salt=null){
  const useSalt=salt||crypto.randomBytes(16).toString('hex');
  const hash=crypto.scryptSync(password,useSalt,64).toString('hex');
  return {salt:useSalt,hash};
}
function safeEqualHex(a,b){
  try{
    const aa=Buffer.from(a,'hex'),bb=Buffer.from(b,'hex');
    return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
  }catch{return false}
}
async function sessionFor(userId,userAgent=''){
  const token=makeAdminToken();
  const expiresAt=new Date(Date.now()+12*60*60*1000);
  await pool.query(
    'INSERT INTO admin_sessions(user_id,token_hash,user_agent_hash,expires_at) VALUES (?,?,?,?)',
    [userId,hashToken(token),uaHash(userAgent),expiresAt]
  );
  return {token,expiresAt};
}

router.post('/bootstrap',async(req,res,next)=>{
  const expected=process.env.ADMIN_BOOTSTRAP_KEY||'';
  const supplied=req.get('x-admin-key')||'';
  if(!expected||supplied!==expected)return res.status(403).json({error:'admin_bootstrap_key_required'});
  const displayName=clean(req.body?.displayName,120);
  const email=clean(req.body?.email,190).toLowerCase();
  const password=String(req.body?.password||'');
  if(displayName.length<2||!email.includes('@')||password.length<10){
    return res.status(400).json({error:'display_name_email_and_10_char_password_required'});
  }
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[existingAdmin]]=await conn.query('SELECT COUNT(*) total FROM admin_credentials');
    if(Number(existingAdmin.total)>0) throw Object.assign(new Error('admin_already_bootstrapped'),{status:409});

    let [[user]]=await conn.query('SELECT id,role,status FROM users WHERE email=? LIMIT 1 FOR UPDATE',[email]);
    let userId;
    if(user){
      if(user.status!=='ACTIVE')throw Object.assign(new Error('user_not_active'),{status:409});
      userId=user.id;
      await conn.query("UPDATE users SET role='ADMIN',display_name=? WHERE id=?",[displayName,userId]);
    }else{
      const [created]=await conn.query(
        "INSERT INTO users(public_id,display_name,email,role,status,last_seen_at) VALUES (?,?,?,'ADMIN','ACTIVE',UTC_TIMESTAMP())",
        [makePublicId(),displayName,email]
      );
      userId=created.insertId;
    }
    const {salt,hash}=passwordParts(password);
    await conn.query('INSERT INTO admin_credentials(user_id,password_salt,password_hash) VALUES (?,?,?)',[userId,salt,hash]);
    await conn.query(
      "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,'ADMIN_BOOTSTRAPPED','USER',?,JSON_OBJECT('email',?))",
      [userId,String(userId),email]
    );
    await conn.commit();
    const session=await sessionFor(userId,req.get('user-agent')||'');
    res.status(201).json({ok:true,token:session.token,expiresAt:session.expiresAt,user:{displayName,email,role:'ADMIN'}});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.post('/login',async(req,res,next)=>{
  const email=clean(req.body?.email,190).toLowerCase();
  const password=String(req.body?.password||'');
  try{
    const [[row]]=await pool.query(`
      SELECT u.id,u.public_id,u.display_name,u.email,u.role,u.status,
        ac.password_salt,ac.password_hash,ac.failed_attempts,ac.locked_until
      FROM users u
      JOIN admin_credentials ac ON ac.user_id=u.id
      WHERE u.email=? AND u.role='ADMIN'
      LIMIT 1
    `,[email]);
    if(!row)return res.status(401).json({error:'invalid_admin_credentials'});
    if(row.status!=='ACTIVE')return res.status(403).json({error:'admin_not_active'});
    if(row.locked_until&&new Date(row.locked_until).getTime()>Date.now()){
      return res.status(429).json({error:'admin_temporarily_locked'});
    }
    const candidate=passwordParts(password,row.password_salt).hash;
    if(!safeEqualHex(candidate,row.password_hash)){
      const attempts=Number(row.failed_attempts||0)+1;
      const lock=attempts>=5;
      await pool.query(
        'UPDATE admin_credentials SET failed_attempts=?,locked_until=? WHERE user_id=?',
        [lock?0:attempts,lock?new Date(Date.now()+15*60*1000):null,row.id]
      );
      return res.status(401).json({error:'invalid_admin_credentials'});
    }
    await pool.query('UPDATE admin_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=?',[row.id]);
    const session=await sessionFor(row.id,req.get('user-agent')||'');
    await pool.query('UPDATE users SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[row.id]);
    res.json({token:session.token,expiresAt:session.expiresAt,user:{publicId:row.public_id,displayName:row.display_name,email:row.email,role:row.role}});
  }catch(e){next(e)}
});

router.get('/me',requireAdminKey,async(req,res)=>{
  if(req.admin?.bootstrap)return res.json({bootstrap:true,user:null});
  res.json({user:{publicId:req.admin.public_id,displayName:req.admin.display_name,email:req.admin.email,role:req.admin.role}});
});

router.post('/logout',requireAdminKey,async(req,res,next)=>{
  try{
    if(req.admin?.session_id)await pool.query('UPDATE admin_sessions SET revoked_at=UTC_TIMESTAMP() WHERE id=?',[req.admin.session_id]);
    res.json({ok:true});
  }catch(e){next(e)}
});

export default router;
