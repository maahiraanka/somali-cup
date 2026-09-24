import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireSession } from '../auth.js';

const router=Router();
const shareToken=()=>crypto.randomBytes(16).toString('hex');

async function getMatch(conn,publicId,lock=false){
  const [[row]]=await conn.query(`
    SELECT m.*,s.name season_name,
      hc.code home_code,hc.name home_name,hc.country home_country,
      ac.code away_code,ac.name away_name,ac.country away_country,
      wc.code winner_code,wc.name winner_name
    FROM matches m
    JOIN seasons s ON s.id=m.season_id
    JOIN cities hc ON hc.id=m.home_city_id
    JOIN cities ac ON ac.id=m.away_city_id
    LEFT JOIN cities wc ON wc.id=m.winner_city_id
    WHERE m.public_id=? LIMIT 1 ${lock?'FOR UPDATE':''}`,[publicId]);
  return row||null;
}

function publicMatch(m){
  if(!m) return null;
  return {
    publicId:m.public_id,seasonId:m.season_id,seasonName:m.season_name,roundCode:m.round_code,
    status:m.status,startsAt:m.starts_at,lobbyOpensAt:m.lobby_opens_at,endsAt:m.ends_at,finalisedAt:m.finalised_at,
    scoreVersion:m.score_version,
    home:{id:m.home_city_id,code:m.home_code,name:m.home_name,country:m.home_country,score:m.home_score},
    away:{id:m.away_city_id,code:m.away_code,name:m.away_name,country:m.away_country,score:m.away_score},
    winner:m.winner_city_id?{id:m.winner_city_id,code:m.winner_code,name:m.winner_name}:null
  };
}

router.get('/',async(_req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT m.*,s.name season_name,hc.code home_code,hc.name home_name,hc.country home_country,
        ac.code away_code,ac.name away_name,ac.country away_country,wc.code winner_code,wc.name winner_name
      FROM matches m JOIN seasons s ON s.id=m.season_id
      JOIN cities hc ON hc.id=m.home_city_id JOIN cities ac ON ac.id=m.away_city_id
      LEFT JOIN cities wc ON wc.id=m.winner_city_id
      WHERE m.status IN ('LOBBY','LIVE','SCHEDULED') ORDER BY FIELD(m.status,'LIVE','LOBBY','SCHEDULED'),m.starts_at ASC LIMIT 24`);
    res.json({matches:rows.map(publicMatch)});
  }catch(e){next(e)}
});

router.get('/:publicId/live',async(req,res,next)=>{
  try{
    const match=await getMatch(pool,req.params.publicId,false);
    if(!match) return res.status(404).json({error:'match_not_found'});
    const [[counts]]=await pool.query(`
      SELECT
        SUM(city_id=? AND status='ACTIVE') home_active,
        SUM(city_id=? AND status='ACTIVE') away_active,
        SUM(status='REGISTERED') registered_total,
        COUNT(*) participation_total
      FROM match_participations WHERE match_id=?`,[match.home_city_id,match.away_city_id,match.id]);
    const [activity]=await pool.query(`
      SELECT se.id,se.type,se.points,se.created_at,c.code city_code,c.name city_name,u.nickname,u.display_name
      FROM scoring_events se
      JOIN cities c ON c.id=se.city_id
      LEFT JOIN match_participations mp ON mp.id=se.participation_id
      LEFT JOIN users u ON u.id=mp.user_id
      WHERE se.match_id=? ORDER BY se.id DESC LIMIT 20`,[match.id]);
    res.json({match:publicMatch(match),counts:{homeActive:Number(counts?.home_active||0),awayActive:Number(counts?.away_active||0),registered:Number(counts?.registered_total||0),total:Number(counts?.participation_total||0)},activity});
  }catch(e){next(e)}
});

router.get('/:publicId/invite/:token',async(req,res,next)=>{
  try{
    const match=await getMatch(pool,req.params.publicId,false);
    if(!match) return res.status(404).json({error:'match_not_found'});
    const token=String(req.params.token||'').trim().slice(0,32);
    const [[invite]]=await pool.query(`
      SELECT mp.share_token,mp.status,c.code city_code,c.name city_name,u.display_name,u.nickname
      FROM match_participations mp
      JOIN cities c ON c.id=mp.city_id
      JOIN users u ON u.id=mp.user_id
      WHERE mp.match_id=? AND mp.share_token=? AND mp.status<>'REVOKED'
      LIMIT 1
    `,[match.id,token]);
    if(!invite) return res.status(404).json({error:'invite_not_found'});
    res.json({
      match:publicMatch(match),
      invite:{
        city:{code:invite.city_code,name:invite.city_name},
        from:invite.nickname||invite.display_name||'A supporter'
      }
    });
  }catch(e){next(e)}
});

router.get('/:publicId',async(req,res,next)=>{
  try{
    const match=await getMatch(pool,req.params.publicId,false);
    if(!match) return res.status(404).json({error:'match_not_found'});
    res.json({match:publicMatch(match)});
  }catch(e){next(e)}
});

router.post('/:publicId/join',requireSession,async(req,res,next)=>{
  const inviteToken=typeof req.body?.inviteToken==='string'?req.body.inviteToken.trim().slice(0,32):'';
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const match=await getMatch(conn,req.params.publicId,true);
    if(!match) throw Object.assign(new Error('match_not_found'),{status:404});
    if(!['LOBBY','LIVE'].includes(match.status)) throw Object.assign(new Error('match_not_joinable'),{status:409});
    const [[membership]]=await conn.query(`
      SELECT cm.city_id,cm.status,cm.verification_status,c.code,c.name
      FROM city_memberships cm JOIN cities c ON c.id=cm.city_id
      WHERE cm.user_id=? AND cm.season_id=? LIMIT 1 FOR UPDATE`,[req.identity.user_id,match.season_id]);
    if(!membership || membership.status!=='ACTIVE' || membership.verification_status!=='VERIFIED') throw Object.assign(new Error('verified_city_membership_required'),{status:409});
    if(![match.home_city_id,match.away_city_id].includes(membership.city_id)) throw Object.assign(new Error('your_city_is_not_in_this_match'),{status:409});

    const [[existing]]=await conn.query('SELECT * FROM match_participations WHERE match_id=? AND user_id=? LIMIT 1 FOR UPDATE',[match.id,req.identity.user_id]);
    if(existing){
      await conn.commit();
      return res.json({created:false,match:publicMatch(match),participation:{shareToken:existing.share_token,status:existing.status,generation:existing.generation,cityId:existing.city_id,directJoins:existing.direct_joins,downstreamJoins:existing.downstream_joins}});
    }

    let parent=null;
    if(inviteToken){
      [[parent]]=await conn.query(`
        SELECT id,city_id,generation,status FROM match_participations
        WHERE match_id=? AND share_token=? AND status<>'REVOKED' LIMIT 1`,[match.id,inviteToken]);
      if(parent && parent.city_id!==membership.city_id) parent=null;
    }
    const token=shareToken();
    const generation=parent?Math.min(65535,Number(parent.generation||1)+1):1;
    const [inserted]=await conn.query(`
      INSERT INTO match_participations(match_id,user_id,city_id,status,parent_participation_id,share_token,generation)
      VALUES (?,?,?,'REGISTERED',?,?,?)`,[match.id,req.identity.user_id,membership.city_id,parent?.id||null,token,generation]);
    await conn.commit();
    res.status(201).json({created:true,match:publicMatch(match),participation:{id:inserted.insertId,shareToken:token,status:'REGISTERED',generation,cityId:membership.city_id,directJoins:0,downstreamJoins:0}});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

router.post('/:publicId/activate',requireSession,async(req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const match=await getMatch(conn,req.params.publicId,true);
    if(!match) throw Object.assign(new Error('match_not_found'),{status:404});
    if(match.status!=='LIVE') throw Object.assign(new Error('match_not_live'),{status:409});

    const [[p]]=await conn.query(`
      SELECT mp.*,cm.status membership_status,cm.verification_status
      FROM match_participations mp
      JOIN city_memberships cm ON cm.user_id=mp.user_id AND cm.season_id=?
      WHERE mp.match_id=? AND mp.user_id=? LIMIT 1 FOR UPDATE`,[match.season_id,match.id,req.identity.user_id]);
    if(!p) throw Object.assign(new Error('join_match_first'),{status:409});
    if(p.membership_status!=='ACTIVE'||p.verification_status!=='VERIFIED') throw Object.assign(new Error('verified_city_membership_required'),{status:409});
    if(p.status==='REVOKED') throw Object.assign(new Error('participation_revoked'),{status:403});
    if(p.status==='ACTIVE'){
      await conn.commit();
      return res.json({activated:false,alreadyActive:true,match:publicMatch(match),participation:{shareToken:p.share_token,status:p.status,generation:p.generation,directJoins:p.direct_joins,downstreamJoins:p.downstream_joins}});
    }

    await conn.query("UPDATE match_participations SET status='ACTIVE',activated_at=UTC_TIMESTAMP() WHERE id=?",[p.id]);
    const idem='goal:'+match.id+':'+p.id;
    await conn.query(`INSERT INTO scoring_events(match_id,city_id,participation_id,type,points,reason,idempotency_key)
      VALUES (?,?,?,'GOAL',1,'VERIFIED_MATCH_ACTIVATION',?)`,[match.id,p.city_id,p.id,idem]);

    if(p.city_id===match.home_city_id) await conn.query('UPDATE matches SET home_score=home_score+1,score_version=score_version+1 WHERE id=?',[match.id]);
    else await conn.query('UPDATE matches SET away_score=away_score+1,score_version=score_version+1 WHERE id=?',[match.id]);

    if(p.parent_participation_id){
      const [[parent]]=await conn.query('SELECT id,parent_participation_id,city_id,status FROM match_participations WHERE id=? FOR UPDATE',[p.parent_participation_id]);
      if(parent && parent.city_id===p.city_id && parent.status!=='REVOKED'){
        await conn.query(`INSERT IGNORE INTO match_assists(match_id,city_id,assister_participation_id,scorer_participation_id) VALUES (?,?,?,?)`,[match.id,p.city_id,parent.id,p.id]);
        await conn.query('UPDATE match_participations SET direct_joins=direct_joins+1 WHERE id=?',[parent.id]);
        let ancestor=parent; let depth=0;
        while(ancestor && depth<50){
          await conn.query('UPDATE match_participations SET downstream_joins=downstream_joins+1 WHERE id=?',[ancestor.id]);
          if(!ancestor.parent_participation_id) break;
          [[ancestor]]=await conn.query('SELECT id,parent_participation_id FROM match_participations WHERE id=?',[ancestor.parent_participation_id]);
          depth++;
        }
      }
    }

    const [[fresh]]=await conn.query(`
      SELECT m.*,s.name season_name,hc.code home_code,hc.name home_name,hc.country home_country,
        ac.code away_code,ac.name away_name,ac.country away_country,wc.code winner_code,wc.name winner_name
      FROM matches m JOIN seasons s ON s.id=m.season_id JOIN cities hc ON hc.id=m.home_city_id JOIN cities ac ON ac.id=m.away_city_id
      LEFT JOIN cities wc ON wc.id=m.winner_city_id WHERE m.id=? LIMIT 1`,[match.id]);
    await conn.commit();
    res.json({activated:true,goalAdded:1,match:publicMatch(fresh),participation:{shareToken:p.share_token,status:'ACTIVE',generation:p.generation}});
  }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY' && String(e.message).includes('idempotency')) return res.status(200).json({activated:false,alreadyActive:true});if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

router.get('/:publicId/me',requireSession,async(req,res,next)=>{
  try{
    const match=await getMatch(pool,req.params.publicId,false);
    if(!match) return res.status(404).json({error:'match_not_found'});
    const [[p]]=await pool.query(`
      SELECT mp.id,mp.city_id,mp.status,mp.share_token,mp.generation,mp.direct_joins,mp.downstream_joins,mp.created_at,mp.activated_at,
        c.code city_code,c.name city_name,
        (SELECT COUNT(*) FROM match_assists ma WHERE ma.assister_participation_id=mp.id) assists
      FROM match_participations mp JOIN cities c ON c.id=mp.city_id
      WHERE mp.match_id=? AND mp.user_id=? LIMIT 1`,[match.id,req.identity.user_id]);

    let latestAssist=null;
    if(p?.id){
      const [[latest]]=await pool.query(`
        SELECT ma.id,ma.created_at,u.display_name,u.nickname,c.code city_code,c.name city_name
        FROM match_assists ma
        JOIN match_participations scorer ON scorer.id=ma.scorer_participation_id
        JOIN users u ON u.id=scorer.user_id
        JOIN cities c ON c.id=ma.city_id
        WHERE ma.match_id=? AND ma.assister_participation_id=?
        ORDER BY ma.id DESC
        LIMIT 1
      `,[match.id,p.id]);
      if(latest){
        latestAssist={
          id:Number(latest.id),
          name:latest.nickname||latest.display_name||'Someone',
          city:{code:latest.city_code,name:latest.city_name},
          createdAt:latest.created_at
        };
      }
      p.assists=Number(p.assists||0);
      p.direct_joins=Number(p.direct_joins||0);
      p.downstream_joins=Number(p.downstream_joins||0);
      p.indirect_joins=Math.max(0,p.downstream_joins-p.direct_joins);
      p.latestAssist=latestAssist;
    }
    res.json({match:publicMatch(match),participation:p||null});
  }catch(e){next(e)}
});

export default router;
