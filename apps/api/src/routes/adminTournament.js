import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';

const router=Router();
router.use(requireAdminKey);

const clean=(v,max=80)=>typeof v==='string'?v.trim().slice(0,max):'';

async function activeSeason(conn=pool){
  const [[season]]=await conn.query(`
    SELECT id,name,status FROM seasons
    WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL')
    ORDER BY id DESC LIMIT 1
  `);
  return season||null;
}

async function stageByCode(conn,seasonId,code,lock=false){
  const [[stage]]=await conn.query(`
    SELECT * FROM tournament_stages
    WHERE season_id=? AND code=?
    LIMIT 1 ${lock?'FOR UPDATE':''}
  `,[seasonId,code]);
  return stage||null;
}

router.post('/setup',async(req,res,next)=>{
  const stages=Array.isArray(req.body?.stages)?req.body.stages:[];
  const groups=Array.isArray(req.body?.groups)?req.body.groups:[];
  if(!stages.length) return res.status(400).json({error:'stages_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});

    const existing=await conn.query('SELECT COUNT(*) total FROM tournament_stages WHERE season_id=?',[season.id]);
    if(Number(existing[0]?.[0]?.total||0)>0) throw Object.assign(new Error('tournament_already_configured'),{status:409});

    const stageIds={};
    for(const raw of stages){
      const code=clean(raw.code,24).toUpperCase();
      const name=clean(raw.name,80);
      const type=clean(raw.type,16).toUpperCase();
      const sequence=Number(raw.sequence);
      const advanceCount=raw.advanceCount===null||raw.advanceCount===undefined?null:Number(raw.advanceCount);
      if(!code||!name||!['GROUP','KNOCKOUT','FINAL'].includes(type)||!Number.isInteger(sequence)||sequence<1){
        throw Object.assign(new Error('invalid_stage_config'),{status:400});
      }
      const [inserted]=await conn.query(`
        INSERT INTO tournament_stages(season_id,code,name,stage_type,sequence_no,advance_count)
        VALUES (?,?,?,?,?,?)
      `,[season.id,code,name,type,sequence,advanceCount]);
      stageIds[code]=inserted.insertId;
    }

    for(const raw of groups){
      const stageCode=clean(raw.stageCode,24).toUpperCase();
      const code=clean(raw.code,12).toUpperCase();
      const name=clean(raw.name,60);
      if(!stageIds[stageCode]||!code||!name) throw Object.assign(new Error('invalid_group_config'),{status:400});
      await conn.query('INSERT INTO tournament_groups(stage_id,code,name) VALUES (?,?,?)',[stageIds[stageCode],code,name]);
    }

    await conn.query(`
      INSERT INTO tournament_events(season_id,event_type,metadata_json)
      VALUES (?,'GROUPS_CREATED',?)
    `,[season.id,JSON.stringify({stages:stages.length,groups:groups.length})]);
    await conn.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (NULL,'TOURNAMENT_CONFIGURED','SEASON',?,?)
    `,[String(season.id),JSON.stringify({stages,groups})]);

    await conn.commit();
    res.status(201).json({ok:true,season:{id:season.id,name:season.name},stageIds});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.post('/groups/:groupCode/cities',async(req,res,next)=>{
  const groupCode=clean(req.params.groupCode,12).toUpperCase();
  const cityCodes=Array.isArray(req.body?.cityCodes)?req.body.cityCodes.map(c=>clean(c,12).toUpperCase()).filter(Boolean):[];
  if(!cityCodes.length) return res.status(400).json({error:'city_codes_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});
    const [[group]]=await conn.query(`
      SELECT tg.id,tg.stage_id
      FROM tournament_groups tg
      JOIN tournament_stages ts ON ts.id=tg.stage_id
      WHERE ts.season_id=? AND tg.code=?
      LIMIT 1 FOR UPDATE
    `,[season.id,groupCode]);
    if(!group) throw Object.assign(new Error('group_not_found'),{status:404});

    const [cities]=await conn.query(`
      SELECT c.id,c.code
      FROM cities c
      JOIN season_cities sc ON sc.city_id=c.id AND sc.season_id=?
      WHERE c.code IN (?) AND c.is_active=1
    `,[season.id,cityCodes]);
    if(cities.length!==new Set(cityCodes).size) throw Object.assign(new Error('one_or_more_cities_not_found'),{status:404});

    await conn.query('DELETE FROM tournament_group_cities WHERE group_id=?',[group.id]);
    let seed=1;
    for(const code of cityCodes){
      const city=cities.find(c=>c.code===code);
      await conn.query('INSERT INTO tournament_group_cities(group_id,city_id,seed_no) VALUES (?,?,?)',[group.id,city.id,seed++]);
    }
    await conn.commit();
    res.json({ok:true,groupCode,cityCodes});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

function roundRobin(ids){
  const list=[...ids];
  if(list.length%2===1)list.push(null);
  const n=list.length;
  const rounds=[];
  let current=[...list];
  for(let r=0;r<n-1;r++){
    const pairs=[];
    for(let i=0;i<n/2;i++){
      const a=current[i],b=current[n-1-i];
      if(a&&b)pairs.push([a,b]);
    }
    rounds.push(pairs);
    current=[current[0],current[n-1],...current.slice(1,n-1)];
  }
  return rounds;
}

router.post('/groups/:groupCode/generate-fixtures',async(req,res,next)=>{
  const groupCode=clean(req.params.groupCode,12).toUpperCase();
  const startsAt=req.body?.startsAt?new Date(req.body.startsAt):null;
  const minutesBetween=Math.max(5,Math.min(1440,Number(req.body?.minutesBetween)||30));
  const lobbyLead=Math.max(0,Math.min(1440,Number(req.body?.lobbyLeadMinutes)||30));
  if(!startsAt||Number.isNaN(startsAt.getTime())) return res.status(400).json({error:'valid_starts_at_required'});

  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});
    const [[group]]=await conn.query(`
      SELECT tg.id,tg.stage_id,ts.code stage_code
      FROM tournament_groups tg
      JOIN tournament_stages ts ON ts.id=tg.stage_id
      WHERE ts.season_id=? AND tg.code=?
      LIMIT 1 FOR UPDATE
    `,[season.id,groupCode]);
    if(!group) throw Object.assign(new Error('group_not_found'),{status:404});
    const [[existing]]=await conn.query('SELECT COUNT(*) total FROM matches WHERE group_id=?',[group.id]);
    if(Number(existing.total)>0) throw Object.assign(new Error('group_fixtures_already_exist'),{status:409});

    const [members]=await conn.query(`
      SELECT tgc.city_id,c.code
      FROM tournament_group_cities tgc
      JOIN cities c ON c.id=tgc.city_id
      WHERE tgc.group_id=?
      ORDER BY tgc.seed_no,c.name
    `,[group.id]);
    if(members.length<2) throw Object.assign(new Error('group_needs_at_least_two_cities'),{status:409});

    const codeById=Object.fromEntries(members.map(m=>[Number(m.city_id),m.code]));
    const rounds=roundRobin(members.map(m=>Number(m.city_id)));
    let matchNo=1;
    const created=[];
    let cursor=startsAt.getTime();
    for(let roundIndex=0;roundIndex<rounds.length;roundIndex++){
      for(const [homeId,awayId] of rounds[roundIndex]){
        const kickoff=new Date(cursor);
        const lobby=new Date(cursor-lobbyLead*60000);
        const publicId=crypto.randomBytes(13).toString('hex');
        await conn.query(`
          INSERT INTO matches(public_id,season_id,stage_id,group_id,round_code,match_no,home_city_id,away_city_id,starts_at,lobby_opens_at,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,'SCHEDULED')
        `,[
          publicId,season.id,group.stage_id,group.id,'GROUP',matchNo,homeId,awayId,kickoff,lobby
        ]);
        created.push({
          publicId,matchNo,round:roundIndex+1,
          home:codeById[homeId],away:codeById[awayId],startsAt:kickoff
        });
        matchNo++;
        cursor+=minutesBetween*60000;
      }
    }

    await conn.query(`
      INSERT INTO tournament_events(season_id,stage_id,event_type,metadata_json)
      VALUES (?,?,'FIXTURES_GENERATED',?)
    `,[season.id,group.stage_id,JSON.stringify({groupCode,count:created.length})]);
    await conn.commit();
    res.status(201).json({ok:true,groupCode,fixtures:created});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.post('/advancement-rules',async(req,res,next)=>{
  const rules=Array.isArray(req.body?.rules)?req.body.rules:[];
  if(!rules.length)return res.status(400).json({error:'rules_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});

    for(const raw of rules){
      const targetStageCode=clean(raw.targetStageCode,24).toUpperCase();
      const targetMatchNo=Number(raw.targetMatchNo);
      const targetSlot=clean(raw.targetSlot,8).toUpperCase();
      const sourceType=clean(raw.sourceType,16).toUpperCase();
      const targetStartsAt=raw.targetStartsAt?new Date(raw.targetStartsAt):null;
      const targetLobbyOpensAt=raw.targetLobbyOpensAt?new Date(raw.targetLobbyOpensAt):null;
      if(!targetStageCode||!Number.isInteger(targetMatchNo)||targetMatchNo<1||!['HOME','AWAY'].includes(targetSlot)||!['GROUP_RANK','MATCH_WINNER'].includes(sourceType)){
        throw Object.assign(new Error('invalid_advancement_rule'),{status:400});
      }
      const targetStage=await stageByCode(conn,season.id,targetStageCode,true);
      if(!targetStage) throw Object.assign(new Error('target_stage_not_found'),{status:404});

      let sourceGroupId=null,sourceRank=null,sourceMatchId=null;
      if(sourceType==='GROUP_RANK'){
        const sourceGroupCode=clean(raw.sourceGroupCode,12).toUpperCase();
        sourceRank=Number(raw.sourceRank);
        const [[group]]=await conn.query(`
          SELECT tg.id FROM tournament_groups tg
          JOIN tournament_stages ts ON ts.id=tg.stage_id
          WHERE ts.season_id=? AND tg.code=? LIMIT 1
        `,[season.id,sourceGroupCode]);
        if(!group||!Number.isInteger(sourceRank)||sourceRank<1) throw Object.assign(new Error('invalid_group_rank_source'),{status:400});
        sourceGroupId=group.id;
      }else{
        const sourceMatchPublicId=clean(raw.sourceMatchPublicId,40);
        const [[match]]=await conn.query('SELECT id FROM matches WHERE season_id=? AND public_id=? LIMIT 1',[season.id,sourceMatchPublicId]);
        if(!match) throw Object.assign(new Error('source_match_not_found'),{status:404});
        sourceMatchId=match.id;
      }

      await conn.query(`
        INSERT INTO tournament_advancement_slots(
          target_stage_id,target_match_no,target_slot,target_starts_at,target_lobby_opens_at,
          source_type,source_group_id,source_rank,source_match_id
        ) VALUES (?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          target_starts_at=VALUES(target_starts_at),
          target_lobby_opens_at=VALUES(target_lobby_opens_at),
          source_type=VALUES(source_type),
          source_group_id=VALUES(source_group_id),
          source_rank=VALUES(source_rank),
          source_match_id=VALUES(source_match_id),
          resolved_city_id=NULL,resolved_at=NULL
      `,[
        targetStage.id,targetMatchNo,targetSlot,
        targetStartsAt&&!Number.isNaN(targetStartsAt.getTime())?targetStartsAt:null,
        targetLobbyOpensAt&&!Number.isNaN(targetLobbyOpensAt.getTime())?targetLobbyOpensAt:null,
        sourceType,sourceGroupId,sourceRank,sourceMatchId
      ]);
    }

    await conn.commit();
    res.status(201).json({ok:true,count:rules.length});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

async function rankGroup(conn,groupId){
  const [cities]=await conn.query(`
    SELECT c.id,c.code,c.name,tgc.seed_no
    FROM tournament_group_cities tgc
    JOIN cities c ON c.id=tgc.city_id
    WHERE tgc.group_id=?
  `,[groupId]);
  const rows=new Map(cities.map(c=>[Number(c.id),{id:Number(c.id),code:c.code,name:c.name,seed:Number(c.seed_no||100),points:0,gf:0,ga:0}]));
  const [matches]=await conn.query('SELECT * FROM matches WHERE group_id=?',[groupId]);
  if(matches.some(m=>m.status!=='FINAL'&&m.status!=='CANCELLED')) return {complete:false,rows:[]};
  for(const m of matches){
    if(m.status!=='FINAL')continue;
    const h=rows.get(Number(m.home_city_id)),a=rows.get(Number(m.away_city_id));
    if(!h||!a)continue;
    const hs=Number(m.home_score||0),as=Number(m.away_score||0);
    h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
    if(hs>as)h.points+=3;
    else if(as>hs)a.points+=3;
  }
  const ranked=[...rows.values()].sort((x,y)=>y.points-x.points||(y.gf-y.ga)-(x.gf-x.ga)||y.gf-x.gf||x.seed-y.seed||x.name.localeCompare(y.name));
  return {complete:true,rows:ranked};
}

router.post('/progress',async(_req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season) throw Object.assign(new Error('active_season_required'),{status:409});

    const [slots]=await conn.query(`
      SELECT tas.*,ts.code target_stage_code,ts.stage_type
      FROM tournament_advancement_slots tas
      JOIN tournament_stages ts ON ts.id=tas.target_stage_id
      WHERE ts.season_id=?
      ORDER BY ts.sequence_no,tas.target_match_no,FIELD(tas.target_slot,'HOME','AWAY')
      FOR UPDATE
    `,[season.id]);

    let resolved=0,created=0;
    for(const slot of slots){
      if(slot.resolved_city_id)continue;
      let cityId=null;
      if(slot.source_type==='MATCH_WINNER'){
        const [[source]]=await conn.query('SELECT status,winner_city_id FROM matches WHERE id=? LIMIT 1',[slot.source_match_id]);
        if(source?.status==='FINAL'&&source.winner_city_id)cityId=source.winner_city_id;
      }else{
        const ranking=await rankGroup(conn,slot.source_group_id);
        if(ranking.complete)cityId=ranking.rows[Number(slot.source_rank)-1]?.id||null;
      }
      if(cityId){
        await conn.query('UPDATE tournament_advancement_slots SET resolved_city_id=?,resolved_at=UTC_TIMESTAMP() WHERE id=?',[cityId,slot.id]);
        resolved++;
      }
    }

    const [targets]=await conn.query(`
      SELECT target_stage_id,target_match_no,
        MAX(CASE WHEN target_slot='HOME' THEN resolved_city_id END) home_city_id,
        MAX(CASE WHEN target_slot='AWAY' THEN resolved_city_id END) away_city_id,
        MAX(target_starts_at) target_starts_at,
        MAX(target_lobby_opens_at) target_lobby_opens_at
      FROM tournament_advancement_slots tas
      JOIN tournament_stages ts ON ts.id=tas.target_stage_id
      WHERE ts.season_id=?
      GROUP BY target_stage_id,target_match_no
      HAVING home_city_id IS NOT NULL AND away_city_id IS NOT NULL
    `,[season.id]);

    for(const target of targets){
      const [[existing]]=await conn.query('SELECT id FROM matches WHERE stage_id=? AND match_no=? LIMIT 1',[target.target_stage_id,target.target_match_no]);
      if(existing)continue;
      const [[stage]]=await conn.query('SELECT code,stage_type FROM tournament_stages WHERE id=? LIMIT 1',[target.target_stage_id]);
      const startsAt=target.target_starts_at||new Date(Date.now()+24*60*60*1000);
      const publicId=crypto.randomBytes(13).toString('hex');
      await conn.query(`
        INSERT INTO matches(public_id,season_id,stage_id,round_code,match_no,home_city_id,away_city_id,starts_at,lobby_opens_at,status)
        VALUES (?,?,?,?,?,?,?,?,?,'SCHEDULED')
      `,[
        publicId,season.id,target.target_stage_id,stage.code,target.target_match_no,
        target.home_city_id,target.away_city_id,startsAt,target.target_lobby_opens_at
      ]);
      created++;
    }

    const [stages]=await conn.query('SELECT * FROM tournament_stages WHERE season_id=? ORDER BY sequence_no',[season.id]);
    for(const stage of stages){
      const [[counts]]=await conn.query(`
        SELECT COUNT(*) total,SUM(status='FINAL') final_count,SUM(status='CANCELLED') cancelled_count
        FROM matches WHERE stage_id=?
      `,[stage.id]);
      const total=Number(counts.total||0);
      const done=Number(counts.final_count||0)+Number(counts.cancelled_count||0);
      if(total>0&&done===total&&stage.status!=='COMPLETE'){
        await conn.query("UPDATE tournament_stages SET status='COMPLETE' WHERE id=?",[stage.id]);
        await conn.query(`
          INSERT INTO tournament_events(season_id,stage_id,event_type,metadata_json)
          VALUES (?,?,'STAGE_COMPLETED',JSON_OBJECT('matches',?))
        `,[season.id,stage.id,total]);
      }
    }

    const finalStage=stages.find(s=>s.stage_type==='FINAL');
    if(finalStage){
      const [[finalMatch]]=await conn.query(`
        SELECT m.status,m.winner_city_id,c.code,c.name
        FROM matches m
        LEFT JOIN cities c ON c.id=m.winner_city_id
        WHERE m.stage_id=?
        ORDER BY m.match_no LIMIT 1
      `,[finalStage.id]);
      if(finalMatch?.status==='FINAL'&&finalMatch.winner_city_id){
        await conn.query("UPDATE season_cities SET status=IF(city_id=?,'CHAMPION',status) WHERE season_id=?",[finalMatch.winner_city_id,season.id]);
        const [[exists]]=await conn.query(`
          SELECT id FROM tournament_events
          WHERE season_id=? AND event_type='CHAMPION_CONFIRMED' LIMIT 1
        `,[season.id]);
        if(!exists){
          await conn.query(`
            INSERT INTO tournament_events(season_id,stage_id,event_type,metadata_json)
            VALUES (?,?,'CHAMPION_CONFIRMED',JSON_OBJECT('cityId',?,'code',?,'name',?))
          `,[season.id,finalStage.id,finalMatch.winner_city_id,finalMatch.code,finalMatch.name]);
        }
      }
    }

    await conn.query(`
      INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
      VALUES (NULL,'TOURNAMENT_PROGRESSED','SEASON',?,?)
    `,[String(season.id),JSON.stringify({resolved,created})]);
    await conn.commit();
    res.json({ok:true,resolvedSlots:resolved,createdMatches:created});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

export default router;
