import React,{useEffect,useMemo,useState} from 'react';
import {
  Activity,AlertTriangle,BarChart3,CheckCircle2,ChevronRight,ClipboardList,DoorOpen,
  Ban,CalendarClock,Flag,KeyRound,LayoutDashboard,LockKeyhole,Medal,Menu,Pencil,Plus,Power,Radio,RefreshCw,Rocket,Save,
  Search,ShieldCheck,Trophy,UserPlus,Users,X
} from 'lucide-react';

const fmt=n=>Number(n||0).toLocaleString();
const nice=v=>String(v||'').replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
const humanErrorAdmin=e=>nice(e?.body?.error||e?.message||'request_failed');
const launchFailureText=e=>{
  const b=e?.body||{};
  const parts=[];
  if(b.message)parts.push('MESSAGE: '+b.message);
  if(b.exitCode!==undefined&&b.exitCode!==null)parts.push('EXIT CODE: '+b.exitCode);
  if(b.signal)parts.push('SIGNAL: '+b.signal);
  if(b.stdout)parts.push('STDOUT:\n'+b.stdout);
  if(b.stderr)parts.push('STDERR:\n'+b.stderr);
  if(b.structuredEvidence?.evidence){
    const ev=typeof b.structuredEvidence.evidence==='string'
      ?(()=>{try{return JSON.parse(b.structuredEvidence.evidence)}catch{return {raw:b.structuredEvidence.evidence}}})()
      :b.structuredEvidence.evidence;
    if(ev?.currentStep)parts.push('FAILED STEP: '+ev.currentStep);
    if(ev?.failureMessage)parts.push('FAILURE: '+ev.failureMessage);
    if(Array.isArray(ev?.completedSteps)&&ev.completedSteps.length){
      parts.push('STEPS:\n'+ev.completedSteps.map(x=>(x.status==='PASS'?'PASS ':'FAIL ')+x.name+(x.detail?' — '+x.detail:'')).join('\n'));
    }
  }
  if(b.command)parts.push('COMMAND:\n'+b.command);
  return parts.join('\n\n')||humanErrorAdmin(e);
};
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
  ['launch','Launch Readiness',Rocket],
  ['operations','Operations',Power],
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
    launch:'/api/admin/launch-readiness',
    operations:'/api/admin/operations',
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
          view==='launch'?<LaunchReadiness d={data.launch} act={act}/>:
          view==='operations'?<OperationsAdmin d={data.operations} act={act}/>:
          view==='cities'?<CitiesAdmin d={data.cities} act={act}/>:
          view==='matches'?<MatchesAdmin d={data.matches} act={act}/>:
          view==='tournament'?<TournamentAdmin d={data.tournament} act={act}/>:
          view==='supporters'?<SupportersAdmin d={data.supporters} query={query} setQuery={setQuery} refresh={refresh} act={act}/>:
          view==='integrity'?<IntegrityAdmin d={data.integrity} act={act}/>:
          view==='analytics'?<AnalyticsAdmin d={data.analytics}/>:
          view==='awards'?<AwardsAdmin d={data.awards} confirmed={data.confirmedAwards} act={act}/>:
          <AuditAdmin d={data.audit}/>
        }
      </main>
    </section>
  </div>
}

function LaunchReadiness({d,act}){
  const status=d?.overall||'BLOCKED';
  const [runningCheck,setRunningCheck]=useState('');
  const [checkOutput,setCheckOutput]=useState('');
  const fixtureBlocker=(d?.checks||[]).find(c=>c.id==='fixture_health'&&c.status==='BLOCKER');
  const grouped=(d?.checks||[]).reduce((acc,c)=>{(acc[c.category]||=[]).push(c);return acc},{});
  const order=['ENVIRONMENT','SECURITY','DATABASE','COMPETITION','INTEGRITY','MATCHES','OPERATIONS','PROOF'];
  return <>
    <section className={'launchReadinessHero '+status.toLowerCase()}>
      <div className="launchReadinessIcon">{status==='READY'?<CheckCircle2 size={34}/>:status==='REVIEW'?<AlertTriangle size={34}/>:<LockKeyhole size={34}/>}</div>
      <div>
        <small>LAUNCH GATE</small>
        <h2>{status==='READY'?'Somali Cup is ready for launch.':status==='REVIEW'?'Almost ready. Review the warnings.':'Launch is still blocked.'}</h2>
        <p>{status==='READY'?'Every required production check and acceptance proof is green.':status==='REVIEW'?'There are no hard blockers, but one or more warnings still deserve review.':`${fmt(d?.blockers)} blocker(s) must be cleared before the public launch switch.`}</p>
      </div>
      <div className="launchReadinessCount">
        <strong>{fmt((d?.checks||[]).filter(c=>c.status==='PASS').length)}</strong>
        <span>PASS</span>
      </div>
    </section>

    <section className="launchModePanel">
      <div>
        <small>PUBLIC SITE</small>
        <h3>{d?.launchMode==='LIVE'?'Somali Cup is LIVE':'Coming Soon shield is active'}</h3>
        <p>{d?.launchMode==='LIVE'?'Visitors to somalicup.com are seeing the real competition app.':'Visitors to somalicup.com only see the Coming Soon page. /preview remains available for testing.'}</p>
      </div>
      {d?.launchMode==='LIVE'
        ?<button className="launchRollback" onClick={()=>{
          if(window.confirm('Return somalicup.com to the Coming Soon page? The admin and preview paths will remain available.')){
            act(()=>adminApi('/api/admin/launch-mode',{method:'POST',body:JSON.stringify({mode:'COMING_SOON'})}),'Public site returned to Coming Soon');
          }
        }}><LockKeyhole size={15}/> RETURN TO COMING SOON</button>
        :<button className="adminPrimary launchGoLive" disabled={Number(d?.blockers||0)>0} onClick={()=>{
          if(window.confirm('GO LIVE with Somali Cup now? Public visitors will immediately see the real competition app.')){
            act(()=>adminApi('/api/admin/launch-mode',{method:'POST',body:JSON.stringify({mode:'LIVE'})}),'Somali Cup is now LIVE');
          }
        }}><Rocket size={15}/> {Number(d?.blockers||0)>0?'CLEAR BLOCKERS FIRST':'GO LIVE'}</button>}
    </section>

    <div className="launchProofSummary">
      <div><span>Blockers</span><strong>{fmt(d?.blockers)}</strong></div>
      <div><span>Warnings</span><strong>{fmt(d?.warnings)}</strong></div>
      <div><span>Checks</span><strong>{fmt(d?.checks?.length||0)}</strong></div>
      <div><span>Evidence runs</span><strong>{fmt(d?.evidence?.length||0)}</strong></div>
    </div>

    {fixtureBlocker&&<section className="launchRepairCard">
      <div><small>SAFE REPAIR AVAILABLE</small><h3>4 fixtures are in an impossible future LIVE state.</h3><p>This repair only moves future Lobby/Live fixtures back to the correct state based on their configured times. It does not change scores or completed matches.</p></div>
      <button className="adminPrimary" onClick={()=>act(()=>adminApi('/api/admin/repair-fixture-lifecycle',{method:'POST'}),'Fixture lifecycle repaired')}><RefreshCw size={15}/> REPAIR FIXTURE LIFECYCLE</button>
    </section>}

    {order.filter(k=>grouped[k]?.length).map(category=><section className="adminPanel launchCategory" key={category}>
      <PanelHead eyebrow={category} title={nice(category.toLowerCase())}/>
      <div className="launchCheckList">
        {grouped[category].map(c=><div className={'launchCheck '+c.status.toLowerCase()} key={c.id}>
          <div className="launchCheckIcon">{c.status==='PASS'?<CheckCircle2 size={17}/>:c.status==='WARNING'?<AlertTriangle size={17}/>:<LockKeyhole size={17}/>}</div>
          <div><b>{c.label}</b><small>{c.detail}</small></div>
          <span>{c.status}</span>
        </div>)}
      </div>
    </section>)}

    <section className="adminPanel launchRunner">
      <div className="adminPanelAction">
        <PanelHead eyebrow="RUN FROM CONTROL CENTRE" title="Production proof"/>
        <span className="launchRunnerHint">No Hostinger terminal required</span>
      </div>
      <div className="launchRunnerGrid">
        <button disabled={Boolean(runningCheck)} onClick={async()=>{
          setRunningCheck('preflight');setCheckOutput('');
          try{
            const d=await adminApi('/api/admin/launch-checks/preflight',{method:'POST'});
            setCheckOutput(d.stdout||'Preflight passed.');
            await act(async()=>d,'Production preflight passed');
          }catch(e){setCheckOutput(launchFailureText(e));}finally{setRunningCheck('')}
        }}><ShieldCheck size={17}/><div><b>{runningCheck==='preflight'?'RUNNING…':'RUN PREFLIGHT'}</b><small>Environment, DB, migrations, Goal integrity</small></div></button>
        <button disabled={Boolean(runningCheck)} onClick={async()=>{
          setRunningCheck('safe');setCheckOutput('');
          try{
            const d=await adminApi('/api/admin/launch-checks/safe',{method:'POST'});
            setCheckOutput(d.stdout||'Safe acceptance passed.');
            await act(async()=>d,'Safe acceptance passed');
          }catch(e){setCheckOutput(launchFailureText(e));}finally{setRunningCheck('')}
        }}><BarChart3 size={17}/><div><b>{runningCheck==='safe'?'RUNNING…':'RUN SAFE ACCEPTANCE'}</b><small>Public routes, security, APIs, response health</small></div></button>
        <button disabled={Boolean(runningCheck)} onClick={async()=>{
          if(!window.confirm('Run the controlled acceptance test now? It creates temporary tagged supporter and match records, proves the viral loop, then removes them.'))return;
          setRunningCheck('controlled');setCheckOutput('');
          try{
            const d=await adminApi('/api/admin/launch-checks/controlled',{method:'POST',body:JSON.stringify({confirmation:'RUN CONTROLLED ACCEPTANCE'})});
            setCheckOutput(d.stdout||'Controlled acceptance passed.');
            await act(async()=>d,'Controlled acceptance passed');
          }catch(e){setCheckOutput(launchFailureText(e));}finally{setRunningCheck('')}
        }}><Activity size={17}/><div><b>{runningCheck==='controlled'?'RUNNING…':'RUN CONTROLLED ACCEPTANCE'}</b><small>Goal → Assist → Branch → Match → cleanup</small></div></button>
      </div>
      {checkOutput&&<pre className="launchCheckOutput">{checkOutput}</pre>}
    </section>

    <section className="adminPanel">
      <PanelHead eyebrow="PRODUCTION EVIDENCE" title="Latest acceptance runs"/>
      {(d?.evidence||[]).length?<div className="launchEvidenceList">{d.evidence.map(e=><div key={e.id}>
        <div><b>{nice(e.type)}</b><small>{e.origin||'No origin'} · {e.createdAt?new Date(e.createdAt).toLocaleString():'Unknown time'}</small></div>
        <span className={'status '+String(e.status).toLowerCase()}>{e.status}</span>
      </div>)}</div>:<Empty compact title="No production acceptance evidence yet" body="Run preflight, safe acceptance and controlled acceptance on Hostinger."/>}
    </section>
  </>
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

function OperationsAdmin({d,act}){
  const [reason,setReason]=useState('');
  const change=(area,mode,label)=>{
    if(reason.trim().length<5)return;
    const action=mode==='FROZEN'?'freeze':'reopen';
    if(!window.confirm(action.charAt(0).toUpperCase()+action.slice(1)+' '+label+'? The reason will be written to the audit trail.'))return;
    act(()=>adminApi('/api/admin/operations',{method:'PATCH',body:JSON.stringify({
      area,mode,reason,confirmation:'CONFIRM OPERATIONS CHANGE'
    })}),label+' '+(mode==='FROZEN'?'frozen':'reopened'));
  };
  return <>
    <section className="opsCommandHero">
      <div><small>COMPETITION COMMAND</small><h2>Emergency operations</h2><p>Stop risky actions without taking verified standings or public competition history offline.</p></div>
      <Power size={34}/>
    </section>
    <section className="adminPanel">
      <PanelHead eyebrow="REQUIRED FOR CHANGES" title="Operational reason"/>
      <label className="opsReason"><span>Why are you changing competition availability?</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Example: investigating duplicate participation spike"/></label>
    </section>
    <div className="opsSwitchGrid">
      <section className={'opsSwitchCard '+String(d?.joins||'OPEN').toLowerCase()}>
        <div className="opsSwitchTop"><div><small>SUPPORTER INTAKE</small><h3>New supporter joins</h3></div><span className={'status '+String(d?.joins||'OPEN').toLowerCase()}>{d?.joins||'OPEN'}</span></div>
        <p>{d?.joins==='FROZEN'?'New city joins are blocked. Existing verified supporters and public standings remain available.':'People can currently choose a city and score their qualification Goal.'}</p>
        {d?.joins==='FROZEN'
          ?<button className="adminPrimary" disabled={reason.trim().length<5} onClick={()=>change('JOINS','OPEN','supporter joins')}><ShieldCheck size={14}/> REOPEN JOINS</button>
          :<button className="opsDanger" disabled={reason.trim().length<5} onClick={()=>change('JOINS','FROZEN','supporter joins')}><Ban size={14}/> FREEZE JOINS</button>}
      </section>
      <section className={'opsSwitchCard '+String(d?.matches||'OPEN').toLowerCase()}>
        <div className="opsSwitchTop"><div><small>MATCH PARTICIPATION</small><h3>Reservations & scoring</h3></div><span className={'status '+String(d?.matches||'OPEN').toLowerCase()}>{d?.matches||'OPEN'}</span></div>
        <p>{d?.matches==='FROZEN'?'Supporters cannot reserve or activate match Goals. Match pages and verified scores remain visible.':'Match reservations and verified Goal activation are operating normally.'}</p>
        {d?.matches==='FROZEN'
          ?<button className="adminPrimary" disabled={reason.trim().length<5} onClick={()=>change('MATCHES','OPEN','match participation')}><ShieldCheck size={14}/> REOPEN MATCHES</button>
          :<button className="opsDanger" disabled={reason.trim().length<5} onClick={()=>change('MATCHES','FROZEN','match participation')}><Ban size={14}/> FREEZE MATCHES</button>}
      </section>
    </div>
    <section className="opsSafetyNote"><LockKeyhole size={16}/><div><b>These controls do not delete or rewrite competition history.</b><p>They only stop new action while you investigate or recover an incident.</p></div></section>
  </>
}


function CitiesAdmin({d,act}){
  const [editing,setEditing]=useState(null);
  const [target,setTarget]=useState('');
  const [status,setStatus]=useState('');
  if(!d?.season)return <Empty title="No active competition" body="Create or activate a Somali Cup season before city operations begin."/>;

  const seasonNext={DRAFT:'QUALIFICATION',QUALIFICATION:'GROUP',GROUP:'KNOCKOUT',KNOCKOUT:'FINAL',FINAL:'COMPLETE',COMPLETE:'ARCHIVED'}[d.season.status];
  const startEdit=c=>{setEditing(c.id);setTarget(String(c.qualification_target||''));setStatus(c.status||'QUALIFYING')};
  const saveCity=c=>act(
    ()=>adminApi('/api/admin/qualification/cities/'+c.id,{method:'PATCH',body:JSON.stringify({
      qualificationTarget:Number(target),
      status
    })}),
    c.name+' updated'
  );

  return <>
    <section className="seasonOpsHero">
      <div>
        <small>SEASON CONTROL</small>
        <h2>{d.season.name}</h2>
        <p>Current stage: <b>{nice(d.season.status)}</b>. Moving the season forward is audited and cannot be casually reversed.</p>
      </div>
      <div className="seasonOpsActions">
        <span className={'status '+String(d.season.status).toLowerCase()}>{d.season.status}</span>
        {seasonNext&&<button className="adminPrimary" onClick={()=>{
          if(window.confirm('Move '+d.season.name+' from '+d.season.status+' to '+seasonNext+'? This is a competition-stage change.')){
            act(()=>adminApi('/api/admin/season',{method:'PATCH',body:JSON.stringify({status:seasonNext,confirmation:'CONFIRM SEASON CHANGE'})}),'Season moved to '+seasonNext)
          }
        }}>MOVE TO {nice(seasonNext)} <ChevronRight size={15}/></button>}
      </div>
    </section>

    <section className="adminPanel">
      <div className="adminPanelAction"><PanelHead eyebrow="CITY OPERATIONS" title="Qualification & city control"/><span className="opsHint">{fmt(d.cities?.length||0)} cities</span></div>
      <div className="cityOpsGrid">
        {(d.cities||[]).map(c=><article className={'cityOpsCard '+(editing===c.id?'editing':'')} key={c.id}>
          <div className="cityOpsHead">
            <div><span className="cityCodeBadge">{c.code}</span><div><h3>{c.name}</h3><small>{c.tier}</small></div></div>
            <span className={c.is_open?'adminYes':'adminNo'}>{c.is_open?'OPEN':'CLOSED'}</span>
          </div>
          <div className="cityOpsNumbers">
            <div><span>Verified Goals</span><strong>{fmt(c.verified_supporters)}</strong></div>
            <div><span>Target</span><strong>{fmt(c.qualification_target)}</strong></div>
            <div><span>Status</span><strong>{nice(c.status)}</strong></div>
          </div>
          <div className="cityOpsButtons">
            <button onClick={()=>act(()=>adminApi('/api/admin/qualification/cities/'+c.id,{method:'PATCH',body:JSON.stringify({isOpen:!c.is_open})}),c.name+(c.is_open?' closed':' opened'))}>{c.is_open?<><Ban size={13}/> CLOSE CITY</>:<><ShieldCheck size={13}/> OPEN CITY</>}</button>
            <button onClick={()=>editing===c.id?setEditing(null):startEdit(c)}><Pencil size={13}/> {editing===c.id?'CLOSE EDITOR':'MANAGE'}</button>
          </div>
          {editing===c.id&&<div className="cityOpsEditor">
            <label><span>Qualification target</span><input type="number" min="1" value={target} onChange={e=>setTarget(e.target.value)}/></label>
            <label><span>Competition status</span><select value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="QUALIFYING">Qualifying</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="ELIMINATED">Eliminated</option>
              <option value="CHAMPION">Champion</option>
            </select></label>
            <button className="adminPrimary compact" onClick={()=>saveCity(c)}><Save size={13}/> SAVE CITY</button>
          </div>}
        </article>)}
      </div>
    </section>
  </>
}

function MatchesAdmin({d,act}){
  const [showCreate,setShowCreate]=useState(false);
  const [editing,setEditing]=useState(null);
  const [scoreEdit,setScoreEdit]=useState(null);
  const blank={homeCityCode:'',awayCityCode:'',roundCode:'GROUP',startsAt:'',lobbyOpensAt:'',durationMinutes:60};
  const [form,setForm]=useState(blank);
  const [editForm,setEditForm]=useState(blank);
  const [scoreForm,setScoreForm]=useState({homeScore:0,awayScore:0,reason:''});
  const next={SCHEDULED:'LOBBY',LOBBY:'LIVE',LIVE:'FINAL'};
  const cities=d?.cities||[];

  const iso=v=>v?new Date(v).toISOString():null;
  const localInput=v=>{
    if(!v)return '';
    const x=new Date(v); if(Number.isNaN(x.getTime()))return '';
    const z=n=>String(n).padStart(2,'0');
    return x.getFullYear()+'-'+z(x.getMonth()+1)+'-'+z(x.getDate())+'T'+z(x.getHours())+':'+z(x.getMinutes());
  };
  const durationFrom=m=>{
    const a=new Date(m.starts_at).getTime(),b=new Date(m.regulation_ends_at).getTime();
    return Number.isFinite(a)&&Number.isFinite(b)&&b>a?Math.round((b-a)/60000):60;
  };
  const openEdit=m=>{
    setEditing(m.public_id);
    setEditForm({
      homeCityCode:m.home_code,awayCityCode:m.away_code,roundCode:m.round_code||'GROUP',
      startsAt:localInput(m.starts_at),lobbyOpensAt:localInput(m.lobby_opens_at),durationMinutes:durationFrom(m)
    });
  };
  const createFixture=()=>act(()=>adminApi('/api/admin/matches',{method:'POST',body:JSON.stringify({
    ...form,startsAt:iso(form.startsAt),lobbyOpensAt:form.lobbyOpensAt?iso(form.lobbyOpensAt):null
  })}),'Fixture created');
  const saveFixture=m=>act(()=>adminApi('/api/admin/matches/'+m.public_id,{method:'PATCH',body:JSON.stringify({
    ...editForm,startsAt:iso(editForm.startsAt),lobbyOpensAt:editForm.lobbyOpensAt?iso(editForm.lobbyOpensAt):null
  })}),'Fixture updated');

  return <>
    <section className="matchOpsHeader">
      <div><small>FIXTURE OPERATIONS</small><h2>Run the match calendar</h2><p>Create, reschedule, open, start, finish or cancel fixtures from one control desk.</p></div>
      <button className="adminPrimary" onClick={()=>setShowCreate(v=>!v)}><Plus size={15}/> {showCreate?'CLOSE FORM':'CREATE FIXTURE'}</button>
    </section>

    {showCreate&&<section className="adminPanel fixtureForm">
      <PanelHead eyebrow="NEW FIXTURE" title="Create a scheduled match"/>
      <div className="opsFormGrid">
        <label><span>Home city</span><select value={form.homeCityCode} onChange={e=>setForm({...form,homeCityCode:e.target.value})}><option value="">Select city</option>{cities.map(c=><option key={c.code} value={c.code}>{c.name} · {c.code}</option>)}</select></label>
        <label><span>Away city</span><select value={form.awayCityCode} onChange={e=>setForm({...form,awayCityCode:e.target.value})}><option value="">Select city</option>{cities.map(c=><option key={c.code} value={c.code}>{c.name} · {c.code}</option>)}</select></label>
        <label><span>Round</span><input value={form.roundCode} onChange={e=>setForm({...form,roundCode:e.target.value})}/></label>
        <label><span>Duration (minutes)</span><input type="number" min="1" value={form.durationMinutes} onChange={e=>setForm({...form,durationMinutes:Number(e.target.value)})}/></label>
        <label><span>Kickoff</span><input type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})}/></label>
        <label><span>Lobby opens</span><input type="datetime-local" value={form.lobbyOpensAt} onChange={e=>setForm({...form,lobbyOpensAt:e.target.value})}/></label>
      </div>
      <button className="adminPrimary compact" onClick={createFixture}><Plus size={14}/> CREATE SCHEDULED FIXTURE</button>
    </section>}

    <section className="adminPanel"><PanelHead eyebrow="MATCH CONTROL" title="Fixtures & lifecycle"/>
      <div className="adminMatchList ops">{(d?.matches||[]).map(m=><article key={m.public_id} className={'adminMatchCard ops '+String(m.status).toLowerCase()}>
        <div className="adminMatchTop"><span className={'status '+String(m.status).toLowerCase()}>{m.status}</span><small>{m.round_code} · {m.participation_total} participants · {m.verified_goals} verified Goals</small></div>
        <div className="adminMatchScore"><div><b>{m.home_code}</b><span>{m.home_name}</span></div><strong>{m.home_score} — {m.away_score}</strong><div><b>{m.away_code}</b><span>{m.away_name}</span></div></div>
        <div className="matchOpsTimes">
          <span><CalendarClock size={12}/> Kickoff {m.starts_at?new Date(m.starts_at).toLocaleString():'Not set'}</span>
          <span>Lobby {m.lobby_opens_at?new Date(m.lobby_opens_at).toLocaleString():'Not set'}</span>
          {m.winner_code&&<b>Winner: {m.winner_name} ({m.winner_code})</b>}
        </div>
        <div className="matchOpsButtons">
          {next[m.status]&&<button className="adminPrimary compact" onClick={()=>{
            const target=next[m.status];
            if(target==='FINAL'&&!window.confirm('Finish this match now? The winner will be calculated from the verified score.'))return;
            act(()=>adminApi('/api/admin/matches/'+m.public_id+'/state',{method:'PATCH',body:JSON.stringify({status:target})}),'Match moved to '+target)
          }}>{next[m.status]==='FINAL'?'FULL TIME':'MOVE TO '+nice(next[m.status])} <ChevronRight size={12}/></button>}
          {['SCHEDULED','LOBBY'].includes(m.status)&&<button onClick={()=>editing===m.public_id?setEditing(null):openEdit(m)}><Pencil size={12}/> EDIT</button>}
          {m.status==='LIVE'&&<button onClick={()=>{setScoreEdit(scoreEdit===m.public_id?null:m.public_id);setScoreForm({homeScore:Number(m.home_score),awayScore:Number(m.away_score),reason:''})}}><Pencil size={12}/> SCORE CORRECTION</button>}
          {['SCHEDULED','LOBBY','LIVE'].includes(m.status)&&<button className="danger" onClick={()=>{
            if(window.confirm('Cancel '+m.home_code+' vs '+m.away_code+'? This will stop the fixture.')){
              act(()=>adminApi('/api/admin/matches/'+m.public_id+'/state',{method:'PATCH',body:JSON.stringify({status:'CANCELLED',confirmation:'CANCEL MATCH'})}),'Match cancelled')
            }
          }}><Ban size={12}/> CANCEL</button>}
          {m.status==='CANCELLED'&&<button onClick={()=>{
            if(window.confirm('Reopen this cancelled match as SCHEDULED?')){
              act(()=>adminApi('/api/admin/matches/'+m.public_id+'/state',{method:'PATCH',body:JSON.stringify({status:'SCHEDULED',confirmation:'REOPEN MATCH'})}),'Match reopened')
            }
          }}><RefreshCw size={12}/> REOPEN</button>}
        </div>
        {editing===m.public_id&&<div className="matchInlineEditor">
          <div className="opsFormGrid">
            <label><span>Home</span><select value={editForm.homeCityCode} onChange={e=>setEditForm({...editForm,homeCityCode:e.target.value})}>{cities.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label><span>Away</span><select value={editForm.awayCityCode} onChange={e=>setEditForm({...editForm,awayCityCode:e.target.value})}>{cities.map(c=><option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
            <label><span>Round</span><input value={editForm.roundCode} onChange={e=>setEditForm({...editForm,roundCode:e.target.value})}/></label>
            <label><span>Duration</span><input type="number" value={editForm.durationMinutes} onChange={e=>setEditForm({...editForm,durationMinutes:Number(e.target.value)})}/></label>
            <label><span>Kickoff</span><input type="datetime-local" value={editForm.startsAt} onChange={e=>setEditForm({...editForm,startsAt:e.target.value})}/></label>
            <label><span>Lobby opens</span><input type="datetime-local" value={editForm.lobbyOpensAt} onChange={e=>setEditForm({...editForm,lobbyOpensAt:e.target.value})}/></label>
          </div>
          <button className="adminPrimary compact" onClick={()=>saveFixture(m)}><Save size={13}/> SAVE FIXTURE</button>
        </div>}
        {scoreEdit===m.public_id&&<div className="scoreCorrection">
          <div><label><span>{m.home_code}</span><input type="number" min="0" value={scoreForm.homeScore} onChange={e=>setScoreForm({...scoreForm,homeScore:Number(e.target.value)})}/></label><label><span>{m.away_code}</span><input type="number" min="0" value={scoreForm.awayScore} onChange={e=>setScoreForm({...scoreForm,awayScore:Number(e.target.value)})}/></label></div>
          <label><span>Reason for correction</span><input value={scoreForm.reason} onChange={e=>setScoreForm({...scoreForm,reason:e.target.value})} placeholder="Explain the verified correction"/></label>
          <button className="adminPrimary compact" onClick={()=>{
            if(window.confirm('Apply this audited score correction? An ADJUSTMENT event will be written to history.')){
              act(()=>adminApi('/api/admin/matches/'+m.public_id+'/score-adjustment',{method:'POST',body:JSON.stringify({...scoreForm,confirmation:'CONFIRM SCORE CORRECTION'})}),'Score corrected')
            }
          }}><Save size={13}/> APPLY AUDITED CORRECTION</button>
        </div>}
      </article>)}</div>
    </section>
  </>
}

function TournamentAdmin({d,act}){
  return <>
    <section className="adminPanel"><div className="adminPanelAction"><PanelHead eyebrow="ROAD TO THE CUP" title={d?.season?.name||'Tournament'}/><button className="adminPrimary compact" onClick={()=>act(()=>adminApi('/api/admin/tournament/progress',{method:'POST'}),'Tournament progression checked')}>RUN PROGRESSION <ChevronRight size={14}/></button></div>
      {(d?.stages||[]).length?<div className="adminStageGrid">{d.stages.map(s=><article key={s.code}><div><small>{s.type}</small><h3>{s.name}</h3></div><span className={'status '+String(s.status).toLowerCase()}>{s.status}</span><p>{s.type==='GROUP'?fmt(s.groups?.length)+' groups':fmt(s.matches?.length)+' fixtures'}</p></article>)}</div>:<Empty title="Tournament structure not published" body="The engine is ready. Configure stages after qualification decides the field."/>}
    </section>
  </>
}

function SupportersAdmin({d,query,setQuery,refresh,act}){
  const [selected,setSelected]=useState(null);
  const [reason,setReason]=useState('');
  const supporters=d?.supporters||[];
  return <section className="adminPanel">
    <div className="adminPanelAction"><PanelHead eyebrow="SUPPORTER OPERATIONS" title="Verified identities & access"/><div className="adminSearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&refresh()} placeholder="Search name, email or supporter ID"/></div></div>
    <div className="supporterOpsList">{supporters.map(u=><article key={u.public_id} className={'supporterOpsCard '+String(u.status).toLowerCase()}>
      <div className="supporterOpsIdentity"><span>{(u.nickname||u.display_name||'?')[0]}</span><div><b>{u.nickname||u.display_name}</b><small>{u.email||u.public_id}</small></div></div>
      <div className="supporterOpsMetrics">
        <div><span>City</span><b>{u.city_name} · {u.city_code}</b></div>
        <div><span>Goal</span><b>#{u.goal_number}</b></div>
        <div><span>Assists</span><b>{fmt(u.assists)}</b></div>
        <div><span>Devices</span><b>{fmt(u.device_claims)}</b></div>
        <div><span>Integrity</span><b>{fmt(u.integrity_flags)}</b></div>
      </div>
      <div className="supporterOpsActions">
        <span className={'status '+String(u.status).toLowerCase()}>{u.status}</span>
        <button onClick={()=>{setSelected(selected===u.public_id?null:u.public_id);setReason('')}}><Pencil size={12}/> {selected===u.public_id?'CLOSE':'MANAGE'}</button>
      </div>
      {selected===u.public_id&&<div className="supporterManage">
        <label><span>Reason for this account action</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Internal reason, minimum 5 characters"/></label>
        {u.status==='ACTIVE'
          ?<button className="danger" onClick={()=>{
            if(reason.trim().length<5)return;
            if(window.confirm('Suspend '+(u.nickname||u.display_name)+'? Their active supporter sessions will be revoked immediately.')){
              act(()=>adminApi('/api/admin/supporters/'+u.public_id+'/status',{method:'PATCH',body:JSON.stringify({status:'SUSPENDED',reason,confirmation:'CONFIRM SUPPORTER STATUS'})}),'Supporter suspended')
            }
          }}><Ban size={13}/> SUSPEND SUPPORTER</button>
          :<button className="adminPrimary compact" onClick={()=>{
            if(reason.trim().length<5)return;
            if(window.confirm('Reinstate '+(u.nickname||u.display_name)+'?')){
              act(()=>adminApi('/api/admin/supporters/'+u.public_id+'/status',{method:'PATCH',body:JSON.stringify({status:'ACTIVE',reason,confirmation:'CONFIRM SUPPORTER STATUS'})}),'Supporter reinstated')
            }
          }}><ShieldCheck size={13}/> REINSTATE SUPPORTER</button>}
        <p>Suspension blocks supporter access immediately but preserves Goal, referral and audit history for review.</p>
      </div>}
    </article>)}</div>
  </section>
}

function IntegrityAdmin({d,act}){
  const s=d?.summary||{};
  const [reviewing,setReviewing]=useState(null);
  const [notes,setNotes]=useState('');
  return <>
    <div className="adminStats integrity"><Stat label="Device claims" value={s.deviceClaims} detail="Bound supporter identities"/><Stat label="Recoveries" value={s.deviceRecoveries} detail="Sessions restored"/><Stat label="Duplicate blocks" value={s.duplicateDeviceBlocks} detail="Same-device repeat attempts"/><Stat label="Network bursts" value={s.networkBurstSignals} detail="Review only" tone={s.networkBurstSignals?'warn':''}/></div>
    <section className="adminPanel">
      <div className="adminPanelAction"><PanelHead eyebrow="INTEGRITY OPERATIONS" title="Review signals & document decisions"/><span className="opsHint">Evidence, not automatic guilt</span></div>
      <div className="integrityOpsList">{(d?.recent||[]).length?(d.recent||[]).map(r=><article className={'integrityOpsCard '+String(r.review_status||'UNREVIEWED').toLowerCase()} key={r.id}>
        <div className="integrityOpsIcon"><ShieldCheck size={17}/></div>
        <div className="integrityOpsMain">
          <div><b>{nice(r.event_type)}</b><span className={'status '+String(r.review_status||'UNREVIEWED').toLowerCase()}>{r.review_status||'UNREVIEWED'}</span></div>
          <small>{r.display_name||'Anonymous attempt'} · {new Date(r.created_at).toLocaleString()}</small>
          <p>{r.device_hint?'Device '+r.device_hint:''}{r.device_hint&&r.network_hint?' · ':''}{r.network_hint?'Network '+r.network_hint:''}</p>
          {r.review_notes&&<em>Review: {r.review_notes}{r.reviewed_by_name?' · '+r.reviewed_by_name:''}</em>}
        </div>
        <button className="adminSmallBtn" onClick={()=>{setReviewing(reviewing===r.id?null:r.id);setNotes(r.review_notes||'')}}>{reviewing===r.id?'Close':'Review'}</button>
        {reviewing===r.id&&<div className="integrityReviewBox">
          <label><span>Internal review notes</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What did you verify?"/></label>
          <div>
            <button disabled={notes.trim().length<3} onClick={()=>act(()=>adminApi('/api/admin/integrity/'+r.id+'/review',{method:'PATCH',body:JSON.stringify({status:'REVIEWED',notes})}),'Signal marked reviewed')}><ShieldCheck size={12}/> MARK REVIEWED</button>
            <button className="dismiss" disabled={notes.trim().length<3} onClick={()=>act(()=>adminApi('/api/admin/integrity/'+r.id+'/review',{method:'PATCH',body:JSON.stringify({status:'DISMISSED',notes})}),'Signal dismissed')}><X size={12}/> DISMISS</button>
          </div>
        </div>}
      </article>):<Empty compact title="No review signals" body="No recent duplicate-device or burst events."/>}</div>
    </section>
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
function AuditRows({rows}){return <div className="adminAuditRows">{rows.length?rows.map(r=><div key={r.id}><Activity size={15}/><div><b>{nice(r.action)}</b><small>{r.entity_type} · {r.entity_id} · {r.actor_name||'System'}</small></div><span>{new Date(r.created_at).toLocaleString()}</span></div>):<Empty compact title="No audit events yet" body="Operational changes will appear here."/>}</div>}
function PanelHead({eyebrow,title}){return <div className="adminPanelHead"><small>{eyebrow}</small><h2>{title}</h2></div>}
function Empty({title,body,compact=false}){return <div className={'adminEmpty '+(compact?'compact':'')}><LockKeyhole size={compact?17:25}/><div><b>{title}</b><p>{body}</p></div></div>}
