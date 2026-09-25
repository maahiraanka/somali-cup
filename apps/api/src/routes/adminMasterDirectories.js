import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';

const router=Router();
router.use(requireAdminKey);

const allowedTypes=new Set(['UNIVERSITY','CLUB']);
const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const cleanCode=v=>clean(v,24).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,24);
const aliasesFrom=value=>{
  const input=Array.isArray(value)?value:String(value||'').split(',');
  return [...new Set(input.map(x=>clean(x,120)).filter(Boolean))].slice(0,30);
};

async function ensureSchema(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_directory_entries (
      id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
      entity_type VARCHAR(30) NOT NULL,
      name VARCHAR(140) NOT NULL,
      short_name VARCHAR(100) NULL,
      code VARCHAR(24) NOT NULL,
      country VARCHAR(120) NULL,
      region VARCHAR(120) NULL,
      category VARCHAR(120) NULL,
      aliases_json JSON NULL,
      image_url VARCHAR(500) NULL,
      metadata_json JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_master_directory_type_code(entity_type,code),
      INDEX ix_master_directory_type_active(entity_type,is_active),
      INDEX ix_master_directory_name(entity_type,name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [[column]]=await pool.query(`
    SELECT COUNT(*) total FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='competition_choices' AND column_name='master_entry_id'
  `);
  if(Number(column.total||0)===0){
    await pool.query('ALTER TABLE competition_choices ADD COLUMN master_entry_id BIGINT UNSIGNED NULL AFTER legacy_city_id');
  }

  const [[uniqueIndex]]=await pool.query(`
    SELECT COUNT(*) total FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name='competition_choices' AND index_name='uq_competition_master_entry'
  `);
  if(Number(uniqueIndex.total||0)===0){
    await pool.query('ALTER TABLE competition_choices ADD UNIQUE KEY uq_competition_master_entry(competition_id,master_entry_id)');
  }

  const [[lookupIndex]]=await pool.query(`
    SELECT COUNT(*) total FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name='competition_choices' AND index_name='ix_competition_choice_master'
  `);
  if(Number(lookupIndex.total||0)===0){
    await pool.query('ALTER TABLE competition_choices ADD INDEX ix_competition_choice_master(master_entry_id)');
  }

  const [[fk]]=await pool.query(`
    SELECT COUNT(*) total FROM information_schema.table_constraints
    WHERE table_schema=DATABASE()
      AND table_name='competition_choices'
      AND constraint_name='fk_competition_choice_master'
      AND constraint_type='FOREIGN KEY'
  `);
  if(Number(fk.total||0)===0){
    await pool.query(`
      ALTER TABLE competition_choices
      ADD CONSTRAINT fk_competition_choice_master
      FOREIGN KEY(master_entry_id) REFERENCES master_directory_entries(id)
    `);
  }

  await pool.query("INSERT IGNORE INTO schema_migrations(filename) VALUES ('026_master_directories.sql')");
}

router.use(async(_req,_res,next)=>{
  try{await ensureSchema();next()}catch(e){next(e)}
});

const typeOf=req=>{
  const type=String(req.params.type||'').toUpperCase();
  return allowedTypes.has(type)?type:null;
};

router.get('/:type',async(req,res,next)=>{
  const type=typeOf(req);
  if(!type)return res.status(404).json({error:'directory_type_not_found'});
  try{
    const [rows]=await pool.query(`
      SELECT m.*,
        (SELECT COUNT(*) FROM competition_choices cc WHERE cc.master_entry_id=m.id) competition_count
      FROM master_directory_entries m
      WHERE m.entity_type=?
      ORDER BY m.is_active DESC,m.name
    `,[type]);
    res.json({
      type,
      entries:rows.map(x=>({
        ...x,
        id:Number(x.id),
        is_active:Boolean(x.is_active),
        aliases:Array.isArray(x.aliases_json)?x.aliases_json:[],
        competition_count:Number(x.competition_count||0)
      }))
    });
  }catch(e){next(e)}
});

router.post('/:type',async(req,res,next)=>{
  const type=typeOf(req);
  if(!type)return res.status(404).json({error:'directory_type_not_found'});
  const name=clean(req.body?.name,140);
  const shortName=clean(req.body?.shortName||name,100)||null;
  const code=cleanCode(req.body?.code||name);
  const country=clean(req.body?.country,120)||null;
  const region=clean(req.body?.region,120)||null;
  const category=clean(req.body?.category,120)||null;
  const aliases=aliasesFrom(req.body?.aliases);
  const imageUrl=clean(req.body?.imageUrl,500)||null;

  if(name.length<2)return res.status(400).json({error:'entry_name_required'});
  if(!code)return res.status(400).json({error:'entry_code_required'});

  try{
    const [[dupe]]=await pool.query(
      'SELECT id FROM master_directory_entries WHERE entity_type=? AND LOWER(name)=LOWER(?) LIMIT 1',
      [type,name]
    );
    if(dupe)return res.status(409).json({error:'directory_entry_exists'});
    const [r]=await pool.query(`
      INSERT INTO master_directory_entries(
        entity_type,name,short_name,code,country,region,category,aliases_json,image_url,is_active
      ) VALUES (?,?,?,?,?,?,?,?,?,1)
    `,[type,name,shortName,code,country,region,category,JSON.stringify(aliases),imageUrl]);
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_DIRECTORY_ENTRY_CREATED',type,String(r.insertId),JSON.stringify({name,code,country,region,category})]
    );
    res.status(201).json({ok:true,id:Number(r.insertId)});
  }catch(e){
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'directory_code_exists'});
    next(e);
  }
});

router.post('/:type/bulk',async(req,res,next)=>{
  const type=typeOf(req);
  if(!type)return res.status(404).json({error:'directory_type_not_found'});
  const input=Array.isArray(req.body?.entries)?req.body.entries:[];
  if(!input.length)return res.status(400).json({error:'entries_required'});
  if(input.length>300)return res.status(400).json({error:'too_many_entries'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const created=[],skipped=[];
    for(let i=0;i<input.length;i++){
      const item=input[i]||{};
      const name=clean(item.name,140);
      const code=cleanCode(item.code||name);
      const country=clean(item.country,120)||null;
      const region=clean(item.region,120)||null;
      const category=clean(item.category,120)||null;
      if(name.length<2||!code){skipped.push({index:i,name:name||null,reason:'invalid'});continue}
      const [[dupe]]=await conn.query(
        'SELECT id FROM master_directory_entries WHERE entity_type=? AND (code=? OR LOWER(name)=LOWER(?)) LIMIT 1',
        [type,code,name]
      );
      if(dupe){skipped.push({index:i,name,reason:'duplicate'});continue}
      const [r]=await conn.query(`
        INSERT INTO master_directory_entries(entity_type,name,short_name,code,country,region,category,aliases_json,is_active)
        VALUES (?,?,?,?,?,?,?,JSON_ARRAY(),1)
      `,[type,name,name,code,country,region,category]);
      created.push({id:Number(r.insertId),name,code});
    }
    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_DIRECTORY_BULK_CREATED',type+'_SET','bulk',JSON.stringify({type,created:created.length,skipped:skipped.length})]
    );
    await conn.commit();
    res.status(201).json({ok:true,created,skipped});
  }catch(e){await conn.rollback();next(e)}finally{conn.release()}
});

router.patch('/:type/:id',async(req,res,next)=>{
  const type=typeOf(req);
  const id=Number(req.params.id);
  if(!type)return res.status(404).json({error:'directory_type_not_found'});
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_directory_entry'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[current]]=await conn.query(
      'SELECT * FROM master_directory_entries WHERE id=? AND entity_type=? LIMIT 1 FOR UPDATE',
      [id,type]
    );
    if(!current)throw Object.assign(new Error('directory_entry_not_found'),{status:404});

    const name=clean(req.body?.name,140)||current.name;
    const shortName=req.body?.shortName===undefined?current.short_name:(clean(req.body.shortName,100)||name);
    const code=req.body?.code===undefined?current.code:cleanCode(req.body.code);
    const country=req.body?.country===undefined?current.country:(clean(req.body.country,120)||null);
    const region=req.body?.region===undefined?current.region:(clean(req.body.region,120)||null);
    const category=req.body?.category===undefined?current.category:(clean(req.body.category,120)||null);
    const aliases=req.body?.aliases===undefined?(Array.isArray(current.aliases_json)?current.aliases_json:[]):aliasesFrom(req.body.aliases);
    const imageUrl=req.body?.imageUrl===undefined?current.image_url:(clean(req.body.imageUrl,500)||null);
    const isActive=req.body?.isActive===undefined?Boolean(current.is_active):Boolean(req.body.isActive);

    if(name.length<2||!code)throw Object.assign(new Error('invalid_directory_entry'),{status:400});
    const [[dupe]]=await conn.query(
      'SELECT id FROM master_directory_entries WHERE entity_type=? AND id<>? AND LOWER(name)=LOWER(?) LIMIT 1',
      [type,id,name]
    );
    if(dupe)throw Object.assign(new Error('directory_entry_exists'),{status:409});

    await conn.query(`
      UPDATE master_directory_entries
      SET name=?,short_name=?,code=?,country=?,region=?,category=?,aliases_json=?,image_url=?,is_active=?
      WHERE id=? AND entity_type=?
    `,[name,shortName,code,country,region,category,JSON.stringify(aliases),imageUrl,isActive?1:0,id,type]);

    await conn.query(`
      UPDATE competition_choices
      SET name=?,short_name=?,code=?,
          metadata_json=JSON_OBJECT('country',?,'region',?,'category',?,'imageUrl',?)
      WHERE master_entry_id=?
    `,[name,shortName,code,country,region,category,imageUrl,id]);

    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_DIRECTORY_ENTRY_UPDATED',type,String(id),JSON.stringify({
        before:{name:current.name,code:current.code,isActive:Boolean(current.is_active)},
        after:{name,code,isActive},
        propagatedToCompetitions:true
      })]
    );
    await conn.commit();
    res.json({ok:true});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'directory_code_exists'});
    next(e);
  }finally{conn.release()}
});

router.delete('/:type/:id',async(req,res,next)=>{
  const type=typeOf(req);
  const id=Number(req.params.id);
  const confirmation=clean(req.body?.confirmation,180);
  if(!type)return res.status(404).json({error:'directory_type_not_found'});
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_directory_entry'});
  try{
    const [[entry]]=await pool.query(
      'SELECT id,name FROM master_directory_entries WHERE id=? AND entity_type=? LIMIT 1',
      [id,type]
    );
    if(!entry)return res.status(404).json({error:'directory_entry_not_found'});
    if(confirmation!==('DELETE '+entry.name))return res.status(400).json({error:'confirmation_required'});
    const [[usage]]=await pool.query(
      'SELECT COUNT(*) total FROM competition_choices WHERE master_entry_id=?',
      [id]
    );
    if(Number(usage.total||0)>0)return res.status(409).json({error:'directory_entry_in_use',competitions:Number(usage.total||0)});
    await pool.query('DELETE FROM master_directory_entries WHERE id=? AND entity_type=?',[id,type]);
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_DIRECTORY_ENTRY_DELETED',type,String(id),JSON.stringify({name:entry.name})]
    );
    res.json({ok:true});
  }catch(e){next(e)}
});

export default router;