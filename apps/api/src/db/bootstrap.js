import { pool } from './pool.js';

export async function bootstrapDatabase(){
  // Production startup must be fast and non-destructive.
  // Schema migrations are run explicitly with: npm run db:migrate
  const conn=await pool.getConnection();
  try{
    await conn.query('SELECT 1');
    const [[check]]=await conn.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='admin_credentials') admin_credentials_table,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='seasons') seasons_table
    `);
    if(!Number(check.admin_credentials_table)||!Number(check.seasons_table)){
      throw new Error('database_schema_not_ready_run_npm_run_db_migrate');
    }
    console.log('[db] startup connection verified');
  }finally{
    conn.release();
  }
}
