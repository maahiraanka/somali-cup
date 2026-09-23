import { Router } from 'express';
import { pool } from '../db/pool.js';
const router=Router();

router.get('/',async(_req,res,next)=>{
  try{
    const [[season]]=await pool.query("SELECT id,name,status,starts_at,ends_at FROM seasons WHERE status='QUALIFICATION' ORDER BY starts_at DESC,id DESC LIMIT 1");
    if(!season) return res.json({season:null,standings:[]});
    const [rows]=await pool.query(`
      SELECT c.id,c.code,c.name,c.country,c.tier,sc.status,sc.qualification_target,sc.is_open,
             COUNT(cm.id) verified_supporters,
             ROUND(LEAST(100,COUNT(cm.id)*100/NULLIF(sc.qualification_target,0)),1) progress_pct
      FROM season_cities sc
      JOIN cities c ON c.id=sc.city_id
      LEFT JOIN city_memberships cm ON cm.season_id=sc.season_id AND cm.city_id=sc.city_id AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
      WHERE sc.season_id=? AND c.is_active=1
      GROUP BY c.id,c.code,c.name,c.country,c.tier,sc.status,sc.qualification_target,sc.is_open,sc.sort_order
      ORDER BY verified_supporters DESC,sc.sort_order ASC,c.name ASC`,[season.id]);
    res.json({season,standings:rows.map((r,i)=>({...r,rank:i+1}))});
  }catch(e){next(e)}
});

router.get('/cities/:code',async(req,res,next)=>{
  try{
    const code=String(req.params.code||'').toUpperCase();
    const [[season]]=await pool.query("SELECT id,name,status FROM seasons WHERE status='QUALIFICATION' ORDER BY starts_at DESC,id DESC LIMIT 1");
    if(!season) return res.status(404).json({error:'qualification_not_open'});
    const [[city]]=await pool.query(`
      SELECT c.id,c.code,c.name,c.country,c.tier,sc.status,sc.qualification_target,sc.is_open,
             COUNT(cm.id) verified_supporters,
             ROUND(LEAST(100,COUNT(cm.id)*100/NULLIF(sc.qualification_target,0)),1) progress_pct
      FROM cities c JOIN season_cities sc ON sc.city_id=c.id AND sc.season_id=?
      LEFT JOIN city_memberships cm ON cm.season_id=sc.season_id AND cm.city_id=c.id AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
      WHERE c.code=? AND c.is_active=1
      GROUP BY c.id,c.code,c.name,c.country,c.tier,sc.status,sc.qualification_target,sc.is_open`,[season.id,code]);
    if(!city) return res.status(404).json({error:'city_not_found'});
    const [recent]=await pool.query(`SELECT u.nickname,u.display_name,cm.joined_at FROM city_memberships cm JOIN users u ON u.id=cm.user_id
      WHERE cm.season_id=? AND cm.city_id=? AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
      ORDER BY cm.joined_at DESC LIMIT 12`,[season.id,city.id]);
    res.json({season,city,recentSupporters:recent});
  }catch(e){next(e)}
});
export default router;
