import { pool } from './db/pool.js';
import { clearPublicCompetitionContent } from '../competitionDefaults.js';

const conn=await pool.getConnection();

try{
  console.log('[factory-reset] starting');
  await conn.beginTransaction();

  const result=await clearPublicCompetitionContent(conn);

  const [[proof]]=await conn.query(`
    SELECT
      (SELECT COUNT(*) FROM cities) cities,
      (SELECT COUNT(*) FROM city_memberships) city_memberships,
      (SELECT COUNT(*) FROM matches) matches,
      (SELECT COUNT(*) FROM competitions) competitions,
      (SELECT COUNT(*) FROM competition_choices) competition_choices,
      (SELECT COUNT(*) FROM competition_supporters) competition_supporters,
      (SELECT COUNT(*) FROM users WHERE role<>'ADMIN') non_admin_users,
      (SELECT COUNT(*) FROM users WHERE role='ADMIN') admins
  `);

  const expectedZero=[
    'cities',
    'city_memberships',
    'matches',
    'competitions',
    'competition_choices',
    'competition_supporters',
    'non_admin_users'
  ];
  const dirty=expectedZero.filter(key=>Number(proof[key]||0)!==0);

  if(dirty.length){
    throw new Error('factory_reset_not_clean: '+dirty.map(key=>key+'='+proof[key]).join(', '));
  }

  await conn.query(
    'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,metadata_json) VALUES (NULL,?,?,?,?)',
    ['FACTORY_RESET_CLI_COMPLETED','SYSTEM','factory-reset-cli',JSON.stringify({...result,proof})]
  );

  await conn.commit();

  console.log('[factory-reset] PASS');
  console.log(JSON.stringify({
    ok:true,
    proof:{
      cities:Number(proof.cities||0),
      supporters:Number(proof.city_memberships||0),
      matches:Number(proof.matches||0),
      competitions:Number(proof.competitions||0),
      choices:Number(proof.competition_choices||0),
      competitionSupporters:Number(proof.competition_supporters||0),
      nonAdminUsers:Number(proof.non_admin_users||0),
      admins:Number(proof.admins||0)
    }
  },null,2));
}catch(error){
  await conn.rollback();
  console.error('[factory-reset] FAIL',error?.message||error);
  process.exitCode=1;
}finally{
  conn.release();
  await pool.end();
}
