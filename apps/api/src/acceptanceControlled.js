import crypto from 'node:crypto';
import { pool } from './db/pool.js';
import { config } from './config.js';

const REQUIRED='I_UNDERSTAND_THIS_CREATES_TEMPORARY_RECORDS';
if(process.env.ACCEPTANCE_MUTATIONS!==REQUIRED){
  console.error('REFUSED controlled acceptance. Set ACCEPTANCE_MUTATIONS='+REQUIRED);
  process.exit(2);
}

const origin=String(process.env.ACCEPTANCE_ORIGIN||config.appOrigin||'').replace(/\/$/,'');
const adminKey=String(process.env.ACCEPTANCE_ADMIN_KEY||process.env.ADMIN_BOOTSTRAP_KEY||'');
if(!origin||!adminKey){
  console.error('REFUSED controlled acceptance. ACCEPTANCE_ORIGIN/APP_ORIGIN and ACCEPTANCE_ADMIN_KEY/ADMIN_BOOTSTRAP_KEY are required.');
  process.exit(2);
}
if(new URL(origin).protocol!=='https:'){
  console.error('REFUSED controlled acceptance. HTTPS origin required.');
  process.exit(2);
}

const stamp=Date.now().toString(36);
const deviceA='acceptance-a-'+crypto.randomBytes(24).toString('hex');
const deviceB='acceptance-b-'+crypto.randomBytes(24).toString('hex');
const nameA='Acceptance Alpha '+stamp;
const nameB='Acceptance Beta '+stamp;
const emailA='acceptance.'+stamp+'.a@somalicup.invalid';
const emailB='acceptance.'+stamp+'.b@somalicup.invalid';
let userA=null,userB=null,matchPublicId=null,seasonId=null,cityId=null;
let goalA=null,goalB=null;
let failures=0;

const pass=(name,detail='')=>console.log('PASS',name,detail);
const fail=(name,detail='')=>{failures++;console.error('FAIL',name,detail)};
async function api(path,{method='GET',body,token,admin=false}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const headers={'Content-Type':'application/json'};
    if(token)headers.Authorization='Bearer '+token;
    if(admin)headers['x-admin-key']=adminKey;
    const r=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const payload=await r.json().catch(()=>({}));
    if(!r.ok)throw Object.assign(new Error(payload.error||'request_failed'),{status:r.status,body:payload});
    return payload;
  }finally{clearTimeout(timer)}
}
async function check(name,fn){
  try{const detail=await fn();pass(name,detail||'')}
  catch(e){fail(name,e.message);throw e}
}

async function cleanup(){
  try{
    const ids=[];
    if(userA?.publicId||userB?.publicId){
      const [rows]=await pool.query('SELECT id,public_id FROM users WHERE public_id IN (?,?)',[userA?.publicId||'',userB?.publicId||'']);
      ids.push(...rows.map(r=>Number(r.id)));
    }
    let matchId=null;
    if(matchPublicId){
      const [[m]]=await pool.query('SELECT id FROM matches WHERE public_id=? LIMIT 1',[matchPublicId]);
      matchId=m?.id?Number(m.id):null;
    }

    if(matchId){
      await pool.query('DELETE FROM match_assists WHERE match_id=?',[matchId]);
      await pool.query('DELETE FROM scoring_events WHERE match_id=?',[matchId]);
      await pool.query('DELETE FROM match_participations WHERE match_id=?',[matchId]);
      await pool.query('DELETE FROM match_state_events WHERE match_id=?',[matchId]);
      await pool.query('DELETE FROM funnel_events WHERE match_id=?',[matchId]);
      await pool.query("DELETE FROM audit_log WHERE entity_type='MATCH' AND entity_id=?",[String(matchId)]);
      await pool.query('DELETE FROM matches WHERE id=?',[matchId]);
    }

    if(ids.length){
      const placeholders=ids.map(()=>'?').join(',');
      await pool.query(`DELETE FROM qualification_referrals WHERE referrer_user_id IN (${placeholders}) OR referred_user_id IN (${placeholders})`,[...ids,...ids]);
      await pool.query(`DELETE FROM qualification_events WHERE user_id IN (${placeholders})`,ids);
      await pool.query(`DELETE FROM funnel_events WHERE user_id IN (${placeholders})`,ids);
      await pool.query(`DELETE FROM identity_integrity_events WHERE user_id IN (${placeholders})`,ids);
      await pool.query(`DELETE FROM season_device_claims WHERE user_id IN (${placeholders})`,ids);
      await pool.query(`DELETE FROM identity_sessions WHERE user_id IN (${placeholders})`,ids);
      await pool.query(`DELETE FROM city_memberships WHERE user_id IN (${placeholders})`,ids);
      await pool.query(`DELETE FROM users WHERE id IN (${placeholders})`,ids);
    }

    const hashes=[
      crypto.createHash('sha256').update(deviceA).digest('hex'),
      crypto.createHash('sha256').update(deviceB).digest('hex')
    ];
    await pool.query('DELETE FROM identity_integrity_events WHERE device_hash IN (?,?)',hashes);

    if(seasonId&&cityId&&goalB){
      const [[r]]=await pool.query('SELECT next_goal_number FROM season_cities WHERE season_id=? AND city_id=?',[seasonId,cityId]);
      if(Number(r?.next_goal_number||0)===Number(goalB)+1){
        await pool.query(`
          UPDATE season_cities sc
          SET next_goal_number=(
            SELECT next_value FROM (
              SELECT COALESCE(MAX(cm.goal_number),0)+1 next_value
              FROM city_memberships cm
              WHERE cm.season_id=? AND cm.city_id=?
            ) x
          )
          WHERE sc.season_id=? AND sc.city_id=? AND sc.next_goal_number=?
        `,[seasonId,cityId,seasonId,cityId,Number(goalB)+1]);
      }
    }
    console.log('CLEANUP acceptance records removed');
  }catch(e){
    console.error('CLEANUP FAILED',e.message);
    failures++;
  }
}

try{
  const qualification=await api('/api/qualification');
  const mog=qualification?.standings?.find(c=>c.code==='MOG'&&c.is_open);
  const har=qualification?.standings?.find(c=>c.code==='HAR');
  if(!qualification?.season||!mog||!har)throw new Error('MOG and HAR must exist, with MOG open, for controlled acceptance');
  seasonId=Number(qualification.season.id);
  cityId=Number(mog.id);

  await check('supporter_a_join',async()=>{
    const d=await api('/api/identity/join',{method:'POST',body:{
      displayName:nameA,nickname:'Alpha '+stamp,email:emailA,cityCode:'MOG',
      source:'acceptance',deviceKey:deviceA
    }});
    if(!d?.token||!d?.user?.publicId||!d?.city?.goalNumber)throw new Error('invalid supporter A join response');
    userA={...d.user,token:d.token};
    goalA=Number(d.city.goalNumber);
    return 'Goal #'+goalA;
  });

  await check('supporter_b_referral_join',async()=>{
    const d=await api('/api/identity/join',{method:'POST',body:{
      displayName:nameB,nickname:'Beta '+stamp,email:emailB,cityCode:'MOG',
      source:'acceptance',deviceKey:deviceB,refPublicId:userA.publicId,referredBy:nameA
    }});
    if(!d?.token||!d?.user?.publicId||!d?.city?.goalNumber)throw new Error('invalid supporter B join response');
    userB={...d.user,token:d.token};
    goalB=Number(d.city.goalNumber);
    if(goalB===goalA)throw new Error('Goal numbers are not unique');
    return 'Goal #'+goalB;
  });

  await check('qualification_assist_and_branch',async()=>{
    const me=await api('/api/identity/me',{token:userA.token});
    if(Number(me?.qualificationImpact?.assists||0)<1)throw new Error('supporter A Assist missing');
    if(Number(me?.qualificationImpact?.branch||0)<1)throw new Error('supporter A Branch missing');
    if(me?.qualificationImpact?.latestAssist?.name!=='Beta '+stamp)throw new Error('latest Assist identity mismatch');
    return 'Assist='+me.qualificationImpact.assists+' Branch='+me.qualificationImpact.branch;
  });

  await check('device_recovery',async()=>{
    const recovered=await api('/api/identity/recover-device',{method:'POST',body:{deviceKey:deviceA}});
    if(!recovered?.token||recovered?.city?.code!=='MOG')throw new Error('device recovery failed');
    return 'same city recovered';
  });

  await check('duplicate_device_block',async()=>{
    try{
      await api('/api/identity/join',{method:'POST',body:{
        displayName:'Duplicate '+stamp,cityCode:'HAR',source:'acceptance',deviceKey:deviceA
      }});
      throw new Error('duplicate device was incorrectly accepted');
    }catch(e){
      if(e.body?.error!=='device_already_registered')throw e;
      return 'blocked';
    }
  });

  await check('acceptance_match_created',async()=>{
    const startsAt=new Date(Date.now()+60*60*1000).toISOString();
    const lobbyOpensAt=new Date(Date.now()+30*60*1000).toISOString();
    const d=await api('/api/admin/matches',{method:'POST',admin:true,body:{
      homeCityCode:'MOG',awayCityCode:'HAR',roundCode:'ACCEPTANCE',
      startsAt,lobbyOpensAt,durationMinutes:60
    }});
    if(!d?.publicId)throw new Error('match publicId missing');
    matchPublicId=d.publicId;
    return matchPublicId;
  });

  await check('acceptance_match_lobby',async()=>{
    const d=await api('/api/admin/matches/'+encodeURIComponent(matchPublicId)+'/state',{method:'PATCH',admin:true,body:{status:'LOBBY'}});
    if(d?.to!=='LOBBY')throw new Error('LOBBY transition failed');
    return 'LOBBY';
  });

  await check('supporter_a_reserve',async()=>{
    const d=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/join',{method:'POST',token:userA.token,body:{}});
    if(!d?.participation?.shareToken)throw new Error('A share token missing');
    userA.matchShareToken=d.participation.shareToken;
    return 'reserved';
  });

  await check('supporter_b_reserve_through_a',async()=>{
    const d=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/join',{method:'POST',token:userB.token,body:{inviteToken:userA.matchShareToken}});
    if(!d?.participation?.shareToken)throw new Error('B reservation missing');
    return 'reserved through A';
  });

  await check('acceptance_match_live',async()=>{
    const d=await api('/api/admin/matches/'+encodeURIComponent(matchPublicId)+'/state',{method:'PATCH',admin:true,body:{status:'LIVE'}});
    if(d?.to!=='LIVE')throw new Error('LIVE transition failed');
    return 'LIVE';
  });

  await check('supporter_a_match_goal',async()=>{
    const d=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/activate',{method:'POST',token:userA.token,body:{}});
    if(d?.activated!==true||Number(d?.goalAdded)!==1)throw new Error('A Goal activation failed');
    return 'Goal added';
  });

  await check('match_goal_idempotency',async()=>{
    const d=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/activate',{method:'POST',token:userA.token,body:{}});
    if(d?.alreadyActive!==true||d?.activated!==false)throw new Error('repeat activation was not idempotent');
    const live=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/live');
    if(Number(live?.match?.home?.score)!==1)throw new Error('repeat activation changed score');
    return 'score stayed 1';
  });

  await check('supporter_b_match_goal_and_assist',async()=>{
    const d=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/activate',{method:'POST',token:userB.token,body:{}});
    if(d?.activated!==true)throw new Error('B Goal activation failed');
    const live=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/live');
    if(Number(live?.match?.home?.score)!==2)throw new Error('expected MOG score 2');
    const mine=await api('/api/matches/'+encodeURIComponent(matchPublicId)+'/me',{token:userA.token});
    if(Number(mine?.participation?.assists||0)<1)throw new Error('match Assist missing');
    if(Number(mine?.participation?.downstream_joins||0)<1)throw new Error('match Branch missing');
    if(mine?.participation?.latestAssist?.name!=='Beta '+stamp)throw new Error('match latest Assist mismatch');
    return 'score=2 Assist='+mine.participation.assists+' Branch='+mine.participation.downstream_joins;
  });

  await check('acceptance_match_final',async()=>{
    const d=await api('/api/admin/matches/'+encodeURIComponent(matchPublicId)+'/state',{method:'PATCH',admin:true,body:{status:'FINAL'}});
    if(d?.to!=='FINAL')throw new Error('FINAL transition failed');
    const m=await api('/api/matches/'+encodeURIComponent(matchPublicId));
    if(m?.match?.status!=='FINAL'||m?.match?.winner?.code!=='MOG')throw new Error('final winner mismatch');
    return 'MOG winner confirmed';
  });

  console.log('\nCONTROLLED ACCEPTANCE SUMMARY',JSON.stringify({failures,goalA,goalB,matchPublicId}));
}catch(e){
  if(failures===0)fail('controlled_acceptance',e.message);
}finally{
  await cleanup();
  await pool.end();
}

if(failures>0)process.exit(1);
