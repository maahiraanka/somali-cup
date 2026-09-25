import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';
import { languageFor, supportedLanguagePresets } from '../competitionLanguage.js';
import { closeCompetitionStage, openCompetitionStage } from '../competitionProgress.js';
import { clearPublicCompetitionContent } from '../competitionDefaults.js';

const router=Router();
router.use(requireAdminKey);
const clean=(v,max=140)=>typeof v==='string'?v.trim().slice(0,max):'';
const slugify=v=>clean(v,80).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80);

router.get('/',async(_req,res,next)=>{
  try{
    const [competitions]=await pool.query(`
      SELECT cp.*,
        (SELECT COUNT(*) FROM competition_choices cc WHERE cc.competition_id=cp.id) choice_count,
        (SELECT COUNT(*) FROM competition_nominations cn WHERE cn.competition_id=cp.id AND cn.status='PENDING') pending_nominations
      FROM competitions cp
      WHERE cp.is_test=0
      ORDER BY cp.id DESC
    `);
    res.json({
      competitions:competitions.map(c=>({
        ...c,
        choice_count:Number(c.choice_count||0),
        pending_nominations:Number(c.pending_nominations||0),
        language:languageFor(c.language_preset,c.language_overrides_json)
      })),
      languagePresets:supportedLanguagePresets()
    });
  }catch(e){next(e)}
});

router.post('/',async(req,res,next)=>{
  const name=clean(req.body?.name,140);
  const shortName=clean(req.body?.shortName||name,80);
  const slug=slugify(req.body?.slug||name);
  const competitionType=clean(req.body?.competitionType||'STAGED',20).toUpperCase();
  const choiceType=clean(req.body?.choiceType||'CUSTOM',20).toUpperCase();
  const languagePreset=clean(req.body?.languagePreset||'SIMPLE',20).toUpperCase();
  const allowNominations=req.body?.allowNominations?1:0;
  if(name.length<3||!slug)return res.status(400).json({error:'name_required'});
  if(!['STAGED','GOAL_RACE','TIMED','HEAD_TO_HEAD'].includes(competitionType))return res.status(400).json({error:'invalid_competition_type'});
  if(!['CITY','UNIVERSITY','CLUB','BUSINESS','PERSON','COMMUNITY','CUSTOM'].includes(choiceType))return res.status(400).json({error:'invalid_choice_type'});
  if(!supportedLanguagePresets().includes(languagePreset))return res.status(400).json({error:'invalid_language_preset'});
  try{
    const [r]=await pool.query(`
      INSERT INTO competitions(
        slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations
      ) VALUES (?,?,?,?,?,?,'DRAFT',?)
    `,[slug,name,shortName,competitionType,choiceType,languagePreset,allowNominations]);
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_CREATED','COMPETITION',String(r.insertId),JSON.stringify({slug,name,competitionType,choiceType,languagePreset,allowNominations:Boolean(allowNominations)})]
    );
    res.status(201).json({ok:true,id:Number(r.insertId),slug});
  }catch(e){
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'competition_slug_exists'});
    next(e);
  }
});



router.post('/clear-content',async(req,res,next)=>{
  const confirmation=clean(req.body?.confirmation,80);
  if(confirmation!=='FACTORY RESET')return res.status(400).json({error:'confirmation_required'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const result=await clearPublicCompetitionContent(conn);
    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'FACTORY_RESET_COMPLETED','SYSTEM','competition-content-clear',JSON.stringify(result)]
    );
    await conn.commit();
    res.json({ok:true,...result});
  }catch(e){
    await conn.rollback();
    next(e);
  }finally{conn.release()}
});

router.patch('/:id/details',async(req,res,next)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_competition'});
  const name=clean(req.body?.name,140);
  const shortName=clean(req.body?.shortName,80);
  const status=clean(req.body?.status,20).toUpperCase();
  const languagePreset=clean(req.body?.languagePreset,20).toUpperCase();
  const allowNominations=req.body?.allowNominations;
  try{
    const [[current]]=await pool.query('SELECT * FROM competitions WHERE id=? LIMIT 1',[id]);
    if(!current)return res.status(404).json({error:'competition_not_found'});
    const next={
      name:name||current.name,
      shortName:shortName||current.short_name,
      status:status||current.status,
      languagePreset:languagePreset||current.language_preset,
      allowNominations:allowNominations===undefined?Number(current.allow_nominations):(allowNominations?1:0)
    };
    if(!['DRAFT','OPEN','LIVE','COMPLETE','ARCHIVED'].includes(next.status))return res.status(400).json({error:'invalid_competition_status'});
    if(!supportedLanguagePresets().includes(next.languagePreset))return res.status(400).json({error:'invalid_language_preset'});
    await pool.query(
      'UPDATE competitions SET name=?,short_name=?,status=?,language_preset=?,allow_nominations=? WHERE id=?',
      [next.name,next.shortName,next.status,next.languagePreset,next.allowNominations,id]
    );
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_DETAILS_UPDATED','COMPETITION',String(id),JSON.stringify({
        before:{name:current.name,shortName:current.short_name,status:current.status,languagePreset:current.language_preset,allowNominations:Boolean(current.allow_nominations)},
        after:{...next,allowNominations:Boolean(next.allowNominations)}
      })]
    );
    res.json({ok:true});
  }catch(e){next(e)}
});

router.delete('/:id',async(req,res,next)=>{
  const id=Number(req.params.id);
  const confirmation=clean(req.body?.confirmation,120);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_competition'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[competition]]=await conn.query('SELECT id,slug,name FROM competitions WHERE id=? LIMIT 1 FOR UPDATE',[id]);
    if(!competition)throw Object.assign(new Error('competition_not_found'),{status:404});
    if(confirmation!==('DELETE '+competition.name))throw Object.assign(new Error('confirmation_required'),{status:400});
    if(competition.slug==='somali-cup')throw Object.assign(new Error('core_competition_protected'),{status:409});

    const [choiceRows]=await conn.query('SELECT id FROM competition_choices WHERE competition_id=?',[id]);
    const choiceIds=choiceRows.map(x=>Number(x.id));
    await conn.query('DELETE FROM competition_stage_events WHERE competition_id=?',[id]);
    await conn.query('DELETE csc FROM competition_stage_choices csc JOIN competition_stages cs ON cs.id=csc.stage_id WHERE cs.competition_id=?',[id]);
    await conn.query('DELETE FROM competition_stages WHERE competition_id=?',[id]);
    await conn.query('DELETE FROM competition_referrals WHERE competition_id=?',[id]);
    await conn.query('DELETE FROM competition_device_claims WHERE competition_id=?',[id]);
    await conn.query('DELETE FROM competition_supporters WHERE competition_id=?',[id]);
    await conn.query('DELETE FROM competition_nominations WHERE competition_id=?',[id]);
    await conn.query('DELETE FROM competition_choices WHERE competition_id=?',[id]);
    await conn.query('DELETE FROM competitions WHERE id=?',[id]);
    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_DELETED','COMPETITION',String(id),JSON.stringify({name:competition.name,slug:competition.slug,choiceIds})]
    );
    await conn.commit();
    res.json({ok:true});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.patch('/:id/choices/:choiceId',async(req,res,next)=>{
  const competitionId=Number(req.params.id),choiceId=Number(req.params.choiceId);
  if(!Number.isInteger(competitionId)||competitionId<1||!Number.isInteger(choiceId)||choiceId<1)return res.status(400).json({error:'invalid_choice'});
  const name=clean(req.body?.name,140);
  const shortName=clean(req.body?.shortName,80);
  const status=clean(req.body?.status,20).toUpperCase();
  const target=req.body?.target===undefined?undefined:(req.body?.target===null||req.body?.target===''?null:Number(req.body.target));
  try{
    const [[current]]=await pool.query('SELECT * FROM competition_choices WHERE id=? AND competition_id=? LIMIT 1',[choiceId,competitionId]);
    if(!current)return res.status(404).json({error:'choice_not_found'});
    const next={
      name:name||current.name,
      shortName:shortName||current.short_name,
      status:status||current.status,
      target:target===undefined?current.target:target
    };
    if(!['ACTIVE','PAUSED','ELIMINATED','WINNER'].includes(next.status))return res.status(400).json({error:'invalid_choice_status'});
    if(next.target!==null&&(!Number.isInteger(next.target)||next.target<1))return res.status(400).json({error:'invalid_target'});
    await pool.query(
      'UPDATE competition_choices SET name=?,short_name=?,status=?,target=? WHERE id=? AND competition_id=?',
      [next.name,next.shortName,next.status,next.target,choiceId,competitionId]
    );
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_CHOICE_UPDATED','COMPETITION_CHOICE',String(choiceId),JSON.stringify({competitionId,before:{name:current.name,shortName:current.short_name,status:current.status,target:current.target},after:next})]
    );
    res.json({ok:true});
  }catch(e){next(e)}
});

router.delete('/:id/choices/:choiceId',async(req,res,next)=>{
  const competitionId=Number(req.params.id),choiceId=Number(req.params.choiceId);
  const confirmation=clean(req.body?.confirmation,160);
  if(!Number.isInteger(competitionId)||competitionId<1||!Number.isInteger(choiceId)||choiceId<1)return res.status(400).json({error:'invalid_choice'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[choice]]=await conn.query(
      'SELECT cc.id,cc.name,cp.slug FROM competition_choices cc JOIN competitions cp ON cp.id=cc.competition_id WHERE cc.id=? AND cc.competition_id=? LIMIT 1 FOR UPDATE',
      [choiceId,competitionId]
    );
    if(!choice)throw Object.assign(new Error('choice_not_found'),{status:404});
    if(confirmation!==('DELETE '+choice.name))throw Object.assign(new Error('confirmation_required'),{status:400});
    if(choice.slug==='somali-cup')throw Object.assign(new Error('core_competition_choice_protected'),{status:409});
    await conn.query('DELETE FROM competition_referrals WHERE competition_id=? AND choice_id=?',[competitionId,choiceId]);
    await conn.query(`
      DELETE cdc FROM competition_device_claims cdc
      JOIN competition_supporters cs
        ON cs.competition_id=cdc.competition_id AND cs.user_id=cdc.user_id
      WHERE cs.competition_id=? AND cs.choice_id=?
    `,[competitionId,choiceId]);
    await conn.query('DELETE FROM competition_supporters WHERE competition_id=? AND choice_id=?',[competitionId,choiceId]);
    await conn.query('DELETE FROM competition_stage_choices WHERE choice_id=?',[choiceId]);
    await conn.query('DELETE FROM competition_choices WHERE id=? AND competition_id=?',[choiceId,competitionId]);
    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_CHOICE_DELETED','COMPETITION_CHOICE',String(choiceId),JSON.stringify({competitionId,name:choice.name})]
    );
    await conn.commit();
    res.json({ok:true});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    next(e);
  }finally{conn.release()}
});

router.post('/create-complete',async(req,res,next)=>{
  const name=clean(req.body?.name,140);
  const shortName=clean(req.body?.shortName||name,80);
  const slug=slugify(req.body?.slug||name);
  const competitionType=clean(req.body?.competitionType||'STAGED',20).toUpperCase();
  const choiceType=clean(req.body?.choiceType||'CUSTOM',20).toUpperCase();
  const languagePreset=clean(req.body?.languagePreset||'SIMPLE',20).toUpperCase();
  const allowNominations=req.body?.allowNominations?1:0;
  const publishNow=Boolean(req.body?.publishNow);
  const choices=Array.isArray(req.body?.choices)?req.body.choices:[];
  const stages=Array.isArray(req.body?.stages)?req.body.stages:[];

  if(name.length<3||!slug)return res.status(400).json({error:'name_required'});
  if(!['STAGED','GOAL_RACE','TIMED','HEAD_TO_HEAD'].includes(competitionType))return res.status(400).json({error:'invalid_competition_type'});
  if(!['CITY','UNIVERSITY','CLUB','BUSINESS','PERSON','COMMUNITY','CUSTOM'].includes(choiceType))return res.status(400).json({error:'invalid_choice_type'});
  if(!supportedLanguagePresets().includes(languagePreset))return res.status(400).json({error:'invalid_language_preset'});
  if(choices.length<2)return res.status(400).json({error:'at_least_two_choices_required'});
  if(!stages.length)return res.status(400).json({error:'at_least_one_round_required'});

  const normalizedChoices=[];
  const seenCodes=new Set();
  for(let i=0;i<choices.length;i++){
    const choiceName=clean(choices[i]?.name,140);
    const choiceCode=clean(choices[i]?.code||choiceName,24).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);
    if(choiceName.length<2||!choiceCode)return res.status(400).json({error:'invalid_choice',index:i});
    if(seenCodes.has(choiceCode))return res.status(400).json({error:'duplicate_choice_code',code:choiceCode});
    seenCodes.add(choiceCode);
    normalizedChoices.push({name:choiceName,shortName:clean(choices[i]?.shortName||choiceName,80),code:choiceCode});
  }

  const normalizedStages=[];
  const seenStageCodes=new Set();
  for(let i=0;i<stages.length;i++){
    const s=stages[i]||{};
    const code=clean(s.code||('ROUND_'+(i+1)),32).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,32);
    const stageName=clean(s.name||('Round '+(i+1)),100);
    const stageType=clean(s.stageType||'QUALIFICATION',30).toUpperCase();
    const ruleType=clean(s.ruleType||'TARGET',30).toUpperCase();
    const target=s.target===null||s.target===undefined||s.target===''?null:Number(s.target);
    const advanceCount=s.advanceCount===null||s.advanceCount===undefined||s.advanceCount===''?null:Number(s.advanceCount);
    const groupSize=s.groupSize===null||s.groupSize===undefined||s.groupSize===''?null:Number(s.groupSize);

    if(!code||!stageName||seenStageCodes.has(code))return res.status(400).json({error:'invalid_or_duplicate_round',index:i});
    if(!['QUALIFICATION','GROUP','SEMI_FINAL','FINAL'].includes(stageType))return res.status(400).json({error:'invalid_round_type',index:i});
    if(!['TARGET','TOP_N','TARGET_OR_TOP_N','HIGHEST_AT_CLOSE'].includes(ruleType))return res.status(400).json({error:'invalid_round_rule',index:i});
    if(target!==null&&(!Number.isInteger(target)||target<1))return res.status(400).json({error:'invalid_round_target',index:i});
    if(advanceCount!==null&&(!Number.isInteger(advanceCount)||advanceCount<1))return res.status(400).json({error:'invalid_round_advance_count',index:i});
    if(groupSize!==null&&(!Number.isInteger(groupSize)||groupSize<2))return res.status(400).json({error:'invalid_round_group_size',index:i});

    seenStageCodes.add(code);
    normalizedStages.push({code,name:stageName,stageType,ruleType,target,advanceCount,groupSize});
  }

  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [created]=await conn.query(`
      INSERT INTO competitions(
        slug,name,short_name,competition_type,choice_type,language_preset,status,allow_nominations
      ) VALUES (?,?,?,?,?,?,?,?)
    `,[slug,name,shortName,competitionType,choiceType,languagePreset,publishNow?'LIVE':'DRAFT',allowNominations]);
    const competitionId=Number(created.insertId);

    const choiceRows=[];
    for(let i=0;i<normalizedChoices.length;i++){
      const ch=normalizedChoices[i];
      const [inserted]=await conn.query(`
        INSERT INTO competition_choices(competition_id,name,short_name,code,choice_type,status,sort_order)
        VALUES (?,?,?,?,?,'ACTIVE',?)
      `,[competitionId,ch.name,ch.shortName,ch.code,choiceType,i+1]);
      choiceRows.push({id:Number(inserted.insertId),...ch});
    }

    const stageRows=[];
    for(let i=0;i<normalizedStages.length;i++){
      const s=normalizedStages[i];
      const [inserted]=await conn.query(`
        INSERT INTO competition_stages(
          competition_id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size,starts_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `,[
        competitionId,s.code,s.name,s.stageType,i+1,
        i===0&&publishNow?'OPEN':'DRAFT',
        s.ruleType,s.target,s.advanceCount,s.groupSize,
        i===0&&publishNow?new Date():null
      ]);
      stageRows.push({id:Number(inserted.insertId),...s});
    }

    const firstStage=stageRows[0];
    for(let i=0;i<choiceRows.length;i++){
      await conn.query(`
        INSERT INTO competition_stage_choices(stage_id,choice_id,seed_no,entry_supporter_count)
        VALUES (?,?,?,0)
      `,[firstStage.id,choiceRows[i].id,i+1]);
    }

    if(publishNow){
      await conn.query(
        "INSERT INTO competition_stage_events(competition_id,stage_id,event_type,metadata_json) VALUES (?,?,'STAGE_OPENED',?)",
        [competitionId,firstStage.id,JSON.stringify({choices:choiceRows.length,createdByWizard:true})]
      );
    }

    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_CREATED_COMPLETE','COMPETITION',String(competitionId),JSON.stringify({
        slug,name,competitionType,choiceType,languagePreset,allowNominations:Boolean(allowNominations),
        published:publishNow,choices:choiceRows.map(x=>x.code),stages:stageRows.map(x=>x.code)
      })]
    );

    await conn.commit();
    res.status(201).json({
      ok:true,
      competition:{id:competitionId,slug,name,status:publishNow?'LIVE':'DRAFT'},
      choices:choiceRows.length,
      stages:stageRows.length,
      firstStage:{id:firstStage.id,name:firstStage.name,status:publishNow?'OPEN':'DRAFT'}
    });
  }catch(e){
    await conn.rollback();
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'competition_or_choice_exists'});
    next(e);
  }finally{conn.release()}
});

router.patch('/:id',async(req,res,next)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_competition'});
  const status=clean(req.body?.status,20).toUpperCase();
  const languagePreset=clean(req.body?.languagePreset,20).toUpperCase();
  const allowNominations=req.body?.allowNominations;
  try{
    const [[current]]=await pool.query('SELECT id,status,language_preset,allow_nominations FROM competitions WHERE id=? LIMIT 1',[id]);
    if(!current)return res.status(404).json({error:'competition_not_found'});
    const nextStatus=status||current.status;
    const nextPreset=languagePreset||current.language_preset;
    const nextNominations=allowNominations===undefined?current.allow_nominations:(allowNominations?1:0);
    if(!['DRAFT','OPEN','LIVE','COMPLETE','ARCHIVED'].includes(nextStatus))return res.status(400).json({error:'invalid_competition_status'});
    if(!supportedLanguagePresets().includes(nextPreset))return res.status(400).json({error:'invalid_language_preset'});
    await pool.query(
      'UPDATE competitions SET status=?,language_preset=?,allow_nominations=? WHERE id=?',
      [nextStatus,nextPreset,nextNominations,id]
    );
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_UPDATED','COMPETITION',String(id),JSON.stringify({
        before:{status:current.status,languagePreset:current.language_preset,allowNominations:Boolean(current.allow_nominations)},
        after:{status:nextStatus,languagePreset:nextPreset,allowNominations:Boolean(nextNominations)}
      })]
    );
    res.json({ok:true});
  }catch(e){next(e)}
});


router.get('/:id/choices',async(req,res,next)=>{
  try{
    const competitionId=Number(req.params.id);
    if(!Number.isInteger(competitionId)||competitionId<1)return res.status(400).json({error:'invalid_competition'});
    const [rows]=await pool.query(`
      SELECT cc.id,cc.name,cc.short_name,cc.code,cc.choice_type,cc.status,cc.target,cc.sort_order,
        (SELECT COUNT(*) FROM competition_supporters cs WHERE cs.competition_id=cc.competition_id AND cs.choice_id=cc.id AND cs.status='ACTIVE') supporter_count
      FROM competition_choices cc
      WHERE cc.competition_id=?
      ORDER BY cc.sort_order,cc.name
    `,[competitionId]);
    res.json({choices:rows.map(x=>({...x,id:Number(x.id),target:x.target===null?null:Number(x.target),supporter_count:Number(x.supporter_count||0)}))});
  }catch(e){next(e)}
});

router.post('/:id/choices',async(req,res,next)=>{
  const competitionId=Number(req.params.id);
  const name=clean(req.body?.name,140);
  const shortName=clean(req.body?.shortName||name,80)||null;
  const code=clean(req.body?.code||name,24).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);
  const targetRaw=req.body?.target;
  const target=targetRaw===null||targetRaw===undefined||targetRaw===''?null:Number(targetRaw);
  if(!Number.isInteger(competitionId)||competitionId<1)return res.status(400).json({error:'invalid_competition'});
  if(name.length<2||!code)return res.status(400).json({error:'choice_name_required'});
  if(target!==null&&(!Number.isInteger(target)||target<1))return res.status(400).json({error:'invalid_target'});
  try{
    const [[competition]]=await pool.query('SELECT id,choice_type FROM competitions WHERE id=? LIMIT 1',[competitionId]);
    if(!competition)return res.status(404).json({error:'competition_not_found'});
    const [r]=await pool.query(`
      INSERT INTO competition_choices(competition_id,name,short_name,code,choice_type,target)
      VALUES (?,?,?,?,?,?)
    `,[competitionId,name,shortName,code,competition.choice_type,target]);
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_CHOICE_ADDED','COMPETITION_CHOICE',String(r.insertId),JSON.stringify({competitionId,name,code,target})]
    );
    res.status(201).json({ok:true,id:Number(r.insertId)});
  }catch(e){
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'choice_already_exists'});
    next(e);
  }
});


router.get('/:id/stages',async(req,res,next)=>{
  try{
    const competitionId=Number(req.params.id);
    if(!Number.isInteger(competitionId)||competitionId<1)return res.status(400).json({error:'invalid_competition'});
    const [stages]=await pool.query(`
      SELECT id,code,name,stage_type,sequence_no,status,rule_type,target,advance_count,group_size,starts_at,ends_at
      FROM competition_stages
      WHERE competition_id=?
      ORDER BY sequence_no
    `,[competitionId]);
    const out=[];
    for(const stage of stages){
      const [choices]=await pool.query(`
        SELECT csc.choice_id,csc.group_code,csc.seed_no,csc.entry_supporter_count,csc.final_supporter_count,csc.result_status,
          cc.code,cc.name,
          (SELECT COUNT(*) FROM competition_supporters cs WHERE cs.competition_id=? AND cs.choice_id=cc.id AND cs.status='ACTIVE') supporter_count
        FROM competition_stage_choices csc
        JOIN competition_choices cc ON cc.id=csc.choice_id
        WHERE csc.stage_id=?
        ORDER BY COALESCE(csc.group_code,''),csc.seed_no,cc.name
      `,[competitionId,stage.id]);
      out.push({...stage,id:Number(stage.id),target:stage.target===null?null:Number(stage.target),advance_count:stage.advance_count===null?null:Number(stage.advance_count),group_size:stage.group_size===null?null:Number(stage.group_size),choices:choices.map(x=>({...x,choice_id:Number(x.choice_id),supporter_count:Number(x.supporter_count||0),entry_supporter_count:Number(x.entry_supporter_count||0),final_supporter_count:x.final_supporter_count===null?null:Number(x.final_supporter_count)}))});
    }
    res.json({stages:out});
  }catch(e){next(e)}
});

router.patch('/:id/stages/:stageId',async(req,res,next)=>{
  const competitionId=Number(req.params.id);
  const stageId=Number(req.params.stageId);
  if(!Number.isInteger(competitionId)||competitionId<1||!Number.isInteger(stageId)||stageId<1)return res.status(400).json({error:'invalid_stage'});
  const name=clean(req.body?.name,100);
  const ruleType=clean(req.body?.ruleType,30).toUpperCase();
  const target=req.body?.target===null||req.body?.target===''?null:Number(req.body?.target);
  const advanceCount=req.body?.advanceCount===null||req.body?.advanceCount===''?null:Number(req.body?.advanceCount);
  const groupSize=req.body?.groupSize===null||req.body?.groupSize===''?null:Number(req.body?.groupSize);
  try{
    const [[stage]]=await pool.query('SELECT * FROM competition_stages WHERE id=? AND competition_id=? LIMIT 1',[stageId,competitionId]);
    if(!stage)return res.status(404).json({error:'competition_stage_not_found'});
    const nextName=name||stage.name;
    const nextRule=ruleType||stage.rule_type;
    const nextTarget=req.body?.target===undefined?stage.target:target;
    const nextAdvance=req.body?.advanceCount===undefined?stage.advance_count:advanceCount;
    const nextGroupSize=req.body?.groupSize===undefined?stage.group_size:groupSize;
    if(!['TARGET','TOP_N','TARGET_OR_TOP_N','HIGHEST_AT_CLOSE'].includes(nextRule))return res.status(400).json({error:'invalid_stage_rule'});
    if(nextTarget!==null&&(!Number.isInteger(nextTarget)||nextTarget<1))return res.status(400).json({error:'invalid_target'});
    if(nextAdvance!==null&&(!Number.isInteger(nextAdvance)||nextAdvance<1))return res.status(400).json({error:'invalid_advance_count'});
    if(nextGroupSize!==null&&(!Number.isInteger(nextGroupSize)||nextGroupSize<2))return res.status(400).json({error:'invalid_group_size'});
    await pool.query(
      'UPDATE competition_stages SET name=?,rule_type=?,target=?,advance_count=?,group_size=? WHERE id=? AND competition_id=?',
      [nextName,nextRule,nextTarget,nextAdvance,nextGroupSize,stageId,competitionId]
    );
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_STAGE_UPDATED','COMPETITION_STAGE',String(stageId),JSON.stringify({competitionId,before:{name:stage.name,ruleType:stage.rule_type,target:stage.target,advanceCount:stage.advance_count,groupSize:stage.group_size},after:{name:nextName,ruleType:nextRule,target:nextTarget,advanceCount:nextAdvance,groupSize:nextGroupSize}})]
    );
    res.json({ok:true});
  }catch(e){next(e)}
});

router.post('/:id/stages/:stageId/open',async(req,res,next)=>{
  try{
    const competitionId=Number(req.params.id),stageId=Number(req.params.stageId);
    const result=await openCompetitionStage({competitionId,stageId,actorUserId:req.admin?.user_id||null});
    res.json(result);
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}
});

router.post('/:id/stages/:stageId/close',async(req,res,next)=>{
  try{
    const competitionId=Number(req.params.id),stageId=Number(req.params.stageId);
    const result=await closeCompetitionStage({competitionId,stageId,actorUserId:req.admin?.user_id||null});
    res.json(result);
  }catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e)}
});

router.get('/:id/nominations',async(req,res,next)=>{
  try{
    const competitionId=Number(req.params.id);
    if(!Number.isInteger(competitionId)||competitionId<1)return res.status(400).json({error:'invalid_competition'});
    const [rows]=await pool.query(`
      SELECT id,name,location_text,note,status,created_at
      FROM competition_nominations
      WHERE competition_id=?
      ORDER BY FIELD(status,'PENDING','APPROVED','MERGED','REJECTED'),created_at DESC
      LIMIT 200
    `,[competitionId]);
    res.json({nominations:rows});
  }catch(e){next(e)}
});

router.patch('/nominations/:nominationId',async(req,res,next)=>{
  const nominationId=Number(req.params.nominationId);
  const status=clean(req.body?.status,20).toUpperCase();
  if(!Number.isInteger(nominationId)||nominationId<1)return res.status(400).json({error:'invalid_nomination'});
  if(!['APPROVED','MERGED','REJECTED'].includes(status))return res.status(400).json({error:'invalid_nomination_status'});
  try{
    const [[row]]=await pool.query('SELECT id,competition_id,name,status FROM competition_nominations WHERE id=? LIMIT 1',[nominationId]);
    if(!row)return res.status(404).json({error:'nomination_not_found'});
    await pool.query(
      'UPDATE competition_nominations SET status=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?',
      [status,req.admin?.user_id||null,nominationId]
    );
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'COMPETITION_NOMINATION_REVIEWED','COMPETITION_NOMINATION',String(nominationId),JSON.stringify({competitionId:row.competition_id,name:row.name,before:row.status,after:status})]
    );
    res.json({ok:true,status});
  }catch(e){next(e)}
});

export default router;