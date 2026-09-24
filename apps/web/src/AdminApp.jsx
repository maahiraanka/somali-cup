import React,{useEffect,useMemo,useState} from 'react';
import {
  Activity,AlertTriangle,BarChart3,ChevronRight,ClipboardList,DoorOpen,
  Flag,KeyRound,LayoutDashboard,LockKeyhole,Medal,Menu,Radio,RefreshCw,
  Search,ShieldCheck,Trophy,UserPlus,Users,X
} from 'lucide-react';

const fmt=n=>Number(n||0).toLocaleString();
const nice=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const adminToken=()=>localStorage.getItem('somalicup_admin_session')||'';

async function adminApi(path,opts={}){
  const token=adminToken();
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetch(path,{...opts,headers});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(body.error||'request_failed'),{status:r.status,body});
  return body;
}

function AdminLogo(){
  return <div className="adminLogo"><div>🏆</div><span><b>SOMALI CUP</b><small>Competition Control Centre</small></span></div>
}

function AdminAuth({onReady}){
  const [mode,setMode]=useState('login');
  const [form,setForm]=useState({displayName:'',email:'',password:'',bootstrapKey:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const submit=async e=>{
    e.preventDefault();
    setBusy(true);setError('');
    try{
      const path=mode==='bootstrap'?'/api/admin/auth/bootstrap':'/api/admin/auth/login';
      const headers=mode==='bootstrap'?{'x-admin-key':form.bootstrapKey}:{};
      const payload=mode==='bootstrap'
        ?{displayName:form.displayName,email:form.email,password:form.password}
        :{email:form.email,password:form.password};
      const d=await adminApi(path,{method:'POST',headers,body:JSON.stringify(payload)});
      localStorage.setItem('somalicup_admin_session',d.token);
      onReady(d.user);
    }catch(e){setError(nice(e.body?.error||e.message))}
    finally{setBusy(false)}
  };
  return <div className="adminAuthPage">
    <div className="adminAuthGlow"/>
    <form className="adminAuthCard" onSubmit={submit}>
      <AdminLogo/>
      <div className="adminAuthIntro">
        <small>{mode==='bootstrap'?'FIRST-TIME SETUP':'SECURE ADMIN ACCESS'}</small>
        <h1>{mode==='bootstrap'?'Create the first administrator':'Run Somali Cup'}</h1>
        <p>{mode==='bootstrap'?'Use your Hostinger ADMIN_BOOTSTRAP_KEY once. After setup, use normal admin login.':'Competition operations, integrity, analytics and awards in one place.'}</p>
      </div>
      {mode==='bootstrap'&&<label><span>Your name</span><input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Administrator name" autoComplete="name"/></label>}
      <label><span>Email</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="admin@somalicup.com" autoComplete="username"/></label>
      <label><span>Password</span><input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder={mode==='bootstrap'?'Minimum 10 characters':'Your password'} autoComplete={mode==='bootstrap'?'new-password':'current-password'}/></label>
      {mode==='bootstrap'&&<label><span>Bootstrap key</span><input type="password" value={form.bootstrapKey} onChange={e=>setForm({...form,bootstrapKey:e.target.value})} placeholder="ADMIN_BOOTSTRAP_KEY"/></label>}
      {error&&<div className="adminFormError"><AlertTriangle size={15}/>{error}</div>}
      <button className="adminPrimary" disabled={busy}>{busy?'Please wait…':mode==='bootstrap'?'CREATE ADMIN':'SIGN IN'} <ChevronRight size={16}/></button>
      <button type="button" className="adminTextButton" onClick={()=>{setMode(mode==='login'?'bootstrap':'login');setError('')}}>
        {mode==='login'?'First-time setup':'Back to admin login'}
      </button>
    </form>
  </div>
}

const nav=[
  ['overview','Overview',LayoutDashboard],
  ['cities','Cities & Qualification',Flag],
  ['matches','Matches',Radio],
  ['tournament','Tournament',Trophy],
  ['supporters','Supporters',Users],
  ['integrity','Integrity',ShieldCheck],
  ['analytics','Viral Analytics',BarChart3],
  ['awards','Awards',Medal],
  ['audit','Audit History',ClipboardList]
];

function Stat({label,value,detail,tone=''}){return <div className={'adminStat '+tone}><span>{label}</span><strong>{fmt(value)}</strong><small>{detail}</small></div>}

export default function AdminApp(){
  const [admin,setAdmin]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);
  const [view,setView]=useState('overview');
  const [mobileNav,setMobileNav]=useState(false);
  const [data,setData]=useState({});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');

  const loadAuth=async()=>{
    try{const d=await adminApi('/api/admin/auth/me');setAdmin(d.user||null)}
    catch{localStorage.removeItem('somalicup_admin_session');setAdmin(null)}
    finally{setAuthChecked(true)}
  };
  useEffect(()=>{loadAuth()},[]);

  const endpoint=useMemo(()=>({
    overview:'/api/admin/overview',
    cities:'/api/admin/qualification',
    matches:'/api/admin/matches',
    tournament:'/api/tournament',
    supporters:'/api/admin/supporters'+(query?'?q='+encodeURIComponent(query):''),
    integrity:'/api/admin/integrity?days=7',
    analytics:'/api/analytics/funnel?days=30',
    awards:'/api/admin/awards/candidates',
    audit:'/api/admin/audit?limit=100'
  })[view],[view,query]);

  const refresh=async()=>{
    if(!admin||!endpoint)return;
    setLoading(true);setError('');
    try{
      const d=await adminApi(endpoint);
      let extra=null;
      if(view==='awards')extra=await adminApi('/api/admin/awards');
      setData(prev=>({...prev,[view]:d,...(extra?{confirmedAwards:extra}: {})}));
    }catch(e){
      if(e.status===403){localStorage.removeItem('somalicup_admin_session');setAdmin(null)}
      else setError(nice(e.body?.error||e.message));
    }finally{setLoading(false)}
  };
  useEffect(()=>{if(admin)refresh()},[view,admin,endpoint]);

  const act=async(fn,success)=>{
    setError('');
    try{await fn();setNotice(success);setTimeout(()=>setNotice(''),2200);await refresh()}
    catch(e){setError(nice(e.body?.error||e.message))}
  };
  const logout=async()=>{
    try{await adminApi('/api/admin/auth/logout',{method:'POST'})}catch{}
    localStorage.removeItem('somalicup_admin_session');setAdmin(null);
  };

  if(!authChecked)return <div className="adminBoot"><RefreshCw className="spin" size={24}/><span>Opening Control Centre…</span></div>;
  if(!admin)return <AdminAuth onReady={setAdmin}/>;

  const current=nav.find(n=>n[0]===view);
  return <div className="adminShell">
    <aside className={mobileNav?'adminSidebar open':'adminSidebar'}>
      <div className="adminSideHead"><AdminLogo/><button onClick={()=>setMobileNav(false)}><X/></button></div>
      <nav>{nav.map(([id,label,Icon])=><button key={id} className={view===id?'active':''} onClick={()=>{setView(id);setMobileNav(false)}}><Icon size={17}/><span>{label}</span></button>)}</nav>
      <div className="adminSideBottom">
        <div className="adminIdentity"><span>{(admin.displayName||'A')[0]}</span><div><b>{admin.displayName}</b><small>{admin.email}</small></div></div>
        <button className="adminLogout" onClick={logout}><DoorOpen size={16}/> Sign out</button>
      </div>
    </aside>

    <section className="adminMain">
      <header className="adminTopbar">
        <button className="adminMobileMenu" onClick={()=>setMobileNav(true)}><Menu/></button>
        <div><small>COMPETITION CONTROL CENTRE</small><h1>{current?.[1]||'Overview'}</h1></div>
        <button className="adminRefresh" onClick={refresh} disabled={loading}><RefreshCw className={loading?'spin':''} size={16}/> Refresh</button>
      </header>

      {notice&&<div className="adminNotice"><ShieldCheck size={15}/>{notice}</div>}
      {error&&<div className="adminError"><AlertTriangle size={16}/>{error}</div>}

      <main className="adminContent">
        {loading&&!data[view]?<div className="adminLoading"><RefreshCw className="spin"/><span>Loading verified competition data…</span></div>:
          view==='overview'?<Overview d={data.overview}/>:
          view==='cities'?<CitiesAdmin d={data.cities} act={act}/>:
          view==='matches'?<MatchesAdmin d={data.matches} act={act}/>:
          view==='tournament'?<TournamentAdmin d={data.tournament} act={act}/>:
          view==='supporters'?<SupportersAdmin d={data.supporters} query={query} setQuery={setQuery} refresh={refresh}/>:
          view==='integrity'?<IntegrityAdmin d={data.integrity}/>:
          view==='analytics'?<AnalyticsAdmin d={data.analytics}/>:
          view==='awards'?<AwardsAdmin d={data.awards} confirmed={data.confirmedAwards} act={act}/>:
          <AuditAdmin d={data.audit}/>
        }
      </main>
    </section>
  </div>
}

function Overview({d}){
  if(!d?.season)return <Empty title="No active season" body="Create or activate a Somali Cup season before competition operations begin."/>;
  const s=d.summary||{};
  return <>
    <section className="adminSeasonBanner"><div><small>ACTIVE COMPETITION</small><h2>{d.season.name}</h2><span>{d.season.status}</span></div><div className="adminLiveDot"><i/>{s.liveMatches?fmt(s.liveMatches)+' LIVE NOW':'NO LIVE MATCHES'}</div></section>
    <div className="adminStats">
      <Stat label="Verified supporters" value={s.verifiedSupporters} detail="Real city Goals"/>
      <Stat label="Qualification Assists" value={s.qualificationAssists} detail="Verified referrals"/>
      <Stat label="Match Assists" value={s.matchAssists} detail="Verified match call-ups"/>
      <Stat label="Live matches" value={s.liveMatches} detail={fmt(s.lobbyMatches)+' lobbies open'} tone={s.liveMatches?'live':''}/>
      <Stat label="Integrity signals" value={(d.integrity?.duplicateBlocks||0)+(d.integrity?.burstSignals||0)} detail="Last 7 days" tone={(d.integrity?.burstSignals||0)?'warn':''}/>
      <Stat label="Confirmed awards" value={s.confirmedAwards} detail="Evidence-backed"/>
    </div>
    <div className="adminTwoCol">
      <section className="adminPanel"><PanelHead eyebrow="CITY RACE" title="Qualification leaders"/>{(d.leaders||[]).map((c,i)=><div className="adminLeader" key={c.code}><b>#{i+1}</b><div><strong>{c.name}</strong><small>{c.code} · {c.status}</small></div><span>{fmt(c.verified_supporters)} / {fmt(c.qualification_target)}</span></div>)}</section>
      <section className="adminPanel"><PanelHead eyebrow="COMPETITION" title="Tournament stages"/>{(d.stages||[]).length?(d.stages||[]).map(s=><div className="adminStage" key={s.code}><div><b>{s.name}</b><small>{s.stage_type}</small></div><span className={'status '+String(s.status).toLowerCase()}>{s.status}</span></div>):<Empty compact title="Tournament not configured" body="Qualification can continue until the Cup structure is ready."/>}</section>
    </div>
    <section className="adminPanel"><PanelHead eyebrow="AUDIT" title="Recent control activity"/><AuditRows rows={d.recentAudit||[]}/></section>
  </>
}

function CitiesAdmin({d,act}){
  if(!d?.season)return <Empty title="Qualification is not open" body="No qualification season is available."/>;
  return <section className="adminPanel"><PanelHead eyebrow={d.season.status} title={d.season.name+' cities'}/>
    <div className="adminTable adminCitiesTable"><div className="adminTR head"><span>City</span><span>Verified</span><span>Target</span><span>Status</span><span>Open</span><span>Action</span></div>
      {(d.cities||[]).map(c=><div className="adminTR" key={c.id}>
        <div><b>{c.name}</b><small>{c.code} · {c.tier}</small></div>
        <strong>{fmt(c.verified_supporters)}</strong><span>{fmt(c.qualification_target)}</span><span>{c.status}</span>
        <span className={c.is_open?'adminYes':'adminNo'}>{c.is_open?'OPEN':'CLOSED'}</span>
        <button className="adminSmallBtn" onClick={()=>act(()=>adminApi('/api/admin/qualification/cities/'+c.id,{method:'PATCH',body:JSON.stringify({isOpen:!c.is_open})}),c.name+(c.is_open?' closed':' opened'))}>{c.is_open?'Close':'Open'}</button>
      </div>)}
    </div>
  </section>
}

function MatchesAdmin({d,act}){
  const next={SCHEDULED:'LOBBY',LOBBY:'LIVE',LIVE:'FINAL'};
  return <section className="adminPanel"><PanelHead eyebrow="MATCH CONTROL" title="Fixtures & lifecycle"/>
    <div className="adminMatchList">{(d?.matches||[]).map(m=><article key={m.public_id} className="adminMatchCard">
      <div className="adminMatchTop"><span className={'status '+String(m.status).toLowerCase()}>{m.status}</span><small>{m.round_code}</small></div>
      <div className="adminMatchScore"><div><b>{m.home_code}</b><span>{m.home_name}</span></div><strong>{m.home_score} — {m.away_score}</strong><div><b>{m.away_code}</b><span>{m.away_name}</span></div></div>
      <div className="adminMatchFoot"><span>{m.starts_at?new Date(m.starts_at).toLocaleString():'No kickoff'}</span>{next[m.status]&&<button className="adminSmallBtn" onClick={()=>act(()=>adminApi('/api/admin/matches/'+m.public_id+'/state',{method:'PATCH',body:JSON.stringify({status:next[m.status]})}),'Match moved to '+next[m.status])}>{next[m.status]==='FINAL'?'Full Time':'Move to '+nice(next[m.status])}</button>}</div>
    </article>)}</div>
  </section>
}

function TournamentAdmin({d,act}){
  return <>
    <section className="adminPanel"><div className="adminPanelAction"><PanelHead eyebrow="ROAD TO THE CUP" title={d?.season?.name||'Tournament'}/><button className="adminPrimary compact" onClick={()=>act(()=>adminApi('/api/admin/tournament/progress',{method:'POST'}),'Tournament progression checked')}>RUN PROGRESSION <ChevronRight size={14}/></button></div>
      {(d?.stages||[]).length?<div className="adminStageGrid">{d.stages.map(s=><article key={s.code}><div><small>{s.type}</small><h3>{s.name}</h3></div><span className={'status '+String(s.status).toLowerCase()}>{s.status}</span><p>{s.type==='GROUP'?fmt(s.groups?.length)+' groups':fmt(s.matches?.length)+' fixtures'}</p></article>)}</div>:<Empty title="Tournament structure not published" body="The engine is ready. Configure stages after qualification decides the field."/ >}
    </section>
  </>
}

function SupportersAdmin({d,query,setQuery,refresh}){
  return <section className="adminPanel"><div className="adminPanelAction"><PanelHead eyebrow="SUPPORTERS" title="Verified identities"/><div className="adminSearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&refresh()} placeholder="Search name, email or supporter ID"/></div></div>
    <div className="adminTable supporters"><div className="adminTR head"><span>Supporter</span><span>City</span><span>Goal</span><span>Assists</span><span>Verification</span></div>{(d?.supporters||[]).map(u=><div className="adminTR" key={u.public_id}><div><b>{u.nickname||u.display_name}</b><small>{u.email||u.public_id}</small></div><span>{u.city_name}</span><strong>#{u.goal_number}</strong><span>{u.assists}</span><span>{u.verification_status}</span></div>)}</div>
  </section>
}

function IntegrityAdmin({d}){
  const s=d?.summary||{};
  return <>
    <div className="adminStats integrity"><Stat label="Device claims" value={s.deviceClaims} detail="Bound supporter identities"/><Stat label="Recoveries" value={s.deviceRecoveries} detail="Sessions restored"/><Stat label="Duplicate blocks" value={s.duplicateDeviceBlocks} detail="Same-device repeat attempts"/><Stat label="Network bursts" value={s.networkBurstSignals} detail="Review only" tone={s.networkBurstSignals?'warn':''}/></div>
    <section className="adminPanel"><PanelHead eyebrow="REVIEW EVIDENCE" title="Recent integrity signals"/><div className="adminSignalList">{(d?.recent||[]).length?(d.recent||[]).map(r=><div key={r.id}><ShieldCheck size={16}/><div><b>{nice(r.event_type)}</b><small>{r.display_name||'Anonymous attempt'} · {new Date(r.created_at).toLocaleString()}</small></div><span>{r.device_hint||r.network_hint||'—'}</span></div>):<Empty compact title="No review signals" body="No recent duplicate-device or burst events."/ >}</div></section>
  </>
}

function AnalyticsAdmin({d}){
  const v=d?.verified||{};
  const events=Object.fromEntries((d?.events||[]).map(e=>[e.eventName,e]));
  return <>
    <div className="adminStats"><Stat label="Landing people" value={events.LANDING_VIEW?.people||0} detail="30-day unique arrivals"/><Stat label="Join opens" value={events.JOIN_OPENED?.people||0} detail="Started participation"/><Stat label="Verified Goals" value={v.verifiedGoals} detail="Canonical database result"/><Stat label="Successful shares" value={events.SHARE_COMPLETED?.total||0} detail="Share completed"/><Stat label="Verified Assists" value={v.verifiedAssists} detail="Qualification referrals"/><Stat label="Match Goals" value={v.matchGoals} detail="Verified scoring events"/></div>
    <section className="adminPanel"><PanelHead eyebrow="VIRAL FUNNEL" title="What happens after people arrive?"/><div className="funnelRows">{['LANDING_VIEW','JOIN_OPENED','REFERRAL_LANDING','SHARE_COMPLETED','MATCH_INVITE_LANDING'].map(k=><div key={k}><b>{nice(k)}</b><span>{fmt(events[k]?.people||events[k]?.total||0)}</span></div>)}</div></section>
  </>
}

function AwardsAdmin({d,confirmed,act}){
  const already=new Set((confirmed?.awards||[]).filter(a=>a.status==='CONFIRMED').map(a=>a.type));
  const order=['TOP_PLAYMAKER','GLOBAL_CONNECTOR','FINAL_ASSIST','PLAYER_OF_TOURNAMENT'];
  return <>
    <section className="awardsIntro"><div><small>VERIFIED RECOGNITION</small><h2>Awards must be earned by evidence.</h2><p>Candidates are calculated from verified Goals, Assists and Branch impact. Confirm only after reviewing the evidence shown.</p></div><Medal size={44}/></section>
    <div className="awardGrid">{order.map(type=>{
      const pack=d?.awards?.[type]||{};
      const c=pack.candidates?.[0];
      return <article className="awardCard" key={type}>
        <div className="awardHead"><Medal size={20}/><span>{nice(type)}</span>{already.has(type)&&<b>CONFIRMED</b>}</div>
        {c?<><h3>{c.name}</h3><p>{c.city?.name} · {pack.metricName}</p><strong>{fmt(c.metricValue)}</strong><div className="awardEvidence">{Object.entries(c.evidence||{}).filter(([,v])=>typeof v!=='object').slice(0,5).map(([k,v])=><span key={k}><b>{nice(k)}</b>{String(v)}</span>)}</div>
          <button className="adminPrimary" disabled={already.has(type)} onClick={()=>act(()=>adminApi('/api/admin/awards/confirm',{method:'POST',body:JSON.stringify({awardType:type,userId:c.userId,matchId:type==='FINAL_ASSIST'?pack.match?.id:null,metricName:pack.metricName,metricValue:c.metricValue,evidence:c.evidence})}),nice(type)+' confirmed')}>{already.has(type)?'CONFIRMED':'CONFIRM AWARD'} <ChevronRight size={14}/></button></>:<Empty compact title="No eligible candidate yet" body="Verified competition evidence has not produced a candidate."/>}
      </article>
    })}</div>
    {(confirmed?.awards||[]).length>0&&<section className="adminPanel"><PanelHead eyebrow="AWARD HISTORY" title="Confirmed recognition"/>{confirmed.awards.map(a=><div className="confirmedAward" key={a.id}><Medal size={17}/><div><b>{nice(a.type)} · {a.user.name}</b><small>{a.metricName}: {fmt(a.metricValue)} · {new Date(a.confirmedAt).toLocaleString()}</small></div><span className={'status '+a.status.toLowerCase()}>{a.status}</span></div>)}</section>}
  </>
}

function AuditAdmin({d}){return <section className="adminPanel"><PanelHead eyebrow="IMMUTABLE HISTORY" title="Control actions"/><AuditRows rows={d?.audit||[]}/></section>}
function AuditRows({rows}){return <div className="adminAuditRows">{rows.length?rows.map(r=><div key={r.id}><Activity size={15}/><div><b>{nice(r.action)}</b><small>{r.entity_type} · {r.entity_id} · {r.actor_name||'System'}</small></div><span>{new Date(r.created_at).toLocaleString()}</span></div>):<Empty compact title="No audit events yet" body="Operational changes will appear here."/ >}</div>}
function PanelHead({eyebrow,title}){return <div className="adminPanelHead"><small>{eyebrow}</small><h2>{title}</h2></div>}
function Empty({title,body,compact=false}){return <div className={'adminEmpty '+(compact?'compact':'')}><LockKeyhole size={compact?17:25}/><div><b>{title}</b><p>{body}</p></div></div>}
