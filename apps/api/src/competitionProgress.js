import { pool } from './db/pool.js';

async function supporterCount(conn,competitionId,choiceId){
  const [[r]]=await conn.query(
    "SELECT COUNT(*) total FROM competition_supporters WHERE competition_id=? AND choice_id=? AND status='ACTIVE'",
    [competitionId,choiceId]
  );
  return Number(r?.total||0);
}

function qualifies(row,stage,rank){
  const total=Number(row.final_supporter_count||0);
  const target=Number(stage.target||0);
  const advance=Number(stage.advance_count||0);
  if(stage.stage_type==='FINAL')return rank===1;
  if(stage.rule_type==='TARGET')return target>0&&total>=target;
  if(stage.rule_type==='TOP_N')return advance>0&&rank<=advance;
  if(stage.rule_type==='TARGET_OR_TOP_N')return (target>0&&total>=target)||(advance>0&&rank<=advance);
  if(stage.rule_type==='HIGHEST_AT_CLOSE')return rank===1;
  return false;
}

function groupCode(index){return String.fromCharCode(65+index)}

export async function closeCompetitionStage({competitionId,stageId,actorUserId=null}){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[stage]]=await conn.query(
      "SELECT * FROM competition_stages WHERE id=? AND competition_id=? LIMIT 1 FOR UPDATE",
      [stageId,competitionId]
    );
    if(!stage)throw Object.assign(new Error('competition_stage_not_found'),{status:404});
    if(stage.status!=='OPEN')throw Object.assign(new Error('competition_stage_not_open'),{status:409});

    const [members]=await conn.query(`
      SELECT csc.choice_id,csc.group_code,csc.seed_no,cc.name,cc.code
      FROM competition_stage_choices csc
      JOIN competition_choices cc ON cc.id=csc.choice_id
      WHERE csc.stage_id=? AND csc.result_status='ACTIVE'
      ORDER BY COALESCE(csc.group_code,''),csc.seed_no,cc.name
    `,[stage.id]);
    if(!members.length)throw Object.assign(new Error('competition_stage_has_no_choices'),{status:409});

    const enriched=[];
    for(const m of members){
      const total=await supporterCount(conn,competitionId,m.choice_id);
      enriched.push({...m,final_supporter_count:total});
    }

    const grouped=new Map();
    for(const row of enriched){
      const key=stage.stage_type==='GROUP'?(row.group_code||'A'):'ALL';
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push(row);
    }

    const advanced=[];
    for(const [,rows] of grouped){
      rows.sort((a,b)=>b.final_supporter_count-a.final_supporter_count||a.seed_no-b.seed_no||a.name.localeCompare(b.name));
      for(let i=0;i<rows.length;i++){
        const row=rows[i];
        const pass=qualifies(row,stage,i+1);
        await conn.query(
          "UPDATE competition_stage_choices SET final_supporter_count=?,result_status=? WHERE stage_id=? AND choice_id=?",
          [row.final_supporter_count,pass?(stage.stage_type==='FINAL'?'WINNER':'QUALIFIED'):'ELIMINATED',stage.id,row.choice_id]
        );
        if(pass)advanced.push(row);
      }
    }

    await conn.query("UPDATE competition_stages SET status='COMPLETE',ends_at=COALESCE(ends_at,UTC_TIMESTAMP()) WHERE id=?",[stage.id]);
    await conn.query(
      "INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'STAGE_CLOSED',?)",
      [competitionId,stage.id,JSON.stringify({advanced:advanced.length,total:enriched.length})]
    );

    const [[nextStage]]=await conn.query(
      "SELECT * FROM competition_stages WHERE competition_id=? AND sequence_no>? ORDER BY sequence_no LIMIT 1 FOR UPDATE",
      [competitionId,stage.sequence_no]
    );

    if(stage.stage_type==='FINAL'){
      const winner=advanced[0]||null;
      if(winner){
        await conn.query("UPDATE competition_choices SET status=IF(id=?,'WINNER',status) WHERE competition_id=?",[winner.choice_id,competitionId]);
        await conn.query("UPDATE competitions SET status='COMPLETE',ends_at=COALESCE(ends_at,UTC_TIMESTAMP()) WHERE id=?",[competitionId]);
        await conn.query(
          "INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'WINNER_CONFIRMED',?)",
          [competitionId,stage.id,JSON.stringify({choiceId:winner.choice_id,code:winner.code,name:winner.name,supporters:winner.final_supporter_count})]
        );
      }
    }else if(nextStage&&advanced.length){
      let groupIndex=0,slot=0;
      for(let i=0;i<advanced.length;i++){
        const row=advanced[i];
        let group=null;
        if(nextStage.stage_type==='GROUP'){
          const size=Math.max(2,Number(nextStage.group_size||4));
          if(slot>=size){groupIndex++;slot=0}
          group=groupCode(groupIndex);
          slot++;
        }
        await conn.query(`
          INSERT INTO competition_stage_choices(stage_id,choice_id,group_code,seed_no,entry_supporter_count)
          VALUES (?,?,?,?,?)
          ON DUPLICATE KEY UPDATE group_code=VALUES(group_code),seed_no=VALUES(seed_no),entry_supporter_count=VALUES(entry_supporter_count),result_status='ACTIVE',final_supporter_count=NULL
        `,[nextStage.id,row.choice_id,group,i+1,row.final_supporter_count]);
      }
      await conn.query("UPDATE competition_stages SET status='OPEN',starts_at=COALESCE(starts_at,UTC_TIMESTAMP()) WHERE id=?",[nextStage.id]);
      await conn.query(
        "INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'CHOICES_ADVANCED',?)",
        [competitionId,nextStage.id,JSON.stringify({fromStageId:stage.id,count:advanced.length})]
      );
      await conn.query(
        "INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'STAGE_OPENED',?)",
        [competitionId,nextStage.id,JSON.stringify({choices:advanced.length})]
      );
    }

    await conn.query(
      "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)",
      [actorUserId,'COMPETITION_STAGE_CLOSED','COMPETITION_STAGE',String(stage.id),JSON.stringify({competitionId,advanced:advanced.length,total:enriched.length})]
    );

    await conn.commit();
    return {ok:true,stageId:Number(stage.id),advanced:advanced.map(x=>({choiceId:Number(x.choice_id),code:x.code,name:x.name,supporters:Number(x.final_supporter_count)})),nextStage:nextStage?{id:Number(nextStage.id),code:nextStage.code,name:nextStage.name}:null};
  }catch(e){
    await conn.rollback();
    throw e;
  }finally{conn.release()}
}

export async function openCompetitionStage({competitionId,stageId,actorUserId=null}){
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[stage]]=await conn.query("SELECT * FROM competition_stages WHERE id=? AND competition_id=? LIMIT 1 FOR UPDATE",[stageId,competitionId]);
    if(!stage)throw Object.assign(new Error('competition_stage_not_found'),{status:404});
    if(stage.status==='COMPLETE')throw Object.assign(new Error('competition_stage_complete'),{status:409});
    const [[count]]=await conn.query("SELECT COUNT(*) total FROM competition_stage_choices WHERE stage_id=?",[stage.id]);
    if(Number(count?.total||0)===0)throw Object.assign(new Error('competition_stage_has_no_choices'),{status:409});
    await conn.query("UPDATE competition_stages SET status='OPEN',starts_at=COALESCE(starts_at,UTC_TIMESTAMP()) WHERE id=?",[stage.id]);
    await conn.query(
      "INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'STAGE_OPENED',?)",
      [competitionId,stage.id,JSON.stringify({choices:Number(count.total||0)})]
    );
    await conn.query(
      "INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)",
      [actorUserId,'COMPETITION_STAGE_OPENED','COMPETITION_STAGE',String(stage.id),JSON.stringify({competitionId})]
    );
    await conn.commit();
    return {ok:true};
  }catch(e){await conn.rollback();throw e}finally{conn.release()}
}