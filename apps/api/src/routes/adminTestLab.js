import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey, makePublicId } from '../auth.js';
import { closeCompetitionStage } from '../competitionProgress.js';

const router=Router();
router.use(requireAdminKey);

async function deleteTestCompetition(conn,competitionId){
  await conn.query('DELETE FROM competition_stage_events WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE csc FROM competition_stage_choices csc JOIN competition_stages cs ON cs.id=csc.stage_id WHERE cs.competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competition_stages WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competition_referrals WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competition_device_claims WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competition_supporters WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competition_nominations WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competition_choices WHERE competition_id=?',[competitionId]);
  await conn.query('DELETE FROM competitions WHERE id=? AND is_test=1',[competitionId]);
}

async function cleanupOrphanTestUsers(conn){
  await conn.query(`DELETE u FROM users u LEFT JOIN competition_supporters cs ON cs.user_id=u.id WHERE u.is_test=1 AND u.role<>'ADMIN' AND cs.id IS NULL`);
}

router.get('/status',async(_req,res,next)=>{
  try{
    const [[summary]]=await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM competitions WHERE is_test=1) competitions,
        (SELECT COUNT(*) FROM users WHERE is_test=1 AND role<>'ADMIN') test_users,
        (SELECT COUNT(*) FROM competition_supporters cs JOIN competitions cp ON cp.id=cs.competition_id WHERE cp.is_test=1) supporters,
        (SELECT COUNT(*) FROM competition_referrals cr JOIN competitions cp ON cp.id=cr.competition_id WHERE cp.is_test=1) referrals
    `);
    const [competitions]=await pool.query(`
      SELECT cp.id,cp.name,cp.slug,cp.status,
        (SELECT COUNT(*) FROM competition_choices cc WHERE cc.competition_id=cp.id) choices,
        (SELECT COUNT(*) FROM competition_supporters cs WHERE cs.competition_id=cp.id) supporters,
        (SELECT name FROM competition_stages cs WHERE cs.competition_id=cp.id AND cs.status='OPEN' ORDER BY sequence_no LIMIT 1) current_round
      FROM competitions cp WHERE cp.is_test=1 ORDER BY cp.id DESC
    `);
    res.json({summary,competitions});
  }catch(e){next(e)}
});

router.post('/sandbox',async(req,res,next)=>{
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [existing]=await conn.query('SELECT id FROM competitions WHERE is_test=1 FOR UPDATE');
    for(const row of existing)await deleteTestCompetition(conn,Number(row.id));
    await cleanupOrphanTestUsers(conn);

    const [created]=await conn.query(`
      INSERT INTO competitions(slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations,is_test)
      VALUES ('test-lab-city','Test Lab — City Competition','Test Lab','STAGED','CITY','CITY','LIVE',1,1)
    `);
    const competitionId=Number(created.insertId);
    const names=['Alpha City','Bravo City','Charlie City','Delta City','Echo City','Foxtrot City','Golf City','Hotel City'];
    const choiceRows=[];
    for(let i=0;i<names.length;i++){
      const code='TEST_'+String(i+1).padStart(2,'0');
      const [r]=await conn.query(`
        INSERT INTO competition_choices(competition_id,name,short_name,code,choice_type,status,target,next_supporter_no,sort_order)
        VALUES (?,?,?,?, 'CITY','ACTIVE',500,1,?)
      `,[competitionId,names[i],names[i],code,i+1]);
      choiceRows.push({id:Number(r.insertId),name:names[i],code});
    }

    const stages=[
      ['ROUND_1','Round 1','QUALIFICATION',1,'OPEN','TARGET',500,null,null],
      ['GROUP','Group Round','GROUP',2,'DRAFT','TOP_N',null,2,4],
      ['SEMI_FINAL','Semi Final','SEMI_FINAL',3,'DRAFT','TOP_N',null,2,null],
      ['FINAL','Final','FINAL',4,'DRAFT','HIGHEST_AT_CLOSE',null,1,null]
    ];
    let firstStageId=null;
    for(const s of stages){
      const [r]=await conn.query(`
        INSERT INTO competition_stages(competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size,starts_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `,[competitionId,...s,s[4]==='OPEN'?new Date():null]);
      if(s[0]==='ROUND_1')firstStageId=Number(r.insertId);
    }
    for(let i=0;i<choiceRows.length;i++){
      await conn.query('INSERT INTO competition_stage_choices(stage_id,choice_id,seed_no,entry_supporter_count) VALUES (?,?,?,0)',[firstStageId,choiceRows[i].id,i+1]);
    }
    await conn.query("INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'STAGE_OPENED',?)",[competitionId,firstStageId,JSON.stringify({testLab:true,choices:choiceRows.length})]);
    await conn.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',[req.admin?.user_id||null,'TEST_LAB_SANDBOX_CREATED','TEST_LAB',String(competitionId),JSON.stringify({choices:choiceRows.length})]);
    await conn.commit();
    res.status(201).json({ok:true,competitionId,choices:choiceRows});
  }catch(e){await conn.rollback();next(e)}finally{conn.release()}
});

router.post('/supporters/set',async(req,res,next)=>{
  const competitionId=Number(req.body?.competitionId);
  const choiceId=Number(req.body?.choiceId);
  const target=Math.max(0,Math.min(5000,Number(req.body?.target)||0));
  const withReferrals=Boolean(req.body?.withReferrals);
  if(!Number.isInteger(competitionId)||competitionId<1||!Number.isInteger(choiceId)||choiceId<1)return res.status(400).json({error:'invalid_test_target'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[choice]]=await conn.query(`SELECT cc.id,cc.name,cc.next_supporter_no,cp.is_test FROM competition_choices cc JOIN competitions cp ON cp.id=cc.competition_id WHERE cc.id=? AND cc.competition_id=? LIMIT 1 FOR UPDATE`,[choiceId,competitionId]);
    if(!choice||!choice.is_test)throw Object.assign(new Error('test_choice_required'),{status:409});
    const [[countRow]]=await conn.query("SELECT COUNT(*) total FROM competition_supporters WHERE competition_id=? AND choice_id=? AND status='ACTIVE'",[competitionId,choiceId]);
    const current=Number(countRow.total||0);

    if(target<current){
      const removeCount=current-target;
      const [rows]=await conn.query(`SELECT cs.user_id FROM competition_supporters cs JOIN users u ON u.id=cs.user_id WHERE cs.competition_id=? AND cs.choice_id=? AND u.is_test=1 ORDER BY cs.supporter_no DESC LIMIT ?`,[competitionId,choiceId,removeCount]);
      const ids=rows.map(r=>Number(r.user_id));
      if(ids.length){
        const ph=ids.map(()=>'?').join(',');
        await conn.query('DELETE FROM competition_referrals WHERE competition_id=? AND (referrer_user_id IN ('+ph+') OR referred_user_id IN ('+ph+'))',[competitionId,...ids,...ids]);
        await conn.query('DELETE FROM competition_device_claims WHERE competition_id=? AND user_id IN ('+ph+')',[competitionId,...ids]);
        await conn.query('DELETE FROM competition_supporters WHERE competition_id=? AND user_id IN ('+ph+')',[competitionId,...ids]);
        await conn.query('DELETE FROM users WHERE is_test=1 AND id IN ('+ph+')',ids);
      }
    }else if(target>current){
      const add=target-current;
      const publicIds=Array.from({length:add},()=>makePublicId());
      const values=[]; const params=[];
      for(let i=0;i<add;i++){values.push("(?,?,'PLAYER','ACTIVE',1)");params.push(publicIds[i],'Test Supporter '+(current+i+1));}
      await conn.query('INSERT INTO users(public_id,display_name,role,status,is_test) VALUES '+values.join(','),params);
      const ph=publicIds.map(()=>'?').join(',');
      const [users]=await conn.query('SELECT id,public_id FROM users WHERE public_id IN ('+ph+') ORDER BY id',publicIds);
      let supporterNo=Math.max(1,Number(choice.next_supporter_no||1));
      const supportValues=[]; const supportParams=[];
      for(const u of users){supportValues.push("(?,?,?,?,'ACTIVE')");supportParams.push(competitionId,choiceId,Number(u.id),supporterNo++);}
      await conn.query('INSERT INTO competition_supporters(competition_id,choice_id,user_id,supporter_no,status) VALUES '+supportValues.join(','),supportParams);
      await conn.query('UPDATE competition_choices SET next_supporter_no=? WHERE id=?',[supporterNo,choiceId]);
      if(withReferrals&&users.length>1){
        const refValues=[]; const refParams=[];
        for(let i=1;i<users.length;i++){refValues.push('(?,?,?,?)');refParams.push(competitionId,choiceId,Number(users[i-1].id),Number(users[i].id));}
        await conn.query('INSERT IGNORE INTO competition_referrals(competition_id,choice_id,referrer_user_id,referred_user_id) VALUES '+refValues.join(','),refParams);
      }
    }

    const [[finalCount]]=await conn.query("SELECT COUNT(*) total FROM competition_supporters WHERE competition_id=? AND choice_id=? AND status='ACTIVE'",[competitionId,choiceId]);
    await conn.commit();
    res.json({ok:true,choiceId,supporters:Number(finalCount.total||0),withReferrals});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

router.post('/advance',async(req,res,next)=>{
  try{
    const competitionId=Number(req.body?.competitionId);
    const [[competition]]=await pool.query('SELECT id,is_test FROM competitions WHERE id=? LIMIT 1',[competitionId]);
    if(!competition||!competition.is_test)return res.status(409).json({error:'test_competition_required'});
    const [[stage]]=await pool.query("SELECT id FROM competition_stages WHERE competition_id=? AND status='OPEN' ORDER BY sequence_no LIMIT 1",[competitionId]);
    if(!stage)return res.status(409).json({error:'no_open_test_round'});
    const result=await closeCompetitionStage({competitionId,stageId:Number(stage.id),actorUserId:req.admin?.user_id||null});
    res.json(result);
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}
});

router.get('/checks/:competitionId',async(req,res,next)=>{
  try{
    const competitionId=Number(req.params.competitionId);
    const [[cp]]=await pool.query('SELECT id,name,is_test,status FROM competitions WHERE id=? LIMIT 1',[competitionId]);
    if(!cp||!cp.is_test)return res.status(404).json({error:'test_competition_not_found'});
    const [[openRounds]]=await pool.query("SELECT COUNT(*) total FROM competition_stages WHERE competition_id=? AND status='OPEN'",[competitionId]);
    const [[badUsers]]=await pool.query(`SELECT COUNT(*) total FROM competition_supporters cs JOIN users u ON u.id=cs.user_id WHERE cs.competition_id=? AND u.is_test<>1`,[competitionId]);
    const checks=[
      {name:'Sandbox flag',pass:Boolean(cp.is_test)},
      {name:'Exactly one open round',pass:Number(openRounds.total||0)===1,detail:Number(openRounds.total||0)},
      {name:'All generated supporters are test users',pass:Number(badUsers.total||0)===0,detail:Number(badUsers.total||0)}
    ];
    res.json({ok:checks.every(x=>x.pass),checks});
  }catch(e){next(e)}
});

router.delete('/sandbox/:competitionId',async(req,res,next)=>{
  const competitionId=Number(req.params.competitionId);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[cp]]=await conn.query('SELECT id,is_test FROM competitions WHERE id=? LIMIT 1 FOR UPDATE',[competitionId]);
    if(!cp||!cp.is_test)throw Object.assign(new Error('test_competition_not_found'),{status:404});
    await deleteTestCompetition(conn,competitionId);
    await cleanupOrphanTestUsers(conn);
    await conn.query('INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',[req.admin?.user_id||null,'TEST_LAB_SANDBOX_CLEARED','TEST_LAB',String(competitionId),JSON.stringify({})]);
    await conn.commit();
    res.json({ok:true});
  }catch(e){await conn.rollback();if(e.status)return res.status(e.status).json({error:e.message});next(e)}finally{conn.release()}
});

export default router;