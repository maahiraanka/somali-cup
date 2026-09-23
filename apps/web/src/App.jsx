import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Flag, Globe2, LockKeyhole, MapPin, ShieldCheck, Trophy, Users, X } from 'lucide-react';

const demoStandings=[
  {rank:1,code:'MEL',name:'Melbourne',country:'Australia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:418,progress_pct:83.6,is_open:1},
  {rank:2,code:'LON',name:'London',country:'United Kingdom',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:397,progress_pct:79.4,is_open:1},
  {rank:3,code:'TOR',name:'Toronto',country:'Canada',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:346,progress_pct:69.2,is_open:1},
  {rank:4,code:'NAI',name:'Nairobi',country:'Kenya',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:319,progress_pct:63.8,is_open:1},
  {rank:5,code:'MIN',name:'Minneapolis',country:'United States',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:288,progress_pct:57.6,is_open:1},
  {rank:6,code:'MOG',name:'Mogadishu',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:271,progress_pct:54.2,is_open:1},
  {rank:7,code:'STO',name:'Stockholm',country:'Sweden',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:182,progress_pct:60.7,is_open:1},
  {rank:8,code:'HAR',name:'Hargeisa',country:'Somalia',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:161,progress_pct:53.7,is_open:1},
  {rank:9,code:'PER',name:'Perth',country:'Australia',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:149,progress_pct:49.7,is_open:1},
  {rank:10,code:'BHM',name:'Birmingham',country:'United Kingdom',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:141,progress_pct:47,is_open:1},
];
const flag=(country)=>({Australia:'🇦🇺','United Kingdom':'🇬🇧',Canada:'🇨🇦',Kenya:'🇰🇪','United States':'🇺🇸',Somalia:'🇸🇴',Sweden:'🇸🇪',Norway:'🇳🇴','United Arab Emirates':'🇦🇪'})[country]||'🌍';
const fmt=n=>Number(n||0).toLocaleString();

function api(path,opts={}){
  const token=localStorage.getItem('somalicup_session');
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(token) headers.Authorization=`Bearer ${token}`;
  return fetch(path,{...opts,headers}).then(async r=>{const body=await r.json().catch(()=>({}));if(!r.ok) throw Object.assign(new Error(body.error||'request_failed'),{status:r.status,body});return body});
}

function CityBadge({city,large=false}){return <div className={`cityBadge ${large?'large':''}`}><span>{flag(city.country)}</span><b>{city.code}</b></div>}
function Progress({value}){const v=Math.max(0,Math.min(100,Number(value)||0));return <div className="progress"><i style={{width:`${v}%`}}/></div>}

export default function App(){
  const [view,setView]=useState('home');
  const [standings,setStandings]=useState(demoStandings);
  const [season,setSeason]=useState({name:'Somali Cup 2027',status:'QUALIFICATION'});
  const [selectedCity,setSelectedCity]=useState(null);
  const [me,setMe]=useState(null);
  const [showJoin,setShowJoin]=useState(false);
  const [adminOpen,setAdminOpen]=useState(false);
  const [adminKey,setAdminKey]=useState('');
  const [notice,setNotice]=useState('');

  const refresh=async()=>{
    try{const d=await api('/api/qualification'); if(d?.standings?.length){setStandings(d.standings);setSeason(d.season||season)}}catch{}
    try{const m=await api('/api/identity/me');setMe(m)}catch{}
  };
  useEffect(()=>{refresh()},[]);
  const topCity=standings[0];
  const cityForMe=useMemo(()=>me?.membership?standings.find(c=>c.code===me.membership.code):null,[me,standings]);
  const openCity=(city)=>{setSelectedCity(city);setView('city');window.scrollTo({top:0,behavior:'smooth'})};
  const joined=(payload)=>{localStorage.setItem('somalicup_session',payload.token);setShowJoin(false);setNotice(`You're now representing ${payload.city.name}.`);refresh();setTimeout(()=>setNotice(''),2600)};

  return <div className="app">
    <header className="topbar">
      <button className="brandBtn" onClick={()=>setView('home')}><div className="mark">SC</div><div><b>SOMALI CUP</b><small>Different cities. One people.</small></div></button>
      <nav className="nav"><button className={view==='home'?'active':''} onClick={()=>setView('home')}>Home</button><button className={view==='qualification'?'active':''} onClick={()=>setView('qualification')}>Qualification</button><button onClick={()=>setAdminOpen(true)}>Admin preview</button></nav>
      <div className="identity">{me?<><div className="avatar">{(me.user.nickname||me.user.displayName||'?')[0]}</div><div><b>{me.user.nickname||me.user.displayName}</b><small>{me.membership?.name||'Supporter'}</small></div></>:<button className="joinTop" onClick={()=>setShowJoin(true)}>Represent your city</button>}</div>
    </header>

    <main>
      {view==='home' && <>
        <section className="hero">
          <div className="heroCopy">
            <div className="eyebrow"><Trophy size={15}/> QUALIFICATION IS OPEN</div>
            <h1>Earn your city's place in the <em>Somali Cup.</em></h1>
            <p>Choose the city you represent. Every verified supporter moves that city closer to qualification. Raw clicks don't count. Real people do.</p>
            <div className="actions"><button onClick={()=>setShowJoin(true)}>Represent my city <ArrowRight size={17}/></button><button className="ghost" onClick={()=>setView('qualification')}>See qualification table</button></div>
            {cityForMe && <div className="myCityHero"><CheckCircle2 size={18}/><div><b>You represent {cityForMe.name}</b><span>{fmt(cityForMe.verified_supporters)} / {fmt(cityForMe.qualification_target)} verified supporters</span></div><button onClick={()=>openCity(cityForMe)}>Open city <ChevronRight size={16}/></button></div>}
            <div className="stats"><div className="stat"><span>Season</span><strong>{season?.name?.replace('Somali Cup ','')||'2027'}</strong></div><div className="stat"><span>Open Cities</span><strong>{standings.filter(c=>c.is_open).length}</strong></div><div className="stat"><span>Verified Supporters</span><strong>{fmt(standings.reduce((a,c)=>a+Number(c.verified_supporters||0),0))}</strong></div><div className="stat"><span>Leader</span><strong>{topCity?.code||'—'}</strong></div></div>
          </div>
          <div className="heroBoard">
            <div className="boardHead"><span><i/> LIVE QUALIFICATION</span><b>{season?.name||'Somali Cup'}</b></div>
            <div className="leaderSpot"><CityBadge city={topCity||demoStandings[0]} large/><div><small>CURRENT LEADER</small><h2>{topCity?.name||'Melbourne'}</h2><p>{fmt(topCity?.verified_supporters)} verified supporters</p></div><div className="rankOne">#1</div></div>
            <Progress value={topCity?.progress_pct}/>
            <div className="boardList">{standings.slice(1,5).map(c=><button key={c.code} onClick={()=>openCity(c)}><span className="rank">#{c.rank}</span><CityBadge city={c}/><span className="cityName"><b>{c.name}</b><small>{fmt(c.verified_supporters)} verified</small></span><span className="pct">{Number(c.progress_pct||0).toFixed(0)}%</span></button>)}</div>
            <button className="tableLink" onClick={()=>setView('qualification')}>View full qualification table <ArrowRight size={16}/></button>
          </div>
        </section>
        <section className="cards"><article><ShieldCheck/><h3>Verified people count</h3><p>Qualification is based on active, verified city memberships — not page views, clicks or invite attempts.</p></article><article><MapPin/><h3>One city per season</h3><p>Your city membership becomes your tournament identity for the season and later follows you into live matches.</p></article><article><Trophy/><h3>Qualification has a finish</h3><p>Each city has a visible target and status. When the target is reached, Admin can lock qualification and move the city into the tournament.</p></article></section>
      </>}

      {view==='qualification' && <Qualification standings={standings} season={season} openCity={openCity} onJoin={()=>setShowJoin(true)} />}
      {view==='city' && selectedCity && <CityPage city={standings.find(c=>c.code===selectedCity.code)||selectedCity} onBack={()=>setView('qualification')} onJoin={()=>setShowJoin(true)} me={me}/>} 
    </main>

    {showJoin && <JoinModal standings={standings.filter(c=>c.is_open)} onClose={()=>setShowJoin(false)} onJoined={joined}/>} 
    {adminOpen && <AdminModal standings={standings} adminKey={adminKey} setAdminKey={setAdminKey} onClose={()=>setAdminOpen(false)} onUpdated={refresh}/>} 
    {notice && <div className="toast">{notice}</div>}
  </div>
}

function Qualification({standings,season,openCity,onJoin}){return <>
  <div className="pagehead"><div><div className="eyebrow"><Flag size={15}/> {season?.name||'Somali Cup'} · QUALIFICATION</div><h1>Every city has a path in.</h1><p>The table counts verified supporters only. Targets can differ by city tier so qualification stays competitive.</p></div><button className="primarySmall" onClick={onJoin}>Represent a city</button></div>
  <div className="qualificationLayout">
    <section className="tablePanel"><div className="tableHead"><span>Rank</span><span>City</span><span>Tier</span><span>Verified</span><span>Progress</span><span>Status</span></div>{standings.map(c=><button className="tableRow" key={c.code} onClick={()=>openCity(c)}><span className="rankNum">{c.rank}</span><span className="cityCell"><CityBadge city={c}/><span><b>{c.name}</b><small>{c.country}</small></span></span><span><em className={`tier ${String(c.tier).toLowerCase()}`}>{c.tier}</em></span><span className="verified">{fmt(c.verified_supporters)} <small>/ {fmt(c.qualification_target)}</small></span><span className="progressCell"><Progress value={c.progress_pct}/><small>{Number(c.progress_pct||0).toFixed(1)}%</small></span><span className={`statusPill ${String(c.status).toLowerCase()}`}>{c.status}</span></button>)}</section>
    <aside className="rulesPanel"><div className="ruleIcon"><ShieldCheck/></div><h2>Qualification integrity</h2><p>Somali Cup treats qualification as a competition, so the score must have one clear source of truth.</p><div className="rule"><b>Counts</b><span>Active + verified supporter memberships</span></div><div className="rule"><b>Doesn't count</b><span>Clicks, views, raw shares, pending or rejected supporters</span></div><div className="rule"><b>Admin controls</b><span>City open/closed state, target and qualification status</span></div><div className="rule"><b>Audit trail</b><span>Every admin qualification change creates an event + audit entry</span></div></aside>
  </div>
</>}

function CityPage({city,onBack,onJoin,me}){const mine=me?.membership?.code===city.code;return <>
  <button className="backBtn" onClick={onBack}><ArrowLeft size={16}/> Qualification</button>
  <section className="cityHero"><div className="cityTitle"><CityBadge city={city} large/><div><div className="eyebrow">{city.tier} CITY · #{city.rank||'—'} IN QUALIFICATION</div><h1>{city.name}</h1><p>{city.country} · {city.status}</p></div></div><div className="cityBigStat"><span>VERIFIED SUPPORTERS</span><strong>{fmt(city.verified_supporters)}</strong><small>{fmt(city.qualification_target-city.verified_supporters)} more to hit the current target</small></div></section>
  <div className="cityProgress"><div><b>{Number(city.progress_pct||0).toFixed(1)}% complete</b><span>{fmt(city.verified_supporters)} / {fmt(city.qualification_target)}</span></div><Progress value={city.progress_pct}/></div>
  <div className="cityGrid"><article><Users/><h3>Represent {city.name}</h3><p>Your verified city membership is what moves this number. You can only represent one city in the active season.</p>{mine?<div className="mine"><CheckCircle2/> You already represent {city.name}</div>:<button onClick={onJoin}>Join {city.name}</button>}</article><article><Globe2/><h3>What happens next</h3><p>When qualification closes, qualified cities move into tournament fixtures. Your existing city identity then carries into the match engine.</p></article><article><LockKeyhole/><h3>Protected scoring</h3><p>This phase deliberately separates verified supporters from raw traffic so later match scoring can inherit the same integrity model.</p></article></div>
</>}

function JoinModal({standings,onClose,onJoined}){
  const [step,setStep]=useState(1); const [city,setCity]=useState(null); const [form,setForm]=useState({displayName:'',nickname:'',email:''}); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{setBusy(true);setError('');try{const payload=await api('/api/identity/join',{method:'POST',body:JSON.stringify({...form,cityCode:city.code})});onJoined(payload)}catch(e){setError(e.message.replaceAll('_',' '))}finally{setBusy(false)}};
  return <div className="modal"><div className="joinModal"><button className="close" onClick={onClose}><X/></button><div className="joinTopline"><span className={step>=1?'on':''}>1</span><i/><span className={step>=2?'on':''}>2</span><i/><span className={step>=3?'on':''}>3</span></div>
    {step===1 && <><div className="eyebrow">CHOOSE YOUR CITY</div><h2>Who do you represent?</h2><p>Your city becomes your Somali Cup identity for this season.</p><div className="cityPicker">{standings.map(c=><button key={c.code} className={city?.code===c.code?'selected':''} onClick={()=>setCity(c)}><CityBadge city={c}/><span><b>{c.name}</b><small>{c.country}</small></span><span className="cityPct">{Number(c.progress_pct||0).toFixed(0)}%</span></button>)}</div><button className="modalPrimary" disabled={!city} onClick={()=>setStep(2)}>Continue with {city?.name||'city'} <ArrowRight size={17}/></button></>}
    {step===2 && <><div className="eyebrow">YOUR SUPPORTER IDENTITY</div><h2>Almost there.</h2><p>Use the name people should recognise during the tournament. Email is optional in v0.2.</p><label>Display name<input value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})} placeholder="Amadeo"/></label><label>Nickname <small>optional</small><input value={form.nickname} onChange={e=>setForm({...form,nickname:e.target.value})} placeholder="What should the stadium call you?"/></label><label>Email <small>optional</small><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label><div className="modalActions"><button className="ghostBtn" onClick={()=>setStep(1)}>Back</button><button className="modalPrimary" disabled={form.displayName.trim().length<2} onClick={()=>setStep(3)}>Review <ArrowRight size={17}/></button></div></>}
    {step===3 && <><div className="eyebrow">CONFIRM</div><h2>Represent {city.name}.</h2><p>This creates one verified city membership for the current season.</p><div className="review"><CityBadge city={city} large/><div><b>{form.nickname||form.displayName}</b><span>{city.name}, {city.country}</span><small>Verified supporter · device session</small></div></div><div className="integrity"><ShieldCheck/><div><b>Qualification integrity</b><span>Your membership counts once. Raw page views and repeated clicks do not add extra support.</span></div></div>{error&&<div className="error">{error}</div>}<div className="modalActions"><button className="ghostBtn" onClick={()=>setStep(2)}>Back</button><button className="modalPrimary" disabled={busy} onClick={submit}>{busy?'Joining…':`Represent ${city.name}`}</button></div></>}
  </div></div>
}

function AdminModal({standings,adminKey,setAdminKey,onClose,onUpdated}){
  const [selected,setSelected]=useState(standings[0]); const [target,setTarget]=useState(selected?.qualification_target||500); const [status,setStatus]=useState(selected?.status||'QUALIFYING'); const [isOpen,setIsOpen]=useState(Boolean(selected?.is_open)); const [msg,setMsg]=useState('');
  useEffect(()=>{setTarget(selected?.qualification_target||500);setStatus(selected?.status||'QUALIFYING');setIsOpen(Boolean(selected?.is_open))},[selected]);
  const save=async()=>{setMsg('');try{await api(`/api/admin/qualification/cities/${selected.id}`,{method:'PATCH',headers:{'x-admin-key':adminKey},body:JSON.stringify({qualificationTarget:Number(target),status,isOpen})});setMsg('Saved');onUpdated()}catch(e){setMsg(e.message.replaceAll('_',' '))}};
  return <div className="modal"><div className="adminModal"><button className="close" onClick={onClose}><X/></button><div className="eyebrow">ADMIN PREVIEW · TEMPORARY V0.2 CONTROL</div><h2>Qualification control</h2><p>This bootstrap-key screen is a safety guard for v0.2. It will be replaced by role-based admin authentication before launch.</p><label>Admin bootstrap key<input type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="ADMIN_BOOTSTRAP_KEY"/></label><div className="adminGrid"><div className="adminCities">{standings.map(c=><button key={c.code} className={selected?.code===c.code?'selected':''} onClick={()=>setSelected(c)}><b>{c.name}</b><small>{c.code} · {fmt(c.verified_supporters)} verified</small></button>)}</div><div className="adminForm"><h3>{selected?.name}</h3><label>Qualification target<input type="number" min="1" value={target} onChange={e=>setTarget(e.target.value)}/></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option>QUALIFYING</option><option>QUALIFIED</option><option>ELIMINATED</option><option>CHAMPION</option></select></label><label className="toggle"><input type="checkbox" checked={isOpen} onChange={e=>setIsOpen(e.target.checked)}/><span>City open for new supporters</span></label><button className="modalPrimary" disabled={!adminKey} onClick={save}>Save qualification settings</button>{msg&&<div className="adminMsg">{msg}</div>}</div></div></div></div>
}
