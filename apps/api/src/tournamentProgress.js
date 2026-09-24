import crypto from 'node:crypto';
import { pool } from './db/pool.js';

async function activeSeason(conn){
  const [[season]]=await conn.query(`
    SELECT id,name,status FROM seasons
    WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL')
    ORDER BY id DESC LIMIT 1
  `);
  return season||null;
}

async function rankGroup(conn,groupId){
  const [cities]=await conn.query(`
    SELECT c.id,c.code,c.name,tgc.seed_no
    FROM tournament_group_cities tgc
    JOIN cities c ON c.id=tgc.city_id
    WHERE tgc.group_id=?
  `,[groupId]);
  const rows=new Map(cities.map(c=>[Number(c.id),{
    id:Number(c.id),code:c.code,name:c.name,seed:Number(c.seed_no||100),points:0,gf:0,ga:0
  }]));
  const [matches]=await conn.query('SELECT * FROM matches WHERE group_id=?',[groupId]);
  if(!matches.length||matches.some(m=>m.status!=='FINAL'&&m.status!=='CANCELLED'))return {complete:false,rows:[]};
  for(const m of matches){
    if(m.status!=='FINAL')continue;
    const h=rows.get(Number(m.home_city_id)),a=rows.get(Number(m.away_city_id));
    if(!h||!a)continue;
    const hs=Number(m.home_score||0),as=Number(m.away_score||0);
    h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
    if(hs>as)h.points+=3;
    else if(as>hs)a.points+=3;
    else {h.points+=1;a.points+=1}
  }
  const ranked=[...rows.values()].sort((x,y)=>
    y.points-x.points||
    (y.gf-y.ga)-(x.gf-x.ga)||
    y.gf-x.gf||
    x.seed-y.seed||
    x.name.localeCompare(y.name)
  );
  return {complete:true,rows:ranked};
}

export async function progressTournament(){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const season=await activeSeason(conn);
    if(!season){await conn.commit();return {ok:true,resolvedSlots:0,createdMatches:0}}

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
      }else if(slot.source_type==='STAGE_MATCH_WINNER'){
        const [[source]]=await conn.query('SELECT status,winner_city_id FROM matches WHERE stage_id=? AND match_no=? LIMIT 1',[slot.source_stage_id,slot.source_match_no]);
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
      if(existing||!target.target_starts_at)continue;
      const [[stage]]=await conn.query('SELECT code,stage_type,match_duration_minutes FROM tournament_stages WHERE id=? LIMIT 1',[target.target_stage_id]);
      if(!stage)continue;
      const startsAt=new Date(target.target_starts_at);
      const regulationEnd=new Date(startsAt.getTime()+Number(stage.match_duration_minutes||60)*60000);
      const publicId=crypto.randomBytes(13).toString('hex');
      await conn.query(`
        INSERT INTO matches(
          public_id,season_id,stage_id,round_code,match_no,
          home_city_id,away_city_id,starts_at,regulation_ends_at,lobby_opens_at,status
        ) VALUES (?,?,?,?,?,?,?,?,?,?,'SCHEDULED')
      `,[
        publicId,season.id,target.target_stage_id,stage.code,target.target_match_no,
        target.home_city_id,target.away_city_id,startsAt,regulationEnd,target.target_lobby_opens_at
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
        const [[exists]]=await conn.query("SELECT id FROM tournament_events WHERE season_id=? AND event_type='CHAMPION_CONFIRMED' LIMIT 1",[season.id]);
        if(!exists){
          await conn.query(`
            INSERT INTO tournament_events(season_id,stage_id,event_type,metadata_json)
            VALUES (?,?,'CHAMPION_CONFIRMED',JSON_OBJECT('cityId',?,'code',?,'name',?))
          `,[season.id,finalStage.id,finalMatch.winner_city_id,finalMatch.code,finalMatch.name]);
          await conn.query("UPDATE seasons SET status='COMPLETE',ends_at=COALESCE(ends_at,UTC_TIMESTAMP()) WHERE id=?",[season.id]);
        }
      }
    }

    if(resolved||created){
      await conn.query(`
        INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
        VALUES (NULL,'TOURNAMENT_AUTO_PROGRESSED','SEASON',?,?)
      `,[String(season.id),JSON.stringify({resolved,created})]);
    }

    await conn.commit();
    return {ok:true,resolvedSlots:resolved,createdMatches:created};
  }catch(e){
    await conn.rollback();
    throw e;
  }finally{
    conn.release();
  }
}
