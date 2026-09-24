import { pool } from './pool.js';

await pool.query(`
  INSERT INTO seasons(id,name,status,starts_at)
  VALUES (1,'Somali Cup','QUALIFICATION',NULL)
  ON DUPLICATE KEY UPDATE name=VALUES(name)
`);

await pool.end();
console.log('seeded empty Somali Cup container — no cities, supporters, matches or demo content');
