import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAdminKey } from '../auth.js';

const router=Router();
router.use(requireAdminKey);

const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const cleanCode=v=>clean(v,12).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
async function ensureCityDirectorySchema(){
  const columns=[
    ['region',"ALTER TABLE cities ADD COLUMN region VARCHAR(120) NULL AFTER country"],
    ['aliases_json',"ALTER TABLE cities ADD COLUMN aliases_json JSON NULL AFTER tier"],
    ['image_url',"ALTER TABLE cities ADD COLUMN image_url VARCHAR(500) NULL AFTER aliases_json"],
    ['updated_at',"ALTER TABLE cities ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at"]
  ];
  for(const [column,sql] of columns){
    const [[r]]=await pool.query(`
      SELECT COUNT(*) total FROM information_schema.columns
      WHERE table_schema=DATABASE() AND table_name='cities' AND column_name=?
    `,[column]);
    if(Number(r.total||0)===0)await pool.query(sql);
  }
  const indexes=[
    ['ix_cities_country_active',"ALTER TABLE cities ADD INDEX ix_cities_country_active(country,is_active)"],
    ['ix_cities_region',"ALTER TABLE cities ADD INDEX ix_cities_region(region)"]
  ];
  for(const [index,sql] of indexes){
    const [[r]]=await pool.query(`
      SELECT COUNT(*) total FROM information_schema.statistics
      WHERE table_schema=DATABASE() AND table_name='cities' AND index_name=?
    `,[index]);
    if(Number(r.total||0)===0)await pool.query(sql);
  }
  await pool.query("INSERT IGNORE INTO schema_migrations(filename) VALUES ('025_master_city_directory.sql')");
}

router.use(async(_req,_res,next)=>{
  try{await ensureCityDirectorySchema();next()}catch(e){next(e)}
});

const aliasesFrom=value=>{
  const input=Array.isArray(value)?value:String(value||'').split(',');
  return [...new Set(input.map(x=>clean(x,120)).filter(Boolean))].slice(0,20);
};

async function usageFor(cityId){
  const [[row]]=await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM competition_choices WHERE legacy_city_id=?) competition_choices,
      (SELECT COUNT(*) FROM season_cities WHERE city_id=?) season_links,
      (SELECT COUNT(*) FROM matches WHERE home_city_id=? OR away_city_id=?) matches,
      (SELECT COUNT(*) FROM city_memberships WHERE city_id=?) memberships
  `,[cityId,cityId,cityId,cityId,cityId]);
  return {
    competitions:Number(row.competition_choices||0),
    seasons:Number(row.season_links||0),
    matches:Number(row.matches||0),
    memberships:Number(row.memberships||0)
  };
}

router.get('/',async(_req,res,next)=>{
  try{
    const [rows]=await pool.query(`
      SELECT c.id,c.name,c.country,c.region,c.code,c.tier,c.aliases_json,c.image_url,c.is_active,c.created_at,c.updated_at,
        (SELECT COUNT(*) FROM competition_choices cc WHERE cc.legacy_city_id=c.id) competition_count,
        (SELECT COUNT(*) FROM season_cities sc WHERE sc.city_id=c.id) season_count
      FROM cities c
      ORDER BY c.is_active DESC,c.name
    `);
    res.json({cities:rows.map(x=>({
      ...x,
      id:Number(x.id),
      is_active:Boolean(x.is_active),
      aliases:Array.isArray(x.aliases_json)?x.aliases_json:[],
      competition_count:Number(x.competition_count||0),
      season_count:Number(x.season_count||0)
    }))});
  }catch(e){next(e)}
});

router.post('/',async(req,res,next)=>{
  const name=clean(req.body?.name,120);
  const country=clean(req.body?.country||'Somalia',120);
  const region=clean(req.body?.region,120)||null;
  const code=cleanCode(req.body?.code||name);
  const tier=clean(req.body?.tier||'PREMIER',20).toUpperCase();
  const aliases=aliasesFrom(req.body?.aliases);
  const imageUrl=clean(req.body?.imageUrl,500)||null;

  if(name.length<2)return res.status(400).json({error:'city_name_required'});
  if(!code)return res.status(400).json({error:'city_code_required'});
  if(!['PREMIER','CHAMPIONSHIP','RISING'].includes(tier))return res.status(400).json({error:'invalid_city_tier'});

  try{
    const [[duplicate]]=await pool.query(
      'SELECT id FROM cities WHERE LOWER(name)=LOWER(?) AND LOWER(country)=LOWER(?) LIMIT 1',
      [name,country]
    );
    if(duplicate)return res.status(409).json({error:'city_already_exists'});
    const [r]=await pool.query(`
      INSERT INTO cities(name,country,region,code,tier,aliases_json,image_url,is_active)
      VALUES (?,?,?,?,?,?,?,1)
    `,[name,country,region,code,tier,JSON.stringify(aliases),imageUrl]);
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_CITY_CREATED','CITY',String(r.insertId),JSON.stringify({name,country,region,code,tier})]
    );
    res.status(201).json({ok:true,id:Number(r.insertId)});
  }catch(e){
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'city_code_exists'});
    next(e);
  }
});


router.post('/bulk',async(req,res,next)=>{
  const input=Array.isArray(req.body?.cities)?req.body.cities:[];
  if(!input.length)return res.status(400).json({error:'cities_required'});
  if(input.length>200)return res.status(400).json({error:'too_many_cities'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const created=[];
    const skipped=[];
    for(let i=0;i<input.length;i++){
      const item=input[i]||{};
      const name=clean(item.name,120);
      const country=clean(item.country||'Somalia',120);
      const region=clean(item.region,120)||null;
      const code=cleanCode(item.code||name);
      const tier=clean(item.tier||'PREMIER',20).toUpperCase();
      if(name.length<2||!code||!['PREMIER','CHAMPIONSHIP','RISING'].includes(tier)){
        skipped.push({index:i,name:name||null,reason:'invalid'});
        continue;
      }
      const [[dupe]]=await conn.query(
        'SELECT id FROM cities WHERE code=? OR (LOWER(name)=LOWER(?) AND LOWER(country)=LOWER(?)) LIMIT 1',
        [code,name,country]
      );
      if(dupe){skipped.push({index:i,name,reason:'duplicate'});continue}
      const [r]=await conn.query(
        'INSERT INTO cities(name,country,region,code,tier,aliases_json,is_active) VALUES (?,?,?,?,?,JSON_ARRAY(),1)',
        [name,country,region,code,tier]
      );
      created.push({id:Number(r.insertId),name,code});
    }
    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_CITIES_BULK_CREATED','CITY_SET','bulk',JSON.stringify({created:created.length,skipped:skipped.length})]
    );
    await conn.commit();
    res.status(201).json({ok:true,created,skipped});
  }catch(e){await conn.rollback();next(e)}finally{conn.release()}
});

router.patch('/:id',async(req,res,next)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_city'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [[current]]=await conn.query('SELECT * FROM cities WHERE id=? LIMIT 1 FOR UPDATE',[id]);
    if(!current)throw Object.assign(new Error('city_not_found'),{status:404});

    const name=clean(req.body?.name,120)||current.name;
    const country=clean(req.body?.country,120)||current.country;
    const region=req.body?.region===undefined?current.region:(clean(req.body.region,120)||null);
    const code=req.body?.code===undefined?current.code:cleanCode(req.body.code);
    const tier=clean(req.body?.tier||current.tier,20).toUpperCase();
    const aliases=req.body?.aliases===undefined?(Array.isArray(current.aliases_json)?current.aliases_json:[]):aliasesFrom(req.body.aliases);
    const imageUrl=req.body?.imageUrl===undefined?current.image_url:(clean(req.body.imageUrl,500)||null);
    const isActive=req.body?.isActive===undefined?Boolean(current.is_active):Boolean(req.body.isActive);

    if(name.length<2||!code)throw Object.assign(new Error('invalid_city'),{status:400});
    if(!['PREMIER','CHAMPIONSHIP','RISING'].includes(tier))throw Object.assign(new Error('invalid_city_tier'),{status:400});

    const [[duplicate]]=await conn.query(
      'SELECT id FROM cities WHERE id<>? AND LOWER(name)=LOWER(?) AND LOWER(country)=LOWER(?) LIMIT 1',
      [id,name,country]
    );
    if(duplicate)throw Object.assign(new Error('city_already_exists'),{status:409});

    await conn.query(`
      UPDATE cities
      SET name=?,country=?,region=?,code=?,tier=?,aliases_json=?,image_url=?,is_active=?
      WHERE id=?
    `,[name,country,region,code,tier,JSON.stringify(aliases),imageUrl,isActive?1:0,id]);

    await conn.query(`
      UPDATE competition_choices
      SET name=?,short_name=?,code=?,
          metadata_json=JSON_OBJECT('country',?,'region',?,'tier',?,'imageUrl',?)
      WHERE legacy_city_id=?
    `,[name,name,code,country,region,tier,imageUrl,id]);

    await conn.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_CITY_UPDATED','CITY',String(id),JSON.stringify({
        before:{name:current.name,country:current.country,region:current.region,code:current.code,tier:current.tier,isActive:Boolean(current.is_active)},
        after:{name,country,region,code,tier,isActive},
        propagatedToCompetitions:true
      })]
    );
    await conn.commit();
    res.json({ok:true});
  }catch(e){
    await conn.rollback();
    if(e.status)return res.status(e.status).json({error:e.message});
    if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'city_code_exists'});
    next(e);
  }finally{conn.release()}
});
router.delete('/:id',async(req,res,next)=>{
  const id=Number(req.params.id);
  const confirmation=clean(req.body?.confirmation,180);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({error:'invalid_city'});
  try{
    const [[city]]=await pool.query('SELECT id,name FROM cities WHERE id=? LIMIT 1',[id]);
    if(!city)return res.status(404).json({error:'city_not_found'});
    if(confirmation!==('DELETE '+city.name))return res.status(400).json({error:'confirmation_required'});
    const usage=await usageFor(id);
    const inUse=Object.values(usage).some(v=>v>0);
    if(inUse)return res.status(409).json({error:'city_in_use',usage});

    await pool.query('DELETE FROM cities WHERE id=?',[id]);
    await pool.query(
      'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?)',
      [req.admin?.user_id||null,'MASTER_CITY_DELETED','CITY',String(id),JSON.stringify({name:city.name})]
    );
    res.json({ok:true});
  }catch(e){next(e)}
});

export default router;