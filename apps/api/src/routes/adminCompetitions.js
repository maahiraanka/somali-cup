import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';
import { languageFor, supportedLanguagePresets } from '../competitionLanguage.js';
import { closeCompetitionStage, openCompetitionStage } from '../competitionProgress.js';

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