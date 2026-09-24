import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';

const router=Router();
router.use(requireAdminKey);

async function latestSeason(){
  const [[season]]=await pool.query(`
    SELECT id,name,status FROM seasons
    ORDER BY id DESC LIMIT 1
  `);
  return season||null;
}

async function topPlaymakers(seasonId){
  const [rows]=await pool.query(`
    SELECT u.id user_id,u.public_id,u.display_name,u.nickname,
      c.code city_code,c.name city_name,
      COALESCE(q.direct_assists,0)+COALESCE(m.match_assists,0) metric_value,
      COALESCE(q.direct_assists,0) qualification_assists,
      COALESCE(m.match_assists,0) match_assists
    FROM users u
    JOIN city_memberships cm ON cm.user_id=u.id AND cm.season_id=? AND cm.status='ACTIVE'
    JOIN cities c ON c.id=cm.city_id
    LEFT JOIN (
      SELECT referrer_user_id user_id,COUNT(*) direct_assists
      FROM qualification_referrals
      WHERE season_id=?
      GROUP BY referrer_user_id
    ) q ON q.user_id=u.id
    LEFT JOIN (
      SELECT mp.user_id,COUNT(*) match_assists
      FROM match_assists ma
      JOIN match_participations mp ON mp.id=ma.assister_participation_id
      JOIN matches m ON m.id=ma.match_id
      WHERE m.season_id=?
      GROUP BY mp.user_id
    ) m ON m.user_id=u.id
    WHERE u.status='ACTIVE'
    ORDER BY metric_value DESC,u.id ASC
    LIMIT 10
  `,[seasonId,seasonId,seasonId]);
  return rows.map(r=>({
    userId:Number(r.user_id),publicId:r.public_id,name:r.nickname||r.display_name,
    city:{code:r.city_code,name:r.city_name},
    metricValue:Number(r.metric_value||0),
    evidence:{
      qualificationAssists:Number(r.qualification_assists||0),
      matchAssists:Number(r.match_assists||0)
    }
  }));
}

async function globalConnectors(seasonId){
  const [rows]=await pool.query(`
    WITH RECURSIVE tree AS (
      SELECT qr.referrer_user_id root_user_id,qr.referred_user_id,1 depth
      FROM qualification_referrals qr
      WHERE qr.season_id=?
      UNION ALL
      SELECT t.root_user_id,qr.referred_user_id,t.depth+1
      FROM tree t
      JOIN qualification_referrals qr
        ON qr.season_id=? AND qr.referrer_user_id=t.referred_user_id
      WHERE t.depth<12
    ),
    branch AS (
      SELECT root_user_id,COUNT(*) qualification_branch
      FROM tree
      GROUP BY root_user_id
    ),
    match_branch AS (
      SELECT mp.user_id,MAX(mp.downstream_joins) match_branch
      FROM match_participations mp
      JOIN matches m ON m.id=mp.match_id
      WHERE m.season_id=?
      GROUP BY mp.user_id
    )
    SELECT u.id user_id,u.public_id,u.display_name,u.nickname,
      c.code city_code,c.name city_name,
      COALESCE(branch.qualification_branch,0)+COALESCE(match_branch.match_branch,0) metric_value,
      COALESCE(branch.qualification_branch,0) qualification_branch,
      COALESCE(match_branch.match_branch,0) match_branch
    FROM users u
    JOIN city_memberships cm ON cm.user_id=u.id AND cm.season_id=? AND cm.status='ACTIVE'
    JOIN cities c ON c.id=cm.city_id
    LEFT JOIN branch ON branch.root_user_id=u.id
    LEFT JOIN match_branch ON match_branch.user_id=u.id
    WHERE u.status='ACTIVE'
    ORDER BY metric_value DESC,u.id ASC
    LIMIT 10
  `,[seasonId,seasonId,seasonId,seasonId]);
  return rows.map(r=>({
    userId:Number(r.user_id),publicId:r.public_id,name:r.nickname||r.display_name,
    city:{code:r.city_code,name:r.city_name},
    metricValue:Number(r.metric_value||0),
    evidence:{
      qualificationBranch:Number(r.qualification_branch||0),
      matchBranch:Number(r.match_branch||0)
    }
  }));
}

async function playerOfTournament(seasonId){
  const [rows]=await pool.query(`
    WITH RECURSIVE tree AS (
      SELECT qr.referrer_user_id root_user_id,qr.referred_user_id,1 depth
      FROM qualification_referrals qr
      WHERE qr.season_id=?
      UNION ALL
      SELECT t.root_user_id,qr.referred_user_id,t.depth+1
      FROM tree t
      JOIN qualification_referrals qr
        ON qr.season_id=? AND qr.referrer_user_id=t.referred_user_id
      WHERE t.depth<12
    ),
    q_branch AS (
      SELECT root_user_id,COUNT(*) branch
      FROM tree GROUP BY root_user_id
    ),
    q_assists AS (
      SELECT referrer_user_id user_id,COUNT(*) assists
      FROM qualification_referrals
      WHERE season_id=?
      GROUP BY referrer_user_id
    ),
    match_stats AS (
      SELECT mp.user_id,
        SUM(mp.status='ACTIVE') match_goals,
        SUM(mp.direct_joins) match_assists,
        SUM(mp.downstream_joins) match_branch
      FROM match_participations mp
      JOIN matches m ON m.id=mp.match_id
      WHERE m.season_id=?
      GROUP BY mp.user_id
    )
    SELECT u.id user_id,u.public_id,u.display_name,u.nickname,
      c.code city_code,c.name city_name,
      1 qualification_goal,
      COALESCE(qa.assists,0) qualification_assists,
      COALESCE(qb.branch,0) qualification_branch,
      COALESCE(ms.match_goals,0) match_goals,
      COALESCE(ms.match_assists,0) match_assists,
      COALESCE(ms.match_branch,0) match_branch,
      (
        1 +
        COALESCE(qa.assists,0)*5 +
        COALESCE(qb.branch,0)*2 +
        COALESCE(ms.match_goals,0)*3 +
        COALESCE(ms.match_assists,0)*5 +
        COALESCE(ms.match_branch,0)*2
      ) metric_value
    FROM users u
    JOIN city_memberships cm ON cm.user_id=u.id AND cm.season_id=? AND cm.status='ACTIVE' AND cm.verification_status='VERIFIED'
    JOIN cities c ON c.id=cm.city_id
    LEFT JOIN q_assists qa ON qa.user_id=u.id
    LEFT JOIN q_branch qb ON qb.root_user_id=u.id
    LEFT JOIN match_stats ms ON ms.user_id=u.id
    WHERE u.status='ACTIVE'
    ORDER BY metric_value DESC,u.id ASC
    LIMIT 10
  `,[seasonId,seasonId,seasonId,seasonId,seasonId]);
  return rows.map(r=>({
    userId:Number(r.user_id),publicId:r.public_id,name:r.nickname||r.display_name,
    city:{code:r.city_code,name:r.city_name},
    metricValue:Number(r.metric_value||0),
    evidence:{
      qualificationGoal:1,
      qualificationAssists:Number(r.qualification_assists||0),
      qualificationBranch:Number(r.qualification_branch||0),
      matchGoals:Number(r.match_goals||0),
      matchAssists:Number(r.match_assists||0),
      matchBranch:Number(r.match_branch||0),
      formula:'Goal 1 + Assists×5 + Branch×2 + Match Goals×3 + Match Assists×5 + Match Branch×2'
    }
  }));
}

async function finalAssist(seasonId){
  const [[final]]=await pool.query(`
    SELECT m.id,m.public_id,m.status
    FROM matches m
    LEFT JOIN tournament_stages ts ON ts.id=m.stage_id
    WHERE m.season_id=? AND (ts.stage_type='FINAL' OR UPPER(m.round_code)='FINAL')
    ORDER BY m.starts_at DESC,m.id DESC
    LIMIT 1
  `,[seasonId]);
  if(!final)return {match:null,candidates:[]};
  const [rows]=await pool.query(`
    SELECT ma.id,ma.created_at,mp.user_id,u.public_id,u.display_name,u.nickname,
      c.code city_code,c.name city_name,
      scorer.activated_at scorer_activated_at
    FROM match_assists ma
    JOIN match_participations mp ON mp.id=ma.assister_participation_id
    JOIN match_participations scorer ON scorer.id=ma.scorer_participation_id
    JOIN users u ON u.id=mp.user_id
    JOIN cities c ON c.id=ma.city_id
    WHERE ma.match_id=?
    ORDER BY scorer.activated_at DESC,ma.id DESC
    LIMIT 10
  `,[final.id]);
  return {
    match:{id:Number(final.id),publicId:final.public_id,status:final.status},
    candidates:rows.map((r,i)=>({
      userId:Number(r.user_id),publicId:r.public_id,name:r.nickname||r.display_name,
      city:{code:r.city_code,name:r.city_name},
      metricValue:i===0?1:0,
      evidence:{assistId:Number(r.id),assistAt:r.created_at,scorerActivatedAt:r.scorer_activated_at,latestVerifiedFinalAssist:i===0}
    }))
  };
}

router.get('/candidates',async(_req,res,next)=>{
  try{
    const season=await latestSeason();
    if(!season)return res.json({season:null,awards:{}});
    const [playmakers,connectors,pot,fa]=await Promise.all([
      topPlaymakers(season.id),
      globalConnectors(season.id),
      playerOfTournament(season.id),
      finalAssist(season.id)
    ]);
    res.json({
      season,
      awards:{
        TOP_PLAYMAKER:{metricName:'Verified direct Assists',candidates:playmakers},
        GLOBAL_CONNECTOR:{metricName:'Verified Branch impact',candidates:connectors},
        FINAL_ASSIST:{metricName:'Latest verified Assist in Final',match:fa.match,candidates:fa.candidates},
        PLAYER_OF_TOURNAMENT:{metricName:'Verified impact score',candidates:pot}
      }
    });
  }catch(e){next(e)}
});

router.get('/',async(_req,res,next)=>{
  try{
    const season=await latestSeason();
    if(!season)return res.json({season:null,awards:[]});
    const [rows]=await pool.query(`
      SELECT ca.id,ca.award_type,ca.scope,ca.metric_name,ca.metric_value,ca.evidence_json,ca.status,ca.confirmed_at,
        u.public_id,u.display_name,u.nickname,c.code city_code,c.name city_name,m.public_id match_public_id
      FROM competition_awards ca
      JOIN users u ON u.id=ca.user_id
      LEFT JOIN city_memberships cm ON cm.user_id=u.id AND cm.season_id=ca.season_id
      LEFT JOIN cities c ON c.id=cm.city_id
      LEFT JOIN matches m ON m.id=ca.match_id
      WHERE ca.season_id=?
      ORDER BY ca.confirmed_at DESC,ca.id DESC
    `,[season.id]);
    res.json({season,awards:rows.map(r=>({
      id:Number(r.id),type:r.award_type,scope:r.scope,metricName:r.metric_name,metricValue:Number(r.metric_value),
      evidence:r.evidence_json,status:r.status,confirmedAt:r.confirmed_at,
      user:{publicId:r.public_id,name:r.nickname||r.display_name,city:{code:r.city_code,name:r.city_name}},
      matchPublicId:r.match_public_id||null
    }))});
  }catch(e){next(e)}
});

router.post('/confirm',async(req,res,next)=>{
  const awardType=String(req.body?.awardType||'').toUpperCase();
  const userId=Number(req.body?.userId);
  const matchId=req.body?.matchId?Number(req.body.matchId):null;
  const metricName=String(req.body?.metricName||'').trim().slice(0,64);
  const metricValue=Math.max(0,Number(req.body?.metricValue)||0);
  const evidence=req.body?.evidence&&typeof req.body.evidence==='object'?req.body.evidence:{};
  if(!['TOP_PLAYMAKER','GLOBAL_CONNECTOR','FINAL_ASSIST','PLAYER_OF_TOURNAMENT'].includes(awardType)||!Number.isInteger(userId)||userId<1||!metricName){
    return res.status(400).json({error:'invalid_award'});
  }
  try{
    const season=await latestSeason();
    if(!season)return res.status(409).json({error:'season_required'});
    const [[user]]=await pool.query('SELECT id FROM users WHERE id=? AND status=\'ACTIVE\' LIMIT 1',[userId]);
    if(!user)return res.status(404).json({error:'user_not_found'});
    const scope=matchId?'MATCH':'SEASON';
    const [result]=await pool.query(`
      INSERT INTO competition_awards(
        season_id,match_id,user_id,award_type,scope,metric_name,metric_value,evidence_json,confirmed_by_user_id
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `,[season.id,matchId,userId,awardType,scope,metricName,metricValue,JSON.stringify(evidence),req.admin?.user_id||null]);
    await pool.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'AWARD_CONFIRMED','COMPETITION_AWARD',?,?)
    `,[req.admin?.user_id||null,String(result.insertId),JSON.stringify({awardType,userId,matchId,metricName,metricValue})]);
    res.status(201).json({ok:true,id:result.insertId});
  }catch(e){
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'award_already_confirmed'});
    next(e);
  }
});

router.post('/:id/revoke',async(req,res,next)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_award'});
  try{
    const [result]=await pool.query("UPDATE competition_awards SET status='REVOKED',revoked_at=UTC_TIMESTAMP() WHERE id=? AND status='CONFIRMED'",[id]);
    if(!result.affectedRows)return res.status(404).json({error:'award_not_found_or_already_revoked'});
    await pool.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (?,'AWARD_REVOKED','COMPETITION_AWARD',?,JSON_OBJECT())
    `,[req.admin?.user_id||null,String(id)]);
    res.json({ok:true});
  }catch(e){next(e)}
});

export default router;
