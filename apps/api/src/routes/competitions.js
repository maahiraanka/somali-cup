import { Router } from 'express';
import { pool } from '../db/pool.js';
import { languageFor } from '../competitionLanguage.js';
import { createSession, hashDeviceKey, hashSessionToken, makePublicId } from '../auth.js';

const router=Router();
const clean=(v,max=140)=>typeof v==='string'?v.trim().slice(0,max):'';

const shapeCompetition=row=>({
  id:Number(row.id),
  slug:row.slug,
  name:row.name,
  shortName:row.short_name,
  type:row.competition_type,
  choiceType:row.choice_type,
  status:row.status,
  allowNominations:Boolean(row.allow_nominations),
  startsAt:row.starts_at,
  endsAt:row.ends_at,
  language:languageFor(row.language_preset,row.language_overrides_json)
});

async function optionalIdentity(req,conn=pool){
  const auth=req.get('authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return null;
  const [[row]]=await conn.query(`
    SELECT s.user_id,u.public_id,u.display_name,u.nickname,u.email,u.role
    FROM identity_sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL
      AND s.expires_at>UTC_TIMESTAMP() AND u.status='ACTIVE'
    LIMIT 1
  `,[hashSessionToken(token)]);
  return row||null;
}

router.get('/',async(_req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT cp.id,cp.slug,cp.name,cp.short_name,cp.competition_type,cp.choice_type,cp.language_preset,
        cp.language_overrides_json,cp.status,cp.allow_nominations,cp.starts_at,cp.ends_at,
        (SELECT COUNT(*) FROM competition_choices cc WHERE cc.competition_id=cp.id AND cc.status='ACTIVE') choice_count,
        (SELECT COUNT(*) FROM competition_supporters cs WHERE cs.competition_id=cp.id AND cs.status='ACTIVE') supporter_count
      FROM competitions cp
      WHERE cp.status IN ('OPEN','LIVE','COMPLETE')
      ORDER BY FIELD(cp.status,'LIVE','OPEN','COMPLETE'),cp.starts_at DESC,cp.id DESC
    `);
    res.json({competitions:rows.map(r=>({...shapeCompetition(r),choiceCount:Number(r.choice_count||0),supporterCount:Number(r.supporter_count||0)}))});
  }catch(e){next(e)}
});

router.get('/:slug',async(req,res,next)=>{
  try{
    const slug=clean(req.params.slug,80).toLowerCase();
    const [[competition]]=await pool.query(`
      SELECT id,slug,name,short_name,competition_type,choice_type,language_preset,
        language_overrides_json,status,allow_nominations,starts_at,ends_at
      FROM competitions WHERE slug=? LIMIT 1
    `,[slug]);
    if(!competition)return res.status(404).json({error:'competition_not_found'});
    const [choices]=await pool.query(`
      SELECT cc.id,cc.name,cc.short_name,cc.code,cc.choice_type,cc.status,cc.target,cc.sort_order,cc.metadata_json,
        COUNT(cs.id) supporter_count,
        ROUND(LEAST(100,COUNT(cs.id)*100/NULLIF(cc.target,0)),1) progress_pct
      FROM competition_choices cc
      LEFT JOIN competition_supporters cs
        ON cs.choice_id=cc.id AND cs.competition_id=cc.competition_id AND cs.status='ACTIVE'
      WHERE cc.competition_id=? AND cc.status<>'PAUSED'
      GROUP BY cc.id,cc.name,cc.short_name,cc.code,cc.choice_type,cc.status,cc.target,cc.sort_order,cc.metadata_json
      ORDER BY supporter_count DESC,cc.sort_order,cc.name
    `,[competition.id]);
    res.json({
      competition:shapeCompetition(competition),
      choices:choices.map((c,i)=>({
        ...c,
        id:Number(c.id),
        target:c.target===null?null:Number(c.target),
        supporterCount:Number(c.supporter_count||0),
        progressPct:Number(c.progress_pct||0),
        rank:i+1
      }))
    });
  }catch(e){next(e)}
});

router.get('/:slug/me',async(req,res,next)=>{
  try{
    const slug=clean(req.params.slug,80).toLowerCase();
    const identity=await optionalIdentity(req);
    if(!identity)return res.status(401).json({error:'auth_required'});
    const [[row]]=await pool.query(`
      SELECT cp.slug,cp.name competition_name,cc.code,cc.name choice_name,
        cs.supporter_no,cs.joined_at,
        (SELECT COUNT(*) FROM competition_referrals cr WHERE cr.competition_id=cp.id AND cr.referrer_user_id=cs.user_id) friends_brought
      FROM competitions cp
      JOIN competition_supporters cs ON cs.competition_id=cp.id AND cs.user_id=? AND cs.status='ACTIVE'
      JOIN competition_choices cc ON cc.id=cs.choice_id
      WHERE cp.slug=? LIMIT 1
    `,[identity.user_id,slug]);
    if(!row)return res.status(404).json({error:'not_joined'});
    res.json({support:{...row,supporter_no:Number(row.supporter_no),friends_brought:Number(row.friends_brought||0)},user:identity});
  }catch(e){next(e)}
});

router.post('/:slug/join',async(req,res,next)=>{
  const slug=clean(req.params.slug,80).toLowerCase();
  const displayName=clean(req.body?.displayName,120);
  const choiceCode=clean(req.body?.choiceCode,24).toUpperCase();
  const refPublicId=clean(req.body?.refPublicId,64)||null;
  const deviceKey=clean(req.body?.deviceKey,128);
  if(deviceKey.length<24)return res.status(400).json({error:'device_key_required'});
  if(!choiceCode)return res.status(400).json({error:'choice_required'});
  const deviceHash=hashDeviceKey(deviceKey);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[competition]]=await conn.query(
      "SELECT id,slug,name,status,choice_type,language_preset,language_overrides_json FROM competitions WHERE slug=? LIMIT 1 FOR UPDATE",
      [slug]
    );
    if(!competition)throw Object.assign(new Error('competition_not_found'),{status:404});
    if(!['OPEN','LIVE'].includes(competition.status))throw Object.assign(new Error('competition_not_open'),{status:409});
    const [[choice]]=await conn.query(`
      SELECT id,name,code,target,next_supporter_no
      FROM competition_choices
      WHERE competition_id=? AND code=? AND status='ACTIVE'
      LIMIT 1 FOR UPDATE
    `,[competition.id,choiceCode]);
    if(!choice)throw Object.assign(new Error('choice_not_found'),{status:404});

    const [[claimed]]=await conn.query(`
      SELECT cdc.user_id,cc.code,cc.name
      FROM competition_device_claims cdc
      JOIN competition_supporters cs ON cs.competition_id=cdc.competition_id AND cs.user_id=cdc.user_id AND cs.status='ACTIVE'
      JOIN competition_choices cc ON cc.id=cs.choice_id
      WHERE cdc.competition_id=? AND cdc.device_hash=?
      LIMIT 1 FOR UPDATE
    `,[competition.id,deviceHash]);
    if(claimed){
      const err=Object.assign(new Error('device_already_joined'),{status:409});
      err.payload={error:'device_already_joined',choice:{code:claimed.code,name:claimed.name}};
      throw err;
    }

    let identity=await optionalIdentity(req,conn);
    let userId=identity?.user_id||null;
    let createdUser=false;
    if(userId){
      const [[existing]]=await conn.query(
        'SELECT cc.code,cc.name FROM competition_supporters cs JOIN competition_choices cc ON cc.id=cs.choice_id WHERE cs.competition_id=? AND cs.user_id=? AND cs.status=\'ACTIVE\' LIMIT 1',
        [competition.id,userId]
      );
      if(existing){
        const err=Object.assign(new Error('already_joined'),{status:409});
        err.payload={error:'already_joined',choice:existing};
        throw err;
      }
    }else{
      if(displayName.length<2)throw Object.assign(new Error('display_name_required'),{status:400});
      const publicId=makePublicId();
      const [u]=await conn.query(`
        INSERT INTO users(public_id,display_name,nickname,role,status,last_seen_at)
        VALUES (?,?,?,'PLAYER','ACTIVE',UTC_TIMESTAMP())
      `,[publicId,displayName,displayName]);
      userId=u.insertId;
      identity={user_id:userId,public_id:publicId,display_name:displayName,nickname:displayName,role:'PLAYER'};
      createdUser=true;
    }

    const supporterNo=Math.max(1,Number(choice.next_supporter_no||1));
    await conn.query('UPDATE competition_choices SET next_supporter_no=? WHERE id=?',[supporterNo+1,choice.id]);
    await conn.query(`
      INSERT INTO competition_supporters(competition_id,choice_id,user_id,supporter_no)
      VALUES (?,?,?,?)
    `,[competition.id,choice.id,userId,supporterNo]);
    await conn.query(
      'INSERT INTO competition_device_claims(competition_id,user_id,device_hash) VALUES (?,?,?)',
      [competition.id,userId,deviceHash]
    );

    let referrer=null;
    if(refPublicId){
      [[referrer]]=await conn.query(`
        SELECT u.id,u.public_id
        FROM users u
        JOIN competition_supporters cs ON cs.user_id=u.id AND cs.competition_id=? AND cs.choice_id=? AND cs.status='ACTIVE'
        WHERE u.public_id=? AND u.status='ACTIVE'
        LIMIT 1
      `,[competition.id,choice.id,refPublicId]);
      if(referrer&&Number(referrer.id)!==Number(userId)){
        await conn.query(`
          INSERT IGNORE INTO competition_referrals(competition_id,choice_id,referrer_user_id,referred_user_id)
          VALUES (?,?,?,?)
        `,[competition.id,choice.id,referrer.id,userId]);
      }
    }

    const [[stats]]=await conn.query(`
      SELECT COUNT(*) supporter_count
      FROM competition_supporters
      WHERE competition_id=? AND choice_id=? AND status='ACTIVE'
    `,[competition.id,choice.id]);
    await conn.commit();

    let session=null;
    if(createdUser)session=await createSession(userId,req.get('user-agent')||'');
    res.status(201).json({
      token:session?.token||null,
      expiresAt:session?.expiresAt||null,
      user:{publicId:identity.public_id,displayName:identity.display_name,nickname:identity.nickname,role:identity.role},
      competition:shapeCompetition(competition),
      choice:{
        id:Number(choice.id),code:choice.code,name:choice.name,
        supporterNo,
        supporterCount:Number(stats?.supporter_count||0),
        target:choice.target===null?null:Number(choice.target)
      },
      friendAdded:Boolean(referrer)
    });
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json(e.payload||{error:e.message});
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'already_joined'});
    next(e);
  }finally{conn.release()}
});

router.post('/:slug/nominations',async(req,res,next)=>{
  try{
    const slug=clean(req.params.slug,80).toLowerCase();
    const name=clean(req.body?.name,140);
    const location=clean(req.body?.location,160)||null;
    const note=clean(req.body?.note,500)||null;
    if(name.length<2)return res.status(400).json({error:'name_required'});
    const [[competition]]=await pool.query('SELECT id,allow_nominations,status FROM competitions WHERE slug=? LIMIT 1',[slug]);
    if(!competition)return res.status(404).json({error:'competition_not_found'});
    if(!competition.allow_nominations)return res.status(409).json({error:'nominations_not_open'});
    if(!['OPEN','LIVE'].includes(competition.status))return res.status(409).json({error:'competition_not_open'});
    const [[duplicate]]=await pool.query(
      "SELECT id FROM competition_nominations WHERE competition_id=? AND LOWER(name)=LOWER(?) AND status IN ('PENDING','APPROVED') LIMIT 1",
      [competition.id,name]
    );
    if(duplicate)return res.status(409).json({error:'already_suggested'});
    const [result]=await pool.query(
      'INSERT INTO competition_nominations(competition_id,name,location_text,note) VALUES (?,?,?,?)',
      [competition.id,name,location,note]
    );
    res.status(201).json({ok:true,nominationId:Number(result.insertId),message:'Thanks. We will review it.'});
  }catch(e){next(e)}
});

export default router;