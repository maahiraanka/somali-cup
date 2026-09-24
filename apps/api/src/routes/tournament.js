import { Router } from 'express';
import { pool } from '../db/pool.js';

const router=Router();

async function activeSeason(){
  const [[season]]=await pool.query(`
    SELECT id,name,status,starts_at,ends_at
    FROM seasons
    WHERE status IN ('QUALIFICATION','GROUP','KNOCKOUT','FINAL')
    ORDER BY id DESC LIMIT 1
  `);
  return season||null;
}

function tableForGroup(cities,matches){
  const table=new Map(cities.map(c=>[Number(c.id),{
    city:{id:Number(c.id),code:c.code,name:c.name,country:c.country},
    seed:Number(c.seed_no||100),played:0,wins:0,losses:0,goalsFor:0,goalsAgainst:0,goalDiff:0,points:0
  }]));
  for(const m of matches){
    if(m.status!=='FINAL')continue;
    const h=table.get(Number(m.home_city_id));
    const a=table.get(Number(m.away_city_id));
    if(!h||!a)continue;
    const hs=Number(m.home_score||0),as=Number(m.away_score||0);
    h.played++;a.played++;
    h.goalsFor+=hs;h.goalsAgainst+=as;
    a.goalsFor+=as;a.goalsAgainst+=hs;
    if(hs>as){h.wins++;a.losses++;h.points+=3}
    else if(as>hs){a.wins++;h.losses++;a.points+=3}
  }
  const rows=[...table.values()];
  for(const r of rows)r.goalDiff=r.goalsFor-r.goalsAgainst;
  rows.sort((x,y)=>y.points-x.points||y.goalDiff-x.goalDiff||y.goalsFor-x.goalsFor||x.seed-y.seed||x.city.name.localeCompare(y.city.name));
  return rows.map((r,i)=>({...r,rank:i+1}));
}

router.get('/',async(_req,res,next)=>{
  try{
    const season=await activeSeason();
    if(!season)return res.json({season:null,stages:[]});
    const [stages]=await pool.query(`
      SELECT id,code,name,stage_type,sequence_no,status,advance_count
      FROM tournament_stages
      WHERE season_id=?
      ORDER BY sequence_no
    `,[season.id]);
    const output=[];
    for(const stage of stages){
      const stageOut={
        id:Number(stage.id),code:stage.code,name:stage.name,type:stage.stage_type,
        sequence:Number(stage.sequence_no),status:stage.status,
        advanceCount:stage.advance_count===null?null:Number(stage.advance_count),
        groups:[],matches:[]
      };
      if(stage.stage_type==='GROUP'){
        const [groups]=await pool.query('SELECT id,code,name FROM tournament_groups WHERE stage_id=? ORDER BY code',[stage.id]);
        for(const group of groups){
          const [cities]=await pool.query(`
            SELECT c.id,c.code,c.name,c.country,tgc.seed_no
            FROM tournament_group_cities tgc
            JOIN cities c ON c.id=tgc.city_id
            WHERE tgc.group_id=?
            ORDER BY tgc.seed_no,c.name
          `,[group.id]);
          const [matches]=await pool.query(`
            SELECT m.public_id,m.status,m.starts_at,m.home_city_id,m.away_city_id,m.home_score,m.away_score,
              hc.code home_code,hc.name home_name,ac.code away_code,ac.name away_name
            FROM matches m
            JOIN cities hc ON hc.id=m.home_city_id
            JOIN cities ac ON ac.id=m.away_city_id
            WHERE m.group_id=?
            ORDER BY m.starts_at,m.id
          `,[group.id]);
          stageOut.groups.push({
            id:Number(group.id),code:group.code,name:group.name,
            table:tableForGroup(cities,matches),
            matches:matches.map(m=>({
              publicId:m.public_id,status:m.status,startsAt:m.starts_at,
              home:{code:m.home_code,name:m.home_name,score:Number(m.home_score||0)},
              away:{code:m.away_code,name:m.away_name,score:Number(m.away_score||0)}
            }))
          });
        }
      }else{
        const [matches]=await pool.query(`
          SELECT m.public_id,m.match_no,m.status,m.starts_at,m.home_score,m.away_score,
            hc.code home_code,hc.name home_name,ac.code away_code,ac.name away_name,
            wc.code winner_code,wc.name winner_name
          FROM matches m
          JOIN cities hc ON hc.id=m.home_city_id
          JOIN cities ac ON ac.id=m.away_city_id
          LEFT JOIN cities wc ON wc.id=m.winner_city_id
          WHERE m.stage_id=?
          ORDER BY m.match_no,m.starts_at,m.id
        `,[stage.id]);
        stageOut.matches=matches.map(m=>({
          publicId:m.public_id,matchNo:Number(m.match_no||0),status:m.status,startsAt:m.starts_at,
          home:{code:m.home_code,name:m.home_name,score:Number(m.home_score||0)},
          away:{code:m.away_code,name:m.away_name,score:Number(m.away_score||0)},
          winner:m.winner_code?{code:m.winner_code,name:m.winner_name}:null
        }));
      }
      output.push(stageOut);
    }
    res.json({season,stages:output});
  }catch(e){next(e)}
});

export default router;
