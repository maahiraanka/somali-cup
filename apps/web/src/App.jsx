import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,ArrowRight,BarChart3,Check,ChevronRight,Clock3,Globe2,Heart,Link2,LockKeyhole,MapPin,Menu,Play,Radio,Search,Share2,ShieldCheck,Sparkles,Trophy,UserPlus,Users,X,Zap} from 'lucide-react';

const heroImage='https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=2200&q=90';
const cityImages={
  MOG:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=1000&q=88',
  HAR:'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1000&q=88',
  KIS:'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1000&q=88',
  GAR:'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1000&q=88',
  BOS:'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1000&q=88',
  BAI:'https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1000&q=88',
  BLW:'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1000&q=88',
  GAL:'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1000&q=88',
  JOW:'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?auto=format&fit=crop&w=1000&q=88',
  BUR:'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1000&q=88'
};
const demoStandings=[
  {rank:1,code:'MOG',name:'Mogadishu',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:418,progress_pct:83.6,is_open:1},
  {rank:2,code:'HAR',name:'Hargeisa',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:397,progress_pct:79.4,is_open:1},
  {rank:3,code:'KIS',name:'Kismayo',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:346,progress_pct:69.2,is_open:1},
  {rank:4,code:'GAR',name:'Garowe',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:319,progress_pct:63.8,is_open:1},
  {rank:5,code:'BOS',name:'Bosaso',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:288,progress_pct:57.6,is_open:1},
  {rank:6,code:'BAI',name:'Baidoa',country:'Somalia',tier:'PREMIER',status:'QUALIFYING',qualification_target:500,verified_supporters:271,progress_pct:54.2,is_open:1},
  {rank:7,code:'BLW',name:'Beledweyne',country:'Somalia',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:182,progress_pct:60.7,is_open:1},
  {rank:8,code:'GAL',name:'Galkayo',country:'Somalia',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:161,progress_pct:53.7,is_open:1},
  {rank:9,code:'JOW',name:'Jowhar',country:'Somalia',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:149,progress_pct:49.7,is_open:1},
  {rank:10,code:'BUR',name:'Burco',country:'Somalia',tier:'CHAMPIONSHIP',status:'QUALIFYING',qualification_target:300,verified_supporters:141,progress_pct:47,is_open:1}
];
const demoMatches=[{publicId:'sc2027mellondonqf000000001',seasonName:'Somali Cup 2027',roundCode:'QUARTERFINAL',status:'LOBBY',startsAt:'2027-06-12T09:30:00.000Z',lobbyOpensAt:'2027-06-12T09:00:00.000Z',scoreVersion:0,home:{code:'MOG',name:'Mogadishu',country:'Somalia',score:0},away:{code:'HAR',name:'Hargeisa',country:'Somalia',score:0}}];

const flag=(country)=>({Australia:'🇦🇺','United Kingdom':'🇬🇧',Canada:'🇨🇦',Kenya:'🇰🇪','United States':'🇺🇸',Somalia:'🇸🇴',Sweden:'🇸🇪',Norway:'🇳🇴','United Arab Emirates':'🇦🇪'})[country]||'🌍';
const fmt=n=>Number(n||0).toLocaleString();
function api(path,opts={}){const token=localStorage.getItem('somalicup_session');const headers={'Content-Type':'application/json',...(opts.headers||{})};if(token)headers.Authorization=`Bearer ${token}`;return fetch(path,{...opts,headers}).then(async r=>{const body=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(body.error||'request_failed'),{status:r.status,body});return body})}
const imgFor=c=>cityImages[c?.code]||heroImage;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
async function sharePoster({city,title,subtitle,eyebrow='SOMALI CUP 2027',footer='Different cities. One people.',accent='#ffcf4a'}){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#020914"/><stop offset=".55" stop-color="#071b30"/><stop offset="1" stop-color="#020914"/></linearGradient>
      <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".32"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/></filter>
    </defs>
    <rect width="1080" height="1920" fill="url(#bg)"/>
    <circle cx="825" cy="290" r="480" fill="url(#glow)"/>
    <path d="M0 1420 C220 1320 410 1490 650 1380 S890 1260 1080 1320 L1080 1920 L0 1920Z" fill="#03101d"/>
    <text x="72" y="110" fill="#8dcff0" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="7">${esc(eyebrow)}</text>
    <text x="72" y="195" fill="#fff" font-family="Arial,sans-serif" font-size="66" font-weight="900">SOMALI</text>
    <text x="72" y="262" fill="${accent}" font-family="Arial,sans-serif" font-size="66" font-weight="900">CUP</text>
    <rect x="72" y="340" width="936" height="2" fill="#2aaee8" opacity=".35"/>
    <text x="72" y="520" fill="#fff" font-family="Arial,sans-serif" font-size="82" font-weight="900" filter="url(#shadow)">${esc(title)}</text>
    <text x="72" y="610" fill="#a9bfd2" font-family="Arial,sans-serif" font-size="38" font-weight="600">${esc(subtitle)}</text>
    <g transform="translate(72 760)">
      <rect width="936" height="420" rx="48" fill="#071827" stroke="#2fcaff" stroke-opacity=".28" stroke-width="3"/>
      <circle cx="170" cy="165" r="102" fill="#0d2b45" stroke="${accent}" stroke-width="8"/>
      <text x="170" y="185" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="68" font-weight="900">${esc(city?.code||'SC')}</text>
      <text x="330" y="150" fill="#8dcff0" font-family="Arial,sans-serif" font-size="26" font-weight="700" letter-spacing="5">REPRESENTING</text>
      <text x="330" y="225" fill="#fff" font-family="Arial,sans-serif" font-size="62" font-weight="900">${esc(city?.name||'Somali Cup')}</text>
      <text x="330" y="280" fill="#93a9be" font-family="Arial,sans-serif" font-size="30">Somalia</text>
      <rect x="70" y="340" width="796" height="2" fill="#274b66"/>
      <text x="70" y="390" fill="${accent}" font-family="Arial,sans-serif" font-size="25" font-weight="800" letter-spacing="4">VERIFIED SUPPORTER</text>
    </g>
    <text x="72" y="1480" fill="#fff" font-family="Arial,sans-serif" font-size="46" font-weight="800">${esc(footer)}</text>
    <rect x="72" y="1540" width="650" height="112" rx="56" fill="${accent}"/>
    <text x="397" y="1611" text-anchor="middle" fill="#07101a" font-family="Arial,sans-serif" font-size="34" font-weight="900">JOIN ${esc(city?.name?.toUpperCase()||'YOUR CITY')}</text>
    <text x="72" y="1710" fill="#8eb2ca" font-family="Arial,sans-serif" font-size="28">somalicup.com/?city=${esc(city?.code||'')}</text>
    <text x="72" y="1815" fill="#31516d" font-family="Arial,sans-serif" font-size="28" font-weight="700" letter-spacing="5">ONE CITY • ONE SEASON • ONE CUP</text>
  </svg>`;
  const svgBlob=new Blob([svg],{type:'image/svg+xml'});
  const svgUrl=URL.createObjectURL(svgBlob);
  const pngBlob=await new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,1080,1920);
      URL.revokeObjectURL(svgUrl);
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('poster_render_failed')),'image/png',.94);
    };
    image.onerror=()=>{URL.revokeObjectURL(svgUrl);reject(new Error('poster_render_failed'))};
    image.src=svgUrl;
  });
  const file=new File([pngBlob],'somali-cup-status.png',{type:'image/png'});
  if(navigator.share&&navigator.canShare?.({files:[file]})){
    try{await navigator.share({title:'Somali Cup',text:`${subtitle}\nJoin ${city?.name||'your city'}: ${window.location.origin}/?city=${city?.code||''}&src=status`,files:[file]});return 'shared'}catch(e){if(e?.name==='AbortError')return 'cancelled'}
  }
  const url=URL.createObjectURL(pngBlob);
  const a=document.createElement('a');a.href=url;a.download='somali-cup-status.png';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
  return 'downloaded';
}

function Logo(){return <div className="logoLock"><div className="cupMark">🏆</div><div><strong>SOMALI CUP</strong><small>Different cities. One people.</small></div></div>}
function Progress({value}){const v=Math.max(0,Math.min(100,Number(value)||0));return <div className="progressTrack"><span style={{width:`${v}%`}}/></div>}
function CityThumb({city,size='md'}){return <div className={`cityThumb ${size}`} style={{backgroundImage:`linear-gradient(180deg,transparent,rgba(1,8,18,.85)),url("${imgFor(city)}")`}}><span>{flag(city?.country)}</span><b>{city?.code}</b></div>}

export default function App(){
  const [view,setView]=useState('home');
  const [standings,setStandings]=useState(demoStandings);
  const [season,setSeason]=useState({name:'Somali Cup 2027',status:'QUALIFICATION'});
  const [me,setMe]=useState(null);
  const [identityChecked,setIdentityChecked]=useState(false);
  const [showJoin,setShowJoin]=useState(false);
  const [joinCity,setJoinCity]=useState(null);
  const [viralCity,setViralCity]=useState(null);
  const [joinedMoment,setJoinedMoment]=useState(null);
  const [notice,setNotice]=useState('');
  const [matches,setMatches]=useState(demoMatches);
  const [selectedCity,setSelectedCity]=useState(null);
  const [mobileNav,setMobileNav]=useState(false);

  const refresh=async()=>{
    try{const d=await api('/api/qualification');if(d?.standings?.length){setStandings(d.standings);setSeason(d.season||season)}}catch{}
    try{const d=await api('/api/identity/me');setMe(d)}catch{setMe(null)}finally{setIdentityChecked(true)}
    try{const d=await api('/api/matches');if(d?.matches?.length)setMatches(d.matches)}catch{}
  };
  useEffect(()=>{refresh()},[]);
  useEffect(()=>{
    if(!identityChecked||me?.membership)return;
    const code=new URLSearchParams(window.location.search).get('city')?.toUpperCase();
    if(!code){setViralCity(null);return}
    const city=standings.find(c=>c.code===code&&c.is_open);
    if(city)setViralCity(city);
  },[standings,me,identityChecked]);
  const top=standings[0];
  const myCity=useMemo(()=>me?.membership?standings.find(c=>c.code===me.membership.code):null,[me,standings]);
  const total=standings.reduce((a,c)=>a+Number(c.verified_supporters||0),0);
  const requestJoin=(city=null)=>{
    if(me?.membership){setNotice(`You already represent ${me.membership.name} this season.`);setTimeout(()=>setNotice(''),2600);return}
    setJoinCity(city||null);
    setShowJoin(true);
  };
  const joined=(payload)=>{
    localStorage.setItem('somalicup_session',payload.token);
    setMe({user:payload.user,membership:{...payload.city,season_id:payload.season?.id,season_name:payload.season?.name,status:'ACTIVE',verification_status:'VERIFIED'}});
    setIdentityChecked(true);
    setShowJoin(false);
    setJoinCity(null);
    setViralCity(null);
    window.history.replaceState({},'',window.location.pathname);
    setJoinedMoment(payload);
    setNotice(`You're in. You represent ${payload.city.name}.`);
    refresh();
    setTimeout(()=>setNotice(''),2200);
  };
  const openCity=(c)=>{setSelectedCity(c);setView('city');window.scrollTo({top:0,behavior:'smooth'})};
  const leaveViralLanding=()=>{setViralCity(null);window.history.replaceState({},'',window.location.pathname);setView('home')};

  return <div className="appShell">
    <header className="topbar">
      <button className="brandButton" onClick={()=>setView('home')}><Logo/></button>
      <nav className={mobileNav?'nav open':'nav'}>
        {['home','cities','matches'].map(v=><button key={v} className={view===v?'active':''} onClick={()=>{setView(v);setMobileNav(false)}}>{v[0].toUpperCase()+v.slice(1)}</button>)}
        <button className={view==='qualification'?'active':''} onClick={()=>{setView('qualification');setMobileNav(false)}}>Live Table</button>
      </nav>
      <div className="topActions">
        <div className="seasonPill">{season?.name||'Somali Cup'} <ChevronRight size={14}/></div>
        {me?<button className="profilePill" onClick={()=>setView('profile')}><span>{(me.user.nickname||me.user.displayName||'?')[0]}</span><b>{me.user.nickname||me.user.displayName}</b></button>:<button className="miniCta" onClick={requestJoin}>Join</button>}
        <button className="mobileMenu" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button>
      </div>
    </header>

    <main className={viralCity&&!me?.membership?'mainStage viralStage':'mainStage'}>
      {viralCity&&!me?.membership?<ViralCityLanding city={viralCity} standings={standings} onJoin={()=>requestJoin(viralCity)} onOther={leaveViralLanding}/>:<>
        {view==='home'&&<Home standings={standings} top={top} total={total} season={season} myCity={myCity} onJoin={requestJoin} openCity={openCity} goQualification={()=>setView('qualification')} goMatches={()=>setView('matches')}/>}
        {view==='qualification'&&<Qualification standings={standings} season={season} onJoin={requestJoin} openCity={openCity}/>}
        {view==='cities'&&<Cities standings={standings} openCity={openCity} onJoin={requestJoin}/>}
        {view==='city'&&selectedCity&&<CityPage city={standings.find(c=>c.code===selectedCity.code)||selectedCity} me={me} onBack={()=>setView('cities')} onJoin={requestJoin}/>} 
        {view==='matches'&&<MatchCenter matches={matches} me={me} onNeedIdentity={requestJoin}/>}
        {view==='profile'&&<SupporterProfile me={me} city={myCity} season={season} onJoin={requestJoin} onCity={()=>myCity&&openCity(myCity)} onMatches={()=>setView('matches')}/>}
      </>}
    </main>

    {!viralCity&&<nav className="mobileDock">
      <button className={view==='home'?'active':''} onClick={()=>setView('home')}><Trophy size={18}/><span>Home</span></button>
      <button className={view==='qualification'?'active':''} onClick={()=>setView('qualification')}><BarChart3 size={18}/><span>Table</span></button>
      <button className={view==='matches'?'active':''} onClick={()=>setView('matches')}><Radio size={18}/><span>Matches</span></button>
      <button className={view==='cities'?'active':''} onClick={()=>setView('cities')}><MapPin size={18}/><span>Cities</span></button>
      <button className={view==='profile'?'active':''} onClick={()=>me?.membership?setView('profile'):requestJoin()}><Users size={18}/><span>{me?.membership?'Me':'Join'}</span></button>
    </nav>}

    {showJoin&&!me?.membership&&<JoinExperience standings={standings.filter(c=>c.is_open)} initialCity={joinCity} onClose={()=>{setShowJoin(false);setJoinCity(null)}} onJoined={joined}/>}
    {joinedMoment&&<JoinedMoment payload={joinedMoment} city={standings.find(c=>c.code===joinedMoment.city.code)||joinedMoment.city} onDone={()=>{setJoinedMoment(null);setView('profile')}}/>}
    {notice&&<div className="toast"><Check size={16}/>{notice}</div>}
  </div>
}

function ViralCityLanding({city,standings,onJoin,onOther}){
  const need=Math.max(0,Number(city.qualification_target||0)-Number(city.verified_supporters||0));
  const leader=standings[0];
  const gap=leader&&leader.code!==city.code?Math.max(0,Number(leader.verified_supporters||0)-Number(city.verified_supporters||0)):0;
  return <div className="viralLanding">
    <section className="viralLandingHero" style={{backgroundImage:`linear-gradient(180deg,rgba(1,7,16,.2),rgba(1,7,16,.96)),url("${imgFor(city)}")`}}>
      <div className="viralLandingTop"><Logo/><span><i/> LIVE QUALIFICATION</span></div>
      <div className="viralLandingContent">
        <small>SOMEONE FROM {city.name.toUpperCase()} SENT YOU THIS</small>
        <h1>{city.name}<br/><em>needs you.</em></h1>
        <p>Somalia’s cities are competing for Somali Cup 2027. Every verified supporter moves their city closer to qualification.</p>
        <div className="viralLandingNumbers">
          <div><span>CITY RANK</span><strong>#{city.rank}</strong></div>
          <div><span>SUPPORTERS</span><strong>{fmt(city.verified_supporters)}</strong></div>
          <div><span>STILL NEEDED</span><strong>{fmt(need)}</strong></div>
        </div>
        <div className="viralLandingProgress"><div><span>{fmt(city.verified_supporters)} / {fmt(city.qualification_target)}</span><b>{Number(city.progress_pct||0).toFixed(0)}%</b></div><Progress value={city.progress_pct}/></div>
        {gap>0&&<div className="viralUrgency"><Zap size={16}/><span><b>{fmt(gap)} supporters</b> separate {city.name} from #{leader.rank} {leader.name}.</span></div>}
        <button className="viralJoinButton" onClick={onJoin}>I REPRESENT {city.name.toUpperCase()} <ArrowRight size={18}/></button>
        <button className="viralOtherCity" onClick={onOther}>I represent another city</button>
        <div className="viralTrust"><ShieldCheck size={15}/><span>One person. One city. One season.</span></div>
      </div>
    </section>
  </div>
}

function Home({standings,top,total,season,myCity,onJoin,openCity,goQualification,goMatches}){
  const leaders=standings.slice(0,5);
  const remaining=myCity?Math.max(0,Number(myCity.qualification_target||0)-Number(myCity.verified_supporters||0)):0;
  const shareMyCity=()=>myCity&&sharePoster({
    city:myCity,
    title:`I REPRESENT ${myCity.name.toUpperCase()}`,
    subtitle:`${fmt(myCity.verified_supporters)} verified supporters · ${Number(myCity.progress_pct||0).toFixed(0)}% to qualification`,
    footer:`${remaining?fmt(remaining)+' more supporters needed':'Qualification target reached'}`
  });

  return <div className="simpleHome">
    <section className="viralHero" style={{backgroundImage:`linear-gradient(90deg,rgba(1,7,17,.98) 0%,rgba(1,8,18,.78) 44%,rgba(1,8,18,.28) 72%,rgba(1,8,18,.72) 100%),url("${heroImage}")`}}>
      <div className="viralHeroCopy">
        <div className="liveBadge"><span/> QUALIFICATION IS LIVE</div>
        <h1>YOUR CITY.<br/><em>YOUR CUP.</em></h1>
        <p>Somalia’s cities are competing for a place in Somali Cup 2027. Choose one city. Every verified supporter counts.</p>

        {!myCity?<>
          <button className="heroPrimary" onClick={onJoin}>REPRESENT YOUR CITY <ArrowRight size={18}/></button>
          <button className="heroTextLink" onClick={goQualification}>See the live city race <ChevronRight size={15}/></button>
        </>:<>
          <div className="returningCity">
            <div className="returningCityTop"><CityThumb city={myCity} size="md"/><div><small>YOU REPRESENT</small><strong>{myCity.name}</strong><span>#{myCity.rank} in qualification</span></div></div>
            <div className="returningProgress"><div><span>{fmt(myCity.verified_supporters)} / {fmt(myCity.qualification_target)}</span><b>{remaining?fmt(remaining)+' more needed':'TARGET REACHED'}</b></div><Progress value={myCity.progress_pct}/></div>
            <button className="heroPrimary" onClick={shareMyCity}><Share2 size={18}/> SHARE {myCity.name.toUpperCase()}</button>
          </div>
        </>}
      </div>

      <div className="heroRaceCard">
        <div className="heroRaceHead"><span><i/> LIVE CITY RACE</span><button onClick={goQualification}>Full table <ArrowRight size={13}/></button></div>
        {leaders.map(c=><button key={c.code} className="heroRaceRow" onClick={()=>openCity(c)}>
          <span className="heroRank">#{c.rank}</span>
          <CityThumb city={c} size="sm"/>
          <div className="heroRaceName"><b>{c.name}</b><small>{fmt(c.verified_supporters)} supporters</small></div>
          <div className="heroRaceProgress"><strong>{Number(c.progress_pct||0).toFixed(0)}%</strong><Progress value={c.progress_pct}/></div>
        </button>)}
        <div className="heroRaceFooter"><Users size={14}/><span>{fmt(total)} verified supporters across {standings.length} cities</span></div>
      </div>
    </section>

    <section className="firstVisitFlow">
      <div className="flowIntro"><small>HOW IT WORKS</small><h2>Three steps. That’s it.</h2><p>No complicated signup. No points to learn. Pick your city, join it, then bring the next person.</p></div>
      <div className="flowSteps">
        <div><span>01</span><div><b>Choose your city</b><p>Pick the city you want to represent for the season.</p></div></div>
        <div><span>02</span><div><b>Join the race</b><p>Your verified membership adds one real supporter to that city.</p></div></div>
        <div><span>03</span><div><b>Share your city</b><p>Get a ready-made Status poster and help your city bring in the next supporter.</p></div></div>
      </div>
    </section>

    <section className="chooseCityNow">
      <div className="sectionTitle simple"><div><small>CHOOSE YOUR SIDE</small><h3>Which city do you represent?</h3></div></div>
      <div className="quickCityGrid">
        {standings.slice(0,6).map(c=>{
          const need=Math.max(0,Number(c.qualification_target||0)-Number(c.verified_supporters||0));
          return <button key={c.code} onClick={()=>onJoin(c)} className="quickCity">
            <div className="quickCityImage" style={{backgroundImage:`linear-gradient(180deg,rgba(2,8,18,.02),rgba(2,8,18,.92)),url("${imgFor(c)}")`}}>
              <span>#{c.rank}</span>
              <div><b>{c.name}</b><small>{need?fmt(need)+' more needed':'Target reached'}</small></div>
            </div>
            <div className="quickCityBottom"><Progress value={c.progress_pct}/><strong>{Number(c.progress_pct||0).toFixed(0)}%</strong></div>
          </button>
        })}
      </div>
      {!myCity&&<button className="cityJoinPrimary" onClick={onJoin}>CHOOSE MY CITY <ArrowRight size={18}/></button>}
    </section>

    <section className="viralProof">
      <div className="viralProofCopy"><small>WHY PEOPLE SHARE</small><h3>City pride becomes momentum.</h3><p>Every supporter gets a personal Somali Cup identity and a shareable city poster. One person joins, shares, and brings the next.</p></div>
      <div className="viralLoopVisual">
        <div><Users/><span>JOIN</span></div><ArrowRight/><div><Trophy/><span>REPRESENT</span></div><ArrowRight/><div><Share2/><span>SHARE</span></div><ArrowRight/><div><UserPlus/><span>BRING ONE MORE</span></div>
      </div>
    </section>

    <section className="homeMatchTease">
      <div><small>WHEN MATCH DAY ARRIVES</small><h3>The simple join becomes a live city battle.</h3><p>Score once for your city, call your bench and help move the match.</p></div>
      <button className="glassBtn" onClick={goMatches}><Radio size={16}/> See Match Centre</button>
    </section>
  </div>
}

function Qualification({standings,season,onJoin,openCity}){
  return <div className="pageWrap">
    <section className="pageHero compact"><div><div className="liveBadge"><span/> {season?.status}</div><h1>Qualification <em>Leaderboard</em></h1><p>Every verified supporter moves their city closer to the tournament. One real person. One city. One season.</p></div><button className="goldBtn" onClick={onJoin}>Represent Your City <ArrowRight size={17}/></button></section>
    <div className="qualificationGrid">
      <section className="panel fullTable">
        <div className="leaderCols large"><span>#</span><span>City</span><span>Tier</span><span>Verified</span><span>Target</span><span>Progress</span><span>Status</span></div>
        {standings.map(c=><button className="leaderRow large" key={c.code} onClick={()=>openCity(c)}><b>{c.rank}</b><div className="cityInline"><span>{flag(c.country)}</span><div><strong>{c.name}</strong><small>{c.country}</small></div></div><span className="tierTag">{c.tier}</span><strong>{fmt(c.verified_supporters)}</strong><span>{fmt(c.qualification_target)}</span><div className="leaderProgress"><Progress value={c.progress_pct}/><small>{Number(c.progress_pct||0).toFixed(1)}%</small></div><span className="statusTag">{c.status}</span></button>)}
      </section>
      <aside className="integrityCard"><div className="shieldBig">★</div><small>COMPETITION INTEGRITY</small><h3>One city per season.</h3><p>Your supporter identity is locked to one city for the active season. This protects the tournament and keeps every city’s numbers meaningful.</p><ul><li><Check/>Verified membership counts</li><li><Check/>Raw clicks do not count</li><li><Check/>Repeat joins are blocked</li><li><Check/>Admin changes are audited</li></ul></aside>
    </div>
  </div>
}

function Cities({standings,openCity,onJoin}){
  return <div className="pageWrap">
    <section className="pageHero compact"><div><small className="kicker">SOMALIA CITY NETWORK</small><h1>Choose the city that <em>feels like home.</em></h1><p>From Mogadishu to Kismayo, Garowe to Baidoa, every city enters with its own identity, supporters and road to the Cup.</p></div><button className="goldBtn" onClick={onJoin}>Join Your City</button></section>
    <div className="citiesGrid">{standings.map(c=><button className="cityPoster" key={c.code} onClick={()=>openCity(c)} style={{backgroundImage:`linear-gradient(180deg,rgba(2,8,18,.03),rgba(2,8,18,.96)),url("${imgFor(c)}")`}}><span className="rankChip">#{c.rank}</span><div><small>{flag(c.country)} {c.country}</small><h3>{c.name}</h3><p>{fmt(c.verified_supporters)} verified supporters</p><Progress value={c.progress_pct}/><b>{Number(c.progress_pct||0).toFixed(0)}% to target</b></div></button>)}</div>
  </div>
}

function CityPage({city,me,onBack,onJoin}){
  const mine=me?.membership?.code===city.code;
  return <div className="pageWrap">
    <button className="backBtn" onClick={onBack}><ArrowLeft size={15}/> All Cities</button>
    <section className="cityFeature" style={{backgroundImage:`linear-gradient(90deg,rgba(2,8,18,.98),rgba(2,8,18,.52),rgba(2,8,18,.8)),url("${imgFor(city)}")`}}>
      <div><span className="rankChip">#{city.rank} · {city.tier}</span><h1>{city.name}</h1><p>{city.country} · {city.status}</p><div className="cityFeatureStats"><div><strong>{fmt(city.verified_supporters)}</strong><span>Verified supporters</span></div><div><strong>{fmt(city.qualification_target)}</strong><span>Qualification target</span></div><div><strong>{Number(city.progress_pct||0).toFixed(0)}%</strong><span>Progress</span></div></div>{mine?<div className="mineBadge"><Check/> You represent {city.name}</div>:<button className="goldBtn" onClick={()=>onJoin(city)}>Represent {city.name} <ArrowRight size={16}/></button>}</div>
    </section>
    <section className="cityShareBand">
      <div><small>SHARE THE RACE</small><h3>Put {city.name} on your WhatsApp Status.</h3><p>Turn your city’s qualification push into a premium Somali Cup poster.</p></div>
      <button className="goldBtn" onClick={()=>sharePoster({city,title:`I REPRESENT ${city.name.toUpperCase()}`,subtitle:`${fmt(city.verified_supporters)} verified supporters · ${Number(city.progress_pct||0).toFixed(0)}% to target`,footer:`${city.name} is chasing a place in Somali Cup 2027`})}><Share2 size={16}/> Create City Poster</button>
    </section>
  </div>
}

function SupporterProfile({me,city,season,onJoin,onCity,onMatches}){
  const [showStudio,setShowStudio]=useState(false);
  if(!me?.membership||!city)return <div className="pageWrap"><section className="pageHero compact"><div><small className="kicker">SUPPORTER IDENTITY</small><h1>Your Somali Cup <em>story starts here.</em></h1><p>Choose one city for the season and your supporter pass will live here.</p></div><button className="goldBtn" onClick={onJoin}>Choose Your City</button></section></div>;
  const name=me.user.nickname||me.user.displayName;
  const remaining=Math.max(0,Number(city.qualification_target||0)-Number(city.verified_supporters||0));
  const create=(kind)=>{
    const presets={
      identity:{title:`I REPRESENT ${city.name.toUpperCase()}`,subtitle:`${name} · Verified Somali Cup supporter`,footer:'My city. My season. My Cup.'},
      qualification:{title:`${city.name.toUpperCase()} NEEDS ${fmt(remaining)} MORE`,subtitle:`${fmt(city.verified_supporters)} verified supporters · ${Number(city.progress_pct||0).toFixed(0)}% complete`,footer:`Help ${city.name} reach Somali Cup 2027`},
      callup:{title:'CALLING MY CITY',subtitle:`${city.name} supporters — join me in Somali Cup`,footer:'Represent your city at somalicup.com'}
    };
    return sharePoster({city,...presets[kind]});
  };
  return <div className="supporterPage">
    <section className="supporterHero" style={{backgroundImage:`linear-gradient(90deg,rgba(2,8,18,.98),rgba(2,8,18,.58),rgba(2,8,18,.85)),url("${imgFor(city)}")`}}>
      <div className="supporterPass">
        <div className="passTop"><Logo/><span>SEASON PASS · {season?.name||'2027'}</span></div>
        <div className="passIdentity"><div className="passAvatar">{name?.[0]||'S'}</div><div><small>VERIFIED SUPPORTER</small><h1>{name}</h1><p>{city.name} · {city.code}</p></div></div>
        <div className="passCity"><CityThumb city={city} size="lg"/><div><span>YOUR CITY</span><strong>{city.name}</strong><small>Rank #{city.rank} · {city.tier}</small></div></div>
        <div className="passFooter"><span>SC-{String(me.user.publicId||'SUPPORTER').slice(-8).toUpperCase()}</span><b>ONE CITY · ONE SEASON</b></div>
      </div>
      <div className="supporterHeroCopy"><small>YOUR SOMALI CUP IDENTITY</small><h2>You don’t just watch.<br/><em>You represent.</em></h2><p>Your supporter pass follows your city through qualification and into every match.</p><div className="supporterHeroBtns"><button className="goldBtn" onClick={()=>create('qualification')}><Share2 size={16}/> SHARE {city.name.toUpperCase()}</button><button className="heroTextLink light" onClick={onMatches}><Radio size={15}/> Go to Match Centre</button></div></div>
    </section>

    <section className="supporterDashboard">
      <div className="supporterStat"><span>City rank</span><strong>#{city.rank}</strong><small>{city.name}</small></div>
      <div className="supporterStat"><span>Verified supporters</span><strong>{fmt(city.verified_supporters)}</strong><small>{fmt(remaining)} still needed</small></div>
      <div className="supporterStat"><span>Qualification</span><strong>{Number(city.progress_pct||0).toFixed(0)}%</strong><Progress value={city.progress_pct}/></div>
      <div className="supporterStat highlight"><span>Your status</span><strong>ACTIVE</strong><small>Verified city member</small></div>
    </section>

    <section className="shareChoice">
      <div><small>YOUR NEXT MOVE</small><h3>Help {city.name} bring the next supporter.</h3><p>Your qualification poster already shows the live city progress. Share it first. Use the studio only when you want another format.</p></div>
      <div className="shareChoiceActions"><button className="goldBtn" onClick={()=>create('qualification')}><Share2 size={16}/> Share City Now</button><button className="glassBtn" onClick={()=>setShowStudio(v=>!v)}>{showStudio?'Hide Poster Studio':'More Poster Options'}</button></div>
    </section>
    {showStudio&&<>    <section className="shareStudio">
      <div className="shareStudioHead"><div><small>SHARE STUDIO</small><h3>Make your city impossible to ignore.</h3><p>Built for WhatsApp Status, group chats and social sharing.</p></div><Share2 size={28}/></div>
      <div className="shareCards">
        <button onClick={()=>create('identity')}><div className="sharePreview identity"><span>SOMALI CUP</span><strong>I REPRESENT<br/>{city.name.toUpperCase()}</strong><small>{name}</small></div><b>Supporter Pass</b><small>Show your city identity</small></button>
        <button onClick={()=>create('qualification')}><div className="sharePreview qualification"><span>QUALIFICATION</span><strong>{fmt(remaining)}<br/>MORE NEEDED</strong><small>{city.name}</small></div><b>Qualification Push</b><small>Call your city to action</small></button>
        <button onClick={()=>create('callup')}><div className="sharePreview callup"><span>CALL-UP</span><strong>MY CITY<br/>NEEDS YOU</strong><small>{city.name} · 2027</small></div><b>City Call-Up</b><small>Bring people into the movement</small></button>
      </div>
    </section></>}
    <section className="profileActions"><button className="glassBtn" onClick={onCity}><MapPin size={15}/> Open {city.name}</button><button className="goldBtn" onClick={()=>create('qualification')}><Share2 size={15}/> Share Qualification Poster</button></section>
  </div>
}

function MatchCenter({matches,me,onNeedIdentity}){
  const [selected,setSelected]=useState(matches[0]||null);
  const [live,setLive]=useState(null);
  const [mine,setMine]=useState(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [benchPulse,setBenchPulse]=useState(0);
  const [showMatchDepth,setShowMatchDepth]=useState(false);
  const load=async(match=selected)=>{if(!match)return;try{setLive(await api(`/api/matches/${match.publicId}/live`))}catch{setLive({match,counts:{homeActive:0,awayActive:0,registered:0,total:0},activity:[]})}if(me){try{const d=await api(`/api/matches/${match.publicId}/me`);setMine(d.participation)}catch{setMine(null)}}else setMine(null)};
  useEffect(()=>{if(!selected&&matches[0])setSelected(matches[0])},[matches,selected]);
  useEffect(()=>{load()},[selected?.publicId,Boolean(me)]);
  const match=live?.match||selected;
  if(!match)return <div className="pageWrap"><section className="pageHero compact"><h1>No fixtures yet.</h1></section></div>;
  const home=match.home||{code:match.home_code,name:match.home_name,country:'Somalia',score:match.home_score||0};
  const away=match.away||{code:match.away_code,name:match.away_name,country:'Somalia',score:match.away_score||0};
  const homeScore=Number(home.score||0),awayScore=Number(away.score||0);
  const leader=homeScore===awayScore?null:(homeScore>awayScore?home:away);
  const trailing=homeScore===awayScore?null:(homeScore>awayScore?away:home);
  const leadMargin=Math.abs(homeScore-awayScore);
  const benchFilled=Math.min(3,Number(mine?.assists??mine?.direct_joins??0));
  const commentary=(live?.activity||[]).slice(0,5);
  const join=async()=>{if(!me){onNeedIdentity();return}setBusy(true);setMsg('');try{const inviteToken=new URLSearchParams(window.location.search).get('invite')||'';const d=await api(`/api/matches/${match.publicId}/join`,{method:'POST',body:JSON.stringify({inviteToken})});setMine(d.participation);setMsg(d.created?'Place reserved.':'You are already registered.');await load(match)}catch(e){setMsg(e.message.replaceAll('_',' '))}finally{setBusy(false)}};
  const activate=async()=>{setBusy(true);setMsg('');try{const d=await api(`/api/matches/${match.publicId}/activate`,{method:'POST',body:'{}'});setMsg(d.goalAdded?'GOAL — your verified entry moved the score.':'Your goal is already counted.');await load(match)}catch(e){setMsg(e.message.replaceAll('_',' '))}finally{setBusy(false)}};
  const copyLink=async()=>{const token=mine?.share_token||mine?.shareToken;if(!token)return;const url=`${window.location.origin}/?match=${match.publicId}&invite=${token}`;try{await navigator.clipboard.writeText(url);setBenchPulse(v=>v+1);setMsg('Bench link copied — bring your people into the match.')}catch{setMsg(url)}};
  const myMatchCity=me?.membership?.code===home.code?home:me?.membership?.code===away.code?away:null;
  const shareMoment=async(type)=>{
    const city=myMatchCity||leader||home;
    const presets={
      callup:{eyebrow:'MATCH CALL-UP',title:`${city.name.toUpperCase()} NEEDS YOU`,subtitle:`${home.name} ${homeScore} — ${awayScore} ${away.name}`,footer:'Join my city in the Somali Cup match'},
      goal:{eyebrow:'GOAL · VERIFIED',title:'I SCORED FOR MY CITY',subtitle:`${city.name} · Somali Cup 2027`,footer:'One verified supporter. One goal.'},
      assist:{eyebrow:'ASSIST · VERIFIED',title:'I BROUGHT MY PEOPLE',subtitle:`${mine?.assists??mine?.direct_joins??0} assists · ${mine?.downstream_joins??0} branch impact`,footer:`${city.name} is stronger together`},
      fulltime:{eyebrow:'FULL TIME',title:`${(match.winner?.name||leader?.name||city.name).toUpperCase()}`,subtitle:`${home.code} ${homeScore} — ${awayScore} ${away.code}`,footer:'Somali Cup · The city story continues'},
      motm:{eyebrow:'MAN OF THE MATCH',title:'THE IMPACT RACE',subtitle:`${mine?.assists??mine?.direct_joins??0} assists · ${mine?.downstream_joins??0} branch`,footer:'Verified impact. Real supporters.'}
    };
    try{await sharePoster({city,...presets[type]});setMsg('Your Somali Cup poster is ready.')}catch{setMsg('Could not create poster on this device.')}
  };

  return <div className="matchExperience">
    <section className="broadcastHero">
      <div className="matchSide homeSide" style={{backgroundImage:`linear-gradient(90deg,rgba(0,15,30,.3),rgba(1,8,18,.92)),url("${imgFor(home)}")`}}><CityThumb city={home} size="lg"/><h2>{home.name}</h2><small>MOGADISHU</small></div>
      <div className="scoreBoard"><div className="liveBadge red"><span/> {match.status}</div><small>{match.roundCode||match.round_code}</small><strong>{fmt(home.score)} <em>–</em> {fmt(away.score)}</strong><span className="matchClock">62:18</span></div>
      <div className="matchSide awaySide" style={{backgroundImage:`linear-gradient(270deg,rgba(0,15,30,.3),rgba(1,8,18,.92)),url("${imgFor(away)}")`}}><CityThumb city={away} size="lg"/><h2>{away.name}</h2><small>HARGEISA</small></div>
    </section>
    <section className="supportMeter"><div><b>58%</b><span>{fmt(live?.counts?.homeActive||0)} supporters</span></div><div className="meterTrack"><i/><em/></div><div><b>42%</b><span>{fmt(live?.counts?.awayActive||0)} supporters</span></div></section>

    <section className="matchNextAction">
      <div className="nextActionCopy">
        <small>YOUR NEXT MOVE</small>
        {!me?<><h3>Choose your city first.</h3><p>Your city identity decides which side you can represent in Somali Cup.</p></>:
        !myMatchCity?<><h3>Watch this rivalry.</h3><p>Your city is not playing in this fixture, so there is nothing you need to do here.</p></>:
        !mine?<><h3>Join {myMatchCity.name} in this match.</h3><p>Reserve your place. When the match goes live, one verified entry adds one goal.</p></>:
        mine.status==='REGISTERED'&&match.status==='LIVE'?<><h3>Enter now. Score once.</h3><p>Your verified entry will add exactly one goal for {myMatchCity.name}.</p></>:
        mine.status==='REGISTERED'?<><h3>Your place is reserved.</h3><p>Use your personal link to bring your city into the lobby before kickoff.</p></>:
        match.status==='FINAL'?<><h3>Full time. Share the result.</h3><p>Turn the finish into the next Somali Cup moment.</p></>:
        <><h3>Your goal is counted. Call the bench.</h3><p>Bring up to three verified supporters from {myMatchCity.name}. Each person scores only for themselves.</p></>}
      </div>
      <div className="nextActionButton">
        {!me?<button className="goldBtn" onClick={onNeedIdentity}>CHOOSE MY CITY <ArrowRight size={16}/></button>:
        !myMatchCity?<button className="glassBtn" onClick={()=>setShowMatchDepth(v=>!v)}>{showMatchDepth?'Hide Match Detail':'Watch Match Detail'}</button>:
        !mine?<button className="goldBtn" disabled={busy} onClick={join}>{busy?'Joining…':'JOIN THIS MATCH'} <ArrowRight size={16}/></button>:
        mine.status==='REGISTERED'&&match.status==='LIVE'?<button className="goldBtn" disabled={busy} onClick={activate}>{busy?'Entering…':'ENTER & SCORE'} <Play size={16}/></button>:
        mine.status==='REGISTERED'?<button className="goldBtn" onClick={copyLink}><Share2 size={16}/> CALL MY CITY</button>:
        match.status==='FINAL'?<button className="goldBtn" onClick={()=>shareMoment('fulltime')}><Share2 size={16}/> SHARE RESULT</button>:
        <button className="goldBtn" onClick={copyLink}><UserPlus size={16}/> CALL THE BENCH</button>}
      </div>
    </section>

    <div className="matchDepthToggle"><button onClick={()=>setShowMatchDepth(v=>!v)}>{showMatchDepth?'Hide live detail':'See live match detail'} <ChevronRight size={14}/></button></div>
    {(showMatchDepth||mine?.status==='ACTIVE'||match.status==='FINAL')&&<>
    <section className={"matchNarrative "+(leader?'hasLeader':'level')}>
      <div className="narrativeState">
        <span className="statePulse"/>
        <small>{leader?'MATCH STATE':'MATCH STATE'}</small>
        <h3>{leader?`${leader.name} lead by ${leadMargin}`:'Level match — next goal changes everything'}</h3>
        <p>{leader?`${trailing.name} need a response. Every verified supporter can still move this match.`:'The pressure is balanced. One verified supporter can break the deadlock.'}</p>
      </div>
      <div className="pressureBattle">
        <div className="pressureCity home"><span>{home.code}</span><b>{homeScore}</b><i style={{height:`${Math.min(100,42+homeScore*7)}%`}}/></div>
        <div className="pressureCore"><Zap size={17}/><strong>FAN PRESSURE</strong><small>Live supporter momentum</small></div>
        <div className="pressureCity away"><span>{away.code}</span><b>{awayScore}</b><i style={{height:`${Math.min(100,42+awayScore*7)}%`}}/></div>
      </div>
      <div className="nextMoment">
        <small>NEXT MOMENT</small>
        <strong>{leader?`${trailing.name} comeback window`:'First breakthrough'}</strong>
        <span>Call the bench · share · score</span>
      </div>
    </section>

    <div className="matchTabs"><button className="active"><Radio size={15}/> Live</button><button><Clock3 size={15}/> Timeline</button><button><BarChart3 size={15}/> Stats</button><button><Users size={15}/> Lineups</button><button><Heart size={15}/> Fan Activity</button></div>

    <section className="stadiumRibbon">
      <div><span className="ribbonDot live"/><b>LIVE STADIUM</b><small>{fmt(live?.counts?.total||0)} inside the match</small></div>
      <div><span className="ribbonDot cyan"/><b>{fmt(live?.counts?.registered||0)}</b><small>waiting to enter</small></div>
      <div><span className="ribbonDot gold"/><b>{fmt((live?.counts?.homeActive||0)+(live?.counts?.awayActive||0))}</b><small>active supporters</small></div>
      <div><span className="ribbonDot green"/><b>{match.scoreVersion||0}</b><small>verified score events</small></div>
    </section>

    <section className="matchContentGrid">
      <div className="panel momentumPanel"><div className="panelHead"><div><small>LIVE PRESSURE</small><h3>Match Momentum</h3></div><Sparkles/></div><div className="momentumChart"><svg viewBox="0 0 600 210" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#23c9ff" stopOpacity=".5"/><stop offset="100%" stopColor="#23c9ff" stopOpacity="0"/></linearGradient></defs><path d="M0 160 C45 140 55 95 95 122 S150 92 180 115 S230 60 265 95 S330 145 355 115 S410 55 450 90 S515 62 600 80 L600 210 L0 210Z" fill="url(#area)"/><path d="M0 160 C45 140 55 95 95 122 S150 92 180 115 S230 60 265 95 S330 145 355 115 S410 55 450 90 S515 62 600 80" fill="none" stroke="#23c9ff" strokeWidth="5"/></svg><span className="eventDot d1">⚽</span><span className="eventDot d2">⚡</span><span className="eventDot d3">⚽</span></div></div>
      <div className="panel activityPanel"><div className="panelHead"><div><small>RIGHT NOW</small><h3>Live Fan Activity</h3></div><span className="activityFilter">All Activity</span></div><div className="activityFeed">{['Ayaan M. · Mogadishu','Ubah M. · Hargeisa','Yusuf H. · Kismayo','Fadumo S. · Garowe'].map((n,i)=><div key={n}><span className="feedAvatar">{n[0]}</span><div><b>{n}</b><small>{i===0?'Mogadishu is pushing! 🔥':i===1?'Hargeisa responds! 💛':'City pride is building. 🇸🇴'}</small></div><strong>♥ {142-i*27}</strong></div>)}</div></div>
    </section>

    <section className="benchAndCommentary">
      <div className="callBenchCard">
        <div className="benchHead"><div><small>CALL THE BENCH</small><h3>Bring 3 people into your squad.</h3></div><UserPlus size={22}/></div>
        <p>Your personal match link is your bench. When verified supporters from your city enter through it, your assists grow — the city score still counts each person only once.</p>
        <div className="benchSlots">
          {[0,1,2].map(i=><div key={i} className={i<benchFilled?'filled':''}>{i<benchFilled?<><Check size={17}/><span>IN</span></>:<><UserPlus size={17}/><span>OPEN</span></>}</div>)}
        </div>
        <div className="benchFooter"><div><b>{benchFilled}/3</b><span>bench called</span></div>{mine?<button className="goldBtn" onClick={copyLink}><Share2 size={15}/> Call the Bench</button>:<button className="glassBtn" onClick={onNeedIdentity}>Join your city first</button>}</div>
        {benchPulse>0&&<small className="benchHint">Link ready. Share it on WhatsApp or WhatsApp Status.</small>}
      </div>

      <div className="commentaryCard">
        <div className="benchHead"><div><small>LIVE COMMENTARY</small><h3>What’s happening now.</h3></div><Radio size={21}/></div>
        <div className="commentaryFeed">
          {commentary.length?commentary.map((a,i)=><div key={a.id||i}><span className="commentMinute">{Math.max(1,62-i*4)}′</span><i className={a.city_code===home.code?'home':'away'}/><p><b>{a.city_name||a.city_code}</b> · {(a.nickname||a.display_name||'Supporter')} {a.type==='GOAL'?'entered and scored a verified goal.':a.type==='ASSIST'?'created an assist.':'moved the match.'}</p></div>):<>
            <div><span className="commentMinute">62′</span><i className="home"/><p><b>{home.name}</b> supporters are pushing the pressure line.</p></div>
            <div><span className="commentMinute">58′</span><i className="away"/><p><b>{away.name}</b> bench activity is building.</p></div>
            <div><span className="commentMinute">HT</span><i/><p>Second-half supporter window is open.</p></div>
          </>}
        </div>
      </div>

      <div className="motmCard">
        <div className="motmHalo"><Trophy size={30}/></div>
        <small>MAN OF THE MATCH</small>
        <h3>{match.status==='FINAL'?'Award ready':'Race still open'}</h3>
        <p>Verified branch impact decides who created the strongest supporter chain — not raw link sends.</p>
        <div className="motmStats"><div><b>{mine?.assists??mine?.direct_joins??0}</b><span>Your assists</span></div><div><b>{mine?.downstream_joins??0}</b><span>Your branch</span></div></div>
        <span className="motmLock"><LockKeyhole size={14}/>{match.status==='FINAL'?'Full-time award can now be confirmed':'Unlocks at full time'}</span>
      </div>
    </section>

        <section className="matchActionGrid">
      <div className="actionPanel"><small>SUPPORT YOUR CITY</small><h3>Every supporter moves the match.</h3>{!me?<button className="blueBtn" onClick={onNeedIdentity}>Create supporter identity</button>:!mine?<button className="blueBtn" disabled={busy} onClick={join}>Join this match</button>:mine.status==='REGISTERED'&&match.status==='LIVE'?<button className="goldBtn" disabled={busy} onClick={activate}><Play size={16}/> Enter Live & Score</button>:<div className="activeState"><Check/> You're active in this match</div>}</div>
      <div className="actionPanel"><small>YOUR MATCH LINK</small><h3>Bring your people into the stadium.</h3><div className="shareFake">{mine?'somalicup.com/your-match-link':'Join the match to unlock your link'}<Link2 size={15}/></div>{mine&&<button className="glassBtn" onClick={copyLink}><Share2 size={15}/> Copy Personal Link</button>}</div>
      <div className="actionPanel impactPoints"><small>CONTRIBUTE TO IMPACT</small><div><span>⚽</span><b>Goal</b><strong>+500</strong></div><div><span>🟢</span><b>Assist</b><strong>+250</strong></div><div><span>🤝</span><b>Branch</b><strong>+100</strong></div></div>
      <div className="actionPanel shareMoments"><small>SHARE THE MOMENT</small><h3>Turn your match into a Status.</h3><div className="momentButtons"><button onClick={()=>shareMoment('callup')}><Share2 size={14}/> Call-Up</button>{mine?.status==='ACTIVE'&&<button onClick={()=>shareMoment('goal')}>⚽ Goal</button>}{Number(mine?.assists??mine?.direct_joins??0)>0&&<button onClick={()=>shareMoment('assist')}>🟢 Assist</button>}<button onClick={()=>shareMoment('motm')}><Trophy size={14}/> Impact</button></div></div>
    </section>
    </>}

    {match.status==='FINAL'&&<section className="fullTimeStage">
      <div className="fullTimeGlow"/>
      <Trophy size={44}/>
      <small>FULL TIME · SOMALI CUP</small>
      <h2>{match.winner?.name||leader?.name||'Match complete'}</h2>
      <p>{match.winner?'Advance to the next stage. The city story continues.':'Full-time result recorded.'}</p>
      <div className="fullTimeScore"><span>{home.code}</span><b>{homeScore} — {awayScore}</b><span>{away.code}</span></div>
      <button className="goldBtn" onClick={()=>shareMoment('fulltime')}><Share2 size={16}/> Share Full-Time Result</button>
    </section>}
    {msg&&<div className="matchMsg">{msg}</div>}
  </div>
}

function JoinedMoment({payload,city,onDone}){
  const [sharing,setSharing]=useState(false);
  const supporters=Number(city.verified_supporters||0);
  const target=Number(city.qualification_target||500);
  const remaining=Math.max(0,target-supporters);
  const share=async()=>{
    setSharing(true);
    try{
      await sharePoster({
        city,
        eyebrow:'I’M IN · SOMALI CUP 2027',
        title:`I REPRESENT ${city.name.toUpperCase()}`,
        subtitle:`${supporters?fmt(supporters)+' verified supporters':'My support now counts'}`,
        footer:remaining?`${fmt(remaining)} more supporters needed — join ${city.name}`:`${city.name} reached its target`
      });
    }finally{setSharing(false)}
  };
  return <div className="joinedMomentOverlay">
    <section className="joinedMomentCard">
      <div className="joinedBurst">★</div>
      <small>YOU’RE IN</small>
      <h2>You represent<br/><em>{city.name}.</em></h2>
      <p>Your support now counts in the Somali Cup qualification race.</p>
      <div className="joinedCityStrip"><CityThumb city={city} size="lg"/><div><span>YOUR CITY</span><strong>{city.name}</strong><small>{remaining?fmt(remaining)+' more needed to reach the target':'Qualification target reached'}</small></div></div>
      <div className="joinedShareReason"><Share2 size={18}/><div><b>Now bring one more person.</b><span>Your ready-made Status poster carries {city.name} into the next conversation.</span></div></div>
      <button className="joinedPrimary" disabled={sharing} onClick={share}>{sharing?'CREATING POSTER…':`SHARE ${city.name.toUpperCase()}`} <Share2 size={17}/></button>
      <button className="joinedSecondary" onClick={onDone}>Go to my supporter pass</button>
    </section>
  </div>
}

function JoinExperience({standings,initialCity,onClose,onJoined}){
  const [step,setStep]=useState(initialCity?2:1);
  const [city,setCity]=useState(initialCity||null);
  const [displayName,setDisplayName]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const submit=async()=>{
    setBusy(true);setError('');
    try{
      const payload=await api('/api/identity/join',{method:'POST',body:JSON.stringify({displayName,nickname:'',email:'',cityCode:city.code})});
      onJoined(payload);
    }catch(e){setError(e.message.replaceAll('_',' '))}
    finally{setBusy(false)}
  };

  return <div className="joinOverlay simplifiedJoin">
    <div className="joinBackdrop" style={{backgroundImage:`linear-gradient(90deg,rgba(1,7,17,.12),rgba(1,7,17,.95)),url("${imgFor(city||standings[0])}")`}}/>
    <section className="joinPanel">
      <button className="closeBtn" onClick={onClose}><X/></button>
      <Logo/>
      <div className="simpleJoinProgress"><span className={step>=1?'active':''}>1</span><i/><span className={step>=2?'active':''}>2</span><b>{step===1?'Choose your city':'Join your city'}</b></div>

      {step===1&&<>
        <div className="joinTitle"><small>STEP 1 OF 2</small><h2>Which city is yours?</h2><p>Choose once for the season. Every verified supporter counts.</p></div>
        <div className="simpleCityPicker">
          {standings.map(c=><button key={c.code} className={city?.code===c.code?'selected':''} onClick={()=>setCity(c)}>
            <CityThumb city={c} size="sm"/>
            <div><b>{c.name}</b><small>{fmt(c.verified_supporters)} supporters</small></div>
            <strong>{Number(c.progress_pct||0).toFixed(0)}%</strong>
            {city?.code===c.code&&<i><Check size={13}/></i>}
          </button>)}
        </div>
        <button className="goldBtn full" disabled={!city} onClick={()=>setStep(2)}>CONTINUE WITH {city?.name?.toUpperCase()||'CITY'} <ArrowRight size={16}/></button>
      </>}

      {step===2&&<>
        <div className="joinTitle"><small>STEP 2 OF 2</small><h2>Join {city.name}.</h2><p>Add the name people should recognise. Then you’re in.</p></div>
        <div className="joinSelectedCity"><CityThumb city={city} size="lg"/><div><small>YOU ARE JOINING</small><h3>{city.name}</h3><span>{fmt(Math.max(0,Number(city.qualification_target||0)-Number(city.verified_supporters||0)))} more supporters needed</span></div></div>
        <label className="singleNameField">Your name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoFocus placeholder="Your name"/></label>
        <div className="joinPromise"><ShieldCheck/><span>One city. One season. Your membership counts once.</span></div>
        {error&&<div className="errorBox">{error}</div>}
        <div className="joinFooterBtns"><button className="glassBtn" onClick={()=>setStep(1)}>Back</button><button className="goldBtn" disabled={busy||displayName.trim().length<2} onClick={submit}>{busy?'Joining…':`JOIN ${city.name.toUpperCase()}`} <ArrowRight size={16}/></button></div>
        <small className="postJoinPromise">Next: get your supporter pass and share your city.</small>
      </>}
    </section>
  </div>
}
