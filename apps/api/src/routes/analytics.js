import { Router } from 'express';
import { pool } from '../db/pool.js';
import { hashSessionToken, requireAdminKey } from '../auth.js';

const router=Router();
const allowedClientEvents=new Set([
  'LANDING_VIEW',
  'JOIN_OPENED',
  'REFERRAL_LANDING',
  'SHARE_COMPLETED',
  'MATCH_INVITE_LANDING'
]);
const clean=(v,max=64)=>typeof v==='string'?v.trim().slice(0,max):'';

async function optionalIdentity(req){
  const auth=req.get('authorization')||'';
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!token)return null;
  const tokenHash=hashSessionToken(token);
  const [[row]]=await pool.query(`
    SELECT s.user_id
    FROM identity_sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL
      AND s.expires_at>UTC_TIMESTAMP() AND u.status='ACTIVE'
    LIMIT 1
  `,[tokenHash]);
  return row||null;
}

router.post('/event',async(req,res,next)=>{
  try{
    const eventName=clean(req.body?.eventName,48).toUpperCase();
    if(!allowedClientEvents.has(eventName)) return res.status(400).json({error:'analytics_event_not_allowed'});
    const anonymousId=clean(req.body?.anonymousId,36)||null;
    const source=clean(req.body?.source,32)||null;
    const cityCode=clean(req.body?.cityCode,12).toUpperCase();
    const matchPublicId=clean(req.body?.matchPublicId,40);
    const metadata=req.body?.metadata && typeof req.body.metadata==='object' && !Array.isArray(req.body.metadata)
      ? req.body.metadata : {};
    const identity=await optionalIdentity(req);
    let seasonId=null,cityId=null,matchId=null;
    if(cityCode){
      const [[city]]=await pool.query('SELECT id FROM cities WHERE code=? LIMIT 1',[cityCode]);
      cityId=city?.id||null;
    }
    if(matchPublicId){
      const [[match]]=await pool.query('SELECT id,season_id FROM matches WHERE public_id=? LIMIT 1',[matchPublicId]);
      matchId=match?.id||null;
      seasonId=match?.season_id||null;
    }
    if(!seasonId){
      const [[season]]=await pool.query("SELECT id FROM seasons WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL') ORDER BY id DESC LIMIT 1");
      seasonId=season?.id||null;
    }
    await pool.query(`
      INSERT INTO funnel_events(event_name,user_id,season_id,city_id,match_id,anonymous_id,source,metadata_json)
      VALUES (?,?,?,?,?,?,?,?)
    `,[
      eventName,identity?.user_id||null,seasonId,cityId,matchId,anonymousId,source,
      JSON.stringify(metadata).slice(0,2000)
    ]);
    res.status(201).json({ok:true});
  }catch(e){next(e)}
});

router.get('/funnel',requireAdminKey,async(req,res,next)=>{
  try{
    const days=Math.max(1,Math.min(90,Number(req.query.days)||30));
    const [rows]=await pool.query(`
      SELECT event_name,COUNT(*) total,COUNT(DISTINCT COALESCE(CAST(user_id AS CHAR),anonymous_id)) people
      FROM funnel_events
      WHERE created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY
      GROUP BY event_name
      ORDER BY total DESC
    `,[days]);
    const [[verified]]=await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM city_memberships WHERE verification_status='VERIFIED' AND joined_at>=UTC_TIMESTAMP()-INTERVAL ? DAY) verifiedGoals,
        (SELECT COUNT(*) FROM qualification_referrals WHERE created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY) verifiedAssists,
        (SELECT COUNT(*) FROM match_participations WHERE created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY) matchReservations,
        (SELECT COUNT(*) FROM scoring_events WHERE type='GOAL' AND created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY) matchGoals,
        (SELECT COUNT(*) FROM match_assists WHERE created_at>=UTC_TIMESTAMP()-INTERVAL ? DAY) matchAssists
    `,[days,days,days,days,days]);
    res.json({days,events:rows.map(r=>({eventName:r.event_name,total:Number(r.total),people:Number(r.people)})),verified});
  }catch(e){next(e)}
});

export default router;
