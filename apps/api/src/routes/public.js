import { Router } from 'express';
import { pool } from '../db/pool.js';
const router = Router();
router.get('/runtime',async(_req,res,next)=>{
  try{
    const [[setting]]=await pool.query("SELECT setting_value FROM platform_settings WHERE setting_key='PUBLIC_LAUNCH_MODE' LIMIT 1");
    res.json({launchMode:setting?.setting_value||'COMING_SOON'});
  }catch(e){next(e)}
});

router.get('/snapshot', async (_req,res,next)=>{
  try {
    const [[season]] = await pool.query("SELECT id,name,status FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL') ORDER BY starts_at DESC,id DESC LIMIT 1");
    const [[cities]] = await pool.query("SELECT COUNT(*) total FROM cities WHERE is_active=1");
    const [[players]] = await pool.query("SELECT COUNT(*) total FROM city_memberships WHERE status='ACTIVE' AND verification_status='VERIFIED'");
    const [[live]] = await pool.query("SELECT COUNT(*) total FROM matches WHERE status='LIVE'");
    res.json({season:season?.name || 'Somali Cup',seasonStatus:season?.status||null,cities:cities?.total || 0,players:players?.total || 0,liveMatches:live?.total || 0});
  } catch (e) {
    next(e);
  }
});
export default router;
