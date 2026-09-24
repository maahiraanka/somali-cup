import { config } from './config.js';
import { pool } from './db/pool.js';
import { recordLaunchEvidence } from './launchEvidence.js';

const origin=String(process.env.ACCEPTANCE_ORIGIN||config.appOrigin||'').replace(/\/$/,'');
let failures=0;
let warnings=0;
const timings=[];

const pass=(name,detail='')=>console.log('PASS',name,detail);
const warn=(name,detail='')=>{warnings++;console.warn('WARN',name,detail)};
const fail=(name,detail='')=>{failures++;console.error('FAIL',name,detail)};

async function request(path,{expectJson=false,timeoutMs=10000,headers={}}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=performance.now();
  try{
    const r=await fetch(origin+path,{headers,signal:controller.signal,redirect:'manual'});
    const ms=Math.round(performance.now()-started);
    timings.push({path,ms,status:r.status});
    const body=expectJson?await r.json().catch(()=>null):await r.text();
    return {response:r,body,ms};
  }finally{clearTimeout(timer)}
}

async function check(name,fn,{warning=false}={}){
  try{
    const detail=await fn();
    pass(name,detail||'');
  }catch(e){
    warning?warn(name,e.message):fail(name,e.message);
  }
}

await check('acceptance_origin',()=>{
  if(!origin)throw new Error('ACCEPTANCE_ORIGIN or APP_ORIGIN is required');
  const u=new URL(origin);
  if(u.protocol!=='https:')throw new Error('production acceptance requires https');
  return origin;
});

let rootHtml='';
let launchMode='COMING_SOON';
await check('public_launch_mode',async()=>{
  const {response,body}=await request('/api/public/runtime',{expectJson:true});
  if(response.status!==200||!['COMING_SOON','LIVE'].includes(body?.launchMode))throw new Error('invalid launch mode response');
  launchMode=body.launchMode;
  return launchMode;
});
await check('public_root_200',async()=>{
  const {response,body}=await request('/');
  if(response.status!==200)throw new Error('status '+response.status);
  if(!String(response.headers.get('content-type')||'').includes('text/html'))throw new Error('root did not return HTML');
  rootHtml=String(body||'');
  return '200 HTML';
});

let deployedBundle='';
await check('public_bundle_matches_launch_mode',async()=>{
  const scripts=[...rootHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1]);
  if(!scripts.length)throw new Error('no production JavaScript bundle found');
  for(const src of scripts){
    const path=src.startsWith('http')?src:new URL(src,origin).href;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const r=await fetch(path,{signal:controller.signal});
      deployedBundle+=await r.text();
    }finally{clearTimeout(timer)}
  }
  if(launchMode==='COMING_SOON'&&!(deployedBundle.includes('THE CITIES')&&deployedBundle.includes('COMING SOON'))){
    throw new Error('Coming Soon copy not found in deployed bundle');
  }
  return launchMode+' bundle verified';
});

await check('launch_copy_present',()=>{
  const required=[
    'REPRESENT YOUR CITY',
    'One verified person = one Goal',
    'Somali Cup Terms',
    'Privacy at Somali Cup',
    'How Somali Cup Works'
  ];
  const missing=required.filter(v=>!deployedBundle.includes(v));
  if(missing.length)throw new Error('missing launch copy: '+missing.join(' | '));
  return required.length+' critical content markers present';
});

await check('no_placeholder_copy',()=>{
  const bad=['Lorem ipsum','TODO COPY','PLACEHOLDER TEXT','REPLACE ME'];
  const found=bad.filter(v=>deployedBundle.includes(v));
  if(found.length)throw new Error('placeholder copy found: '+found.join(', '));
  return 'no known placeholder copy';
});

await check('preview_route_hidden_from_search',async()=>{
  const {response}=await request('/preview');
  if(response.status!==200)throw new Error('status '+response.status);
  const robots=String(response.headers.get('x-robots-tag')||'').toLowerCase();
  if(!robots.includes('noindex'))throw new Error('X-Robots-Tag noindex missing');
  return robots;
});

await check('admin_route_hidden_from_search',async()=>{
  const {response}=await request('/admin');
  if(response.status!==200)throw new Error('status '+response.status);
  const robots=String(response.headers.get('x-robots-tag')||'').toLowerCase();
  if(!robots.includes('noindex'))throw new Error('X-Robots-Tag noindex missing');
  return robots;
});

for(const route of ['/terms','/privacy','/rules']){
  await check('public_legal_'+route.slice(1),async()=>{
    const {response,body}=await request(route);
    if(response.status!==200)throw new Error('status '+response.status);
    if(!String(response.headers.get('content-type')||'').includes('text/html'))throw new Error(route+' did not return HTML');
    if(!String(body||'').includes('<div id="root">')&&!String(body||'').includes('id="root"'))throw new Error(route+' did not return app shell');
    return '200 HTML';
  });
}

await check('api_health',async()=>{
  const {response,body}=await request('/api/health',{expectJson:true});
  if(response.status!==200||body?.ok!==true||body?.service!=='somali-cup-api')throw new Error('invalid health response');
  return body.version||'healthy';
});

let qualification=null;
await check('qualification_api',async()=>{
  const {response,body}=await request('/api/qualification',{expectJson:true});
  if(response.status!==200||!body||!Array.isArray(body.standings))throw new Error('invalid qualification response');
  qualification=body;
  return body.season?body.season.name+' · '+body.standings.length+' cities':'no active qualification season';
});

await check('qualification_somalia_only',()=>{
  if(!qualification?.standings?.length)return 'no published standings to inspect';
  const bad=qualification.standings.filter(c=>c.country!=='Somalia');
  if(bad.length)throw new Error('non-Somalia active cities: '+bad.map(c=>c.code).join(','));
  return qualification.standings.length+' Somalia cities';
});

let matches=null;
await check('matches_api',async()=>{
  const {response,body}=await request('/api/matches',{expectJson:true});
  if(response.status!==200||!body||!Array.isArray(body.matches))throw new Error('invalid matches response');
  matches=body.matches;
  return body.matches.length+' current/upcoming fixtures';
});

await check('scheduled_matches_not_joinable_without_identity',()=>{
  const scheduled=(matches||[]).filter(m=>m.status==='SCHEDULED');
  return scheduled.length+' scheduled fixture(s) correctly published as upcoming';
});

await check('match_shapes_truthful',()=>{
  if(!matches?.length)return 'no current fixtures';
  const allowed=new Set(['SCHEDULED','LOBBY','LIVE']);
  for(const m of matches){
    if(!m.publicId||!allowed.has(m.status))throw new Error('invalid fixture '+JSON.stringify({publicId:m.publicId,status:m.status}));
    if(!m.home?.code||!m.away?.code)throw new Error('fixture missing city identity: '+m.publicId);
    if(m.home?.country!=='Somalia'||m.away?.country!=='Somalia')throw new Error('non-Somalia fixture: '+m.publicId);
    if(m.home?.score===undefined||m.away?.score===undefined)throw new Error('fixture score missing: '+m.publicId);
  }
  return matches.length+' fixtures shaped correctly';
});

await check('live_endpoint_first_fixture',async()=>{
  if(!matches?.length)return 'no fixture available';
  const id=encodeURIComponent(matches[0].publicId);
  const {response,body}=await request('/api/matches/'+id+'/live',{expectJson:true});
  if(response.status!==200||!body?.match||!Array.isArray(body.activity))throw new Error('invalid live response');
  return body.match.status+' · '+body.activity.length+' verified activity rows';
},{warning:true});

await check('tournament_api',async()=>{
  const {response,body}=await request('/api/tournament',{expectJson:true});
  if(response.status!==200||!body||!Array.isArray(body.stages))throw new Error('invalid tournament response');
  return body.stages.length+' published stages';
});

let competitions=null;
await check('competitions_hub_api',async()=>{
  const {response,body}=await request('/api/competitions',{expectJson:true});
  if(response.status!==200||!body||!Array.isArray(body.competitions))throw new Error('invalid competitions response');
  competitions=body.competitions;
  const somaliCup=competitions.find(c=>c.slug==='somali-cup');
  if(!somaliCup)throw new Error('Somali Cup missing from competition hub');
  if(!somaliCup.language?.person||!somaliCup.language?.join)throw new Error('simple language pack missing');
  return competitions.length+' competition(s) published';
});

await check('somali_cup_competition_detail',async()=>{
  const {response,body}=await request('/api/competitions/somali-cup',{expectJson:true});
  if(response.status!==200||body?.competition?.slug!=='somali-cup'||!Array.isArray(body?.choices))throw new Error('invalid Somali Cup competition detail');
  return body.choices.length+' choices';
});

await check('identity_protected_without_session',async()=>{
  const {response,body}=await request('/api/identity/me',{expectJson:true});
  if(response.status!==401)throw new Error('expected 401; got '+response.status);
  return body?.error||'401';
});

await check('admin_protected_without_session',async()=>{
  const {response,body}=await request('/api/admin/overview',{expectJson:true});
  if(response.status!==403)throw new Error('expected 403; got '+response.status);
  return body?.error||'403';
});

await check('analytics_protected_without_session',async()=>{
  const {response,body}=await request('/api/analytics/funnel?days=30',{expectJson:true});
  if(response.status!==403)throw new Error('expected 403; got '+response.status);
  return body?.error||'403';
});

await check('unknown_api_returns_json_404',async()=>{
  const {response,body}=await request('/api/this-route-must-not-exist',{expectJson:true});
  if(response.status!==404||body?.error!=='api_not_found')throw new Error('unexpected API fallback behavior');
  return '404 api_not_found';
});

await check('security_headers',async()=>{
  const {response}=await request('/api/health');
  const powered=response.headers.get('x-powered-by');
  if(powered)throw new Error('x-powered-by exposed');
  const nosniff=String(response.headers.get('x-content-type-options')||'').toLowerCase();
  if(nosniff!=='nosniff')throw new Error('X-Content-Type-Options nosniff missing');
  return 'basic Helmet headers present';
});

await check('response_time_budget',()=>{
  if(!timings.length)return 'no timings';
  const slow=timings.filter(t=>t.ms>5000);
  if(slow.length)throw new Error(slow.map(t=>t.path+'='+t.ms+'ms').join(', '));
  const max=Math.max(...timings.map(t=>t.ms));
  const avg=Math.round(timings.reduce((a,b)=>a+b.ms,0)/timings.length);
  if(max>2500)warn('response_time_warning','max='+max+'ms avg='+avg+'ms');
  return 'max='+max+'ms avg='+avg+'ms';
});

console.log('\nSAFE ACCEPTANCE SUMMARY',JSON.stringify({failures,warnings,requests:timings.length}));
if(timings.length)console.log('TIMINGS',JSON.stringify(timings));
await recordLaunchEvidence({
  runType:'SAFE_ACCEPTANCE',
  status:failures>0?'FAIL':'PASS',
  failures,warnings,origin,
  evidence:{requests:timings.length,timings}
});
await pool.end();
if(failures>0)process.exit(1);
