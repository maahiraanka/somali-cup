import { Router } from 'express';
import { pool } from '../db/pool.js';
import { languageFor } from '../competitionLanguage.js';

const router=Router();
const clean=(v,max=140)=>typeof v==='string'?v.trim().slice(0,max):'';

const shapeCompetition=row=>({
  id:Number(row.id),
  slug:row.slug,
  name:row.name,
  shortName:row.short_name,
  type:row.competition_type,
  choiceType:row.choice_type,
  status:row.status,
  allowNominations:Boolean(row.allow_nominations),
  startsAt:row.starts_at,
  endsAt:row.ends_at,
  language:languageFor(row.language_preset,row.language_overrides_json)
});

router.get('/',async(_req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT id,slug,name,short_name,competition_type,choice_type,language_preset,
        language_overrides_json,status,allow_nominations,starts_at,ends_at
      FROM competitions
      WHERE status IN ('OPEN','LIVE','COMPLETE')
      ORDER BY FIELD(status,'LIVE','OPEN','COMPLETE'),starts_at DESC,id DESC
    `);
    res.json({competitions:rows.map(shapeCompetition)});
  }catch(e){next(e)}
});

router.get('/:slug',async(req,res,next)=>{
  try{
    const slug=clean(req.params.slug,80).toLowerCase();
    const [[competition]]=await pool.query(`
      SELECT id,slug,name,short_name,competition_type,choice_type,language_preset,
        language_overrides_json,status,allow_nominations,starts_at,ends_at
      FROM competitions WHERE slug=? LIMIT 1
    `,[slug]);
    if(!competition)return res.status(404).json({error:'competition_not_found'});
    const [choices]=await pool.query(`
      SELECT id,name,short_name,code,choice_type,status,target,sort_order,metadata_json
      FROM competition_choices
      WHERE competition_id=? AND status<>'PAUSED'
      ORDER BY sort_order,name
    `,[competition.id]);
    res.json({
      competition:shapeCompetition(competition),
      choices:choices.map(c=>({...c,id:Number(c.id),target:c.target===null?null:Number(c.target)}))
    });
  }catch(e){next(e)}
});

router.post('/:slug/nominations',async(req,res,next)=>{
  try{
    const slug=clean(req.params.slug,80).toLowerCase();
    const name=clean(req.body?.name,140);
    const location=clean(req.body?.location,160)||null;
    const note=clean(req.body?.note,500)||null;
    if(name.length<2)return res.status(400).json({error:'name_required'});
    const [[competition]]=await pool.query('SELECT id,allow_nominations,status FROM competitions WHERE slug=? LIMIT 1',[slug]);
    if(!competition)return res.status(404).json({error:'competition_not_found'});
    if(!competition.allow_nominations)return res.status(409).json({error:'nominations_not_open'});
    if(!['OPEN','LIVE'].includes(competition.status))return res.status(409).json({error:'competition_not_open'});
    const [[duplicate]]=await pool.query(
      'SELECT id FROM competition_nominations WHERE competition_id=? AND LOWER(name)=LOWER(?) AND status IN (\'PENDING\',\'APPROVED\') LIMIT 1',
      [competition.id,name]
    );
    if(duplicate)return res.status(409).json({error:'already_suggested'});
    const [result]=await pool.query(
      'INSERT INTO competition_nominations(competition_id,name,location_text,note) VALUES (?,?,?,?)',
      [competition.id,name,location,note]
    );
    res.status(201).json({ok:true,nominationId:Number(result.insertId),message:'Thanks. We will review it.'});
  }catch(e){next(e)}
});

export default router;