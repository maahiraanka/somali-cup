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
export default router;
