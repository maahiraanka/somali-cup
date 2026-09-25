import crypto from 'node:crypto';
import { pool } from './db/pool.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const makePublicId = () => crypto.randomBytes(13).toString('hex');
export const makeSessionToken = () => crypto.randomBytes(32).toString('base64url');
export const hashSessionToken = sha256;
export const hashDeviceKey = sha256;
export const makeAdminToken = () => crypto.randomBytes(32).toString('base64url');

export async function createSession(userId, userAgent='', db=pool) {
  const token = makeSessionToken();
  const tokenHash = hashSessionToken(token);
  const userAgentHash = userAgent ? sha256(userAgent) : null;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db.query(
    'INSERT INTO identity_sessions(user_id,token_hash,user_agent_hash,expires_at) VALUES (?,?,?,?)',
    [userId, tokenHash, userAgentHash, expiresAt]
  );
  return { token, expiresAt };
}

export async function requireSession(req,res,next){
  try{
    const auth=req.get('authorization')||'';
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token) return res.status(401).json({error:'auth_required'});
    const tokenHash=hashSessionToken(token);
    const [[row]]=await pool.query(`
      SELECT s.id session_id,s.user_id,u.public_id,u.display_name,u.nickname,u.email,u.role,u.status,u.home_city_id
      FROM identity_sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>UTC_TIMESTAMP() AND u.status='ACTIVE'
      LIMIT 1`,[tokenHash]);
    if(!row) return res.status(401).json({error:'invalid_session'});
    req.identity=row;
    await pool.query('UPDATE identity_sessions SET last_used_at=UTC_TIMESTAMP() WHERE id=?',[row.session_id]);
    next();
  }catch(e){next(e)}
}

export async function requireAdminKey(req,res,next){
  try{
    const expected=process.env.ADMIN_BOOTSTRAP_KEY||'';
    const supplied=req.get('x-admin-key')||'';
    if(expected && supplied===expected){
      req.admin={bootstrap:true,user_id:null,role:'ADMIN'};
      return next();
    }

    const auth=req.get('authorization')||'';
    const token=auth.startsWith('Bearer ')?auth.slice(7):'';
    if(!token) return res.status(403).json({error:'admin_auth_required'});
    const tokenHash=sha256(token);
    const [[row]]=await pool.query(`
      SELECT s.id session_id,s.user_id,u.public_id,u.display_name,u.email,u.role,u.status
      FROM admin_sessions s
      JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL
        AND s.expires_at>UTC_TIMESTAMP()
        AND u.status='ACTIVE' AND u.role='ADMIN'
      LIMIT 1
    `,[tokenHash]);
    if(!row) return res.status(403).json({error:'invalid_admin_session'});
    req.admin=row;
    await pool.query('UPDATE admin_sessions SET last_used_at=UTC_TIMESTAMP() WHERE id=?',[row.session_id]);
    next();
  }catch(e){next(e)}
}
