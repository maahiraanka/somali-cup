import { pool } from './db/pool.js';

const nowSql='UTC_TIMESTAMP()';

export async function syncMatchLifecycle(targetPublicId=null){
  const conn=await pool.getConnection();
  const changed=[];
  try{
    await conn.beginTransaction();
    const params=[];
    let where="m.status IN ('SCHEDULED','LOBBY','LIVE')";
    if(targetPublicId){where+=' AND m.public_id=?';params.push(targetPublicId)}
    const [matches]=await conn.query(`
      SELECT m.*,ts.tie_policy,ts.match_duration_minutes
      FROM matches m
      LEFT JOIN tournament_stages ts ON ts.id=m.stage_id
      WHERE ${where}
      ORDER BY m.id
      FOR UPDATE
    `,params);

    for(const m of matches){
      let status=m.status;
      let from=status;

      if(status==='SCHEDULED' && m.lobby_opens_at){
        const [[due]]=await conn.query('SELECT ?<=UTC_TIMESTAMP() due',[m.lobby_opens_at]);
        if(Number(due?.due||0)===1){
          status='LOBBY';
          await conn.query("UPDATE matches SET status='LOBBY' WHERE id=?",[m.id]);
          await conn.query("INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json) VALUES (?,'SCHEDULED','LOBBY',JSON_OBJECT('via','LIFECYCLE'))",[m.id]);
          changed.push({publicId:m.public_id,from:'SCHEDULED',to:'LOBBY'});
          from='LOBBY';
        }
      }

      if(status==='LOBBY'){
        const [[due]]=await conn.query('SELECT ?<=UTC_TIMESTAMP() due',[m.starts_at]);
        if(Number(due?.due||0)===1){
          status='LIVE';
          await conn.query("UPDATE matches SET status='LIVE' WHERE id=?",[m.id]);
          await conn.query("INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json) VALUES (?,'LOBBY','LIVE',JSON_OBJECT('via','LIFECYCLE'))",[m.id]);
          changed.push({publicId:m.public_id,from:'LOBBY',to:'LIVE'});
          from='LIVE';
        }
      }

      if(status==='LIVE' && m.regulation_ends_at){
        const [[due]]=await conn.query('SELECT ?<=UTC_TIMESTAMP() due',[m.regulation_ends_at]);
        if(Number(due?.due||0)!==1)continue;

        const home=Number(m.home_score||0),away=Number(m.away_score||0);
        const tiePolicy=m.tie_policy || (String(m.round_code||'').toUpperCase()==='GROUP'?'DRAW_ALLOWED':'SUDDEN_DEATH');

        if(home===away && tiePolicy==='SUDDEN_DEATH'){
          if(m.tiebreak_mode!=='SUDDEN_DEATH'){
            await conn.query("UPDATE matches SET tiebreak_mode='SUDDEN_DEATH',tiebreak_started_at=COALESCE(tiebreak_started_at,UTC_TIMESTAMP()) WHERE id=?",[m.id]);
            await conn.query("INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json) VALUES (?,'LIVE','LIVE',JSON_OBJECT('via','LIFECYCLE','mode','SUDDEN_DEATH'))",[m.id]);
            changed.push({publicId:m.public_id,from:'LIVE',to:'LIVE',mode:'SUDDEN_DEATH'});
          }
          continue;
        }

        const winner=home===away?null:(home>away?m.home_city_id:m.away_city_id);
        await conn.query(`
          UPDATE matches
          SET status='FINAL',winner_city_id=?,finalised_at=UTC_TIMESTAMP(),
              ends_at=UTC_TIMESTAMP(),tiebreak_mode='NONE'
          WHERE id=?
        `,[winner,m.id]);
        await conn.query("INSERT INTO match_state_events(match_id,from_status,to_status,metadata_json) VALUES (?,'LIVE','FINAL',JSON_OBJECT('via','LIFECYCLE','winnerCityId',?))",[m.id,winner]);
        changed.push({publicId:m.public_id,from:'LIVE',to:'FINAL',winnerCityId:winner});
      }
    }

    await conn.commit();
    return changed;
  }catch(e){
    await conn.rollback();
    throw e;
  }finally{
    conn.release();
  }
}

export function startLifecycleTimer(intervalMs=15000){
  const timer=setInterval(()=>{
    syncMatchLifecycle().catch(e=>console.error('[lifecycle] sync failed',e));
  },intervalMs);
  timer.unref?.();
  return timer;
}
