import { pool } from './db/pool.js';

export async function recordLaunchEvidence({runType,status,failures=0,warnings=0,origin=null,evidence={}}){
  try{
    await pool.query(`
      INSERT INTO launch_acceptance_runs(run_type,status,failures,warnings,origin,evidence_json)
      VALUES (?,?,?,?,?,?)
    `,[runType,status,Number(failures)||0,Number(warnings)||0,origin||null,JSON.stringify(evidence||{})]);
    return true;
  }catch(e){
    console.warn('[launch-evidence] could not record',runType,e.message);
    return false;
  }
}
