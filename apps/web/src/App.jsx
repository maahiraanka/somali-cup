import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowLeft,ArrowRight,BarChart3,Check,ChevronRight,Globe2,Link2,LockKeyhole,MapPin,Menu,Play,Radio,Search,Share2,ShieldCheck,Sparkles,Trophy,UserPlus,Users,X,Zap} from 'lucide-react';

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

const flag=(country)=>({Australia:'🇦🇺','United Kingdom':'🇬🇧',Canada:'🇨🇦',Kenya:'🇰🇪','United States':'🇺🇸',Somalia:'🇸🇴',Sweden:'🇸🇪',Norway:'🇳🇴','United Arab Emirates':'🇦🇪'})[country]||'🌍';
const fmt=n=>Number(n||0).toLocaleString();
const matchStatusPollDelay=status=>status==='LIVE'?8000:status==='LOBBY'?15000:30000;
function api(path,opts={}){
  const token=localStorage.getItem('somalicup_session');
  const headers={'Content-Type':'application/json',...(opts.headers||{})};
  if(token)headers.Authorization=`Bearer ${token}`;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  return fetch(path,{...opts,headers,signal:controller.signal})
    .then(async r=>{
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw Object.assign(new Error(body.error||'request_failed'),{status:r.status,body});
      return body;
    })
    .catch(e=>{
      if(e?.name==='AbortError')throw Object.assign(new Error('request_timeout'),{status:408});
      throw e;
    })
    .finally(()=>clearTimeout(timeout));
}
function humanError(e,fallback='Something went wrong. Please try again.'){
  const code=String(e?.body?.error||e?.message||'');
  const map={
    request_timeout:'The connection took too long. Try again.',
    request_failed:'We could not reach Somali Cup. Try again.',
    match_not_found:'This match is no longer available.',
    match_not_live:'This match is not live yet.',
    match_not_open:'This match has not opened yet.',
    invite_not_found:'That match invite is no longer valid.',
    invite_not_found_or_revoked:'That match invite is no longer valid.',
    invite_revoked:'That match invite is no longer valid.',
    participation_not_found:'Reserve your place before entering the match.',
    not_registered:'Reserve your place before entering the match.',
    already_active:'Your Goal is already counted.',
    city_not_open:'That city is not open for joining right now.',
    qualification_not_open:'Qualification is not open right now.',
    device_already_registered:'This device already has a Somali Cup identity for this season.',
    invalid_admin_session:'Your admin session expired. Sign in again.'
  };
  return map[code]||fallback;
}
function analyticsId(){
  let id=localStorage.getItem('somalicup_anon');
  if(!id){id=crypto.randomUUID?.()||('sc-'+Date.now()+'-'+Math.random().toString(36).slice(2));localStorage.setItem('somalicup_anon',id)}
  return id;
}
function deviceKey(){
  let key=localStorage.getItem('somalicup_device');
  if(!key){
    key=crypto.randomUUID?.()||('device-'+Date.now()+'-'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2));
    localStorage.setItem('somalicup_device',key);
  }
  return key;
}
function trackEvent(eventName,{cityCode='',matchPublicId='',source='',metadata={}}={}){
  const token=localStorage.getItem('somalicup_session');
  fetch('/api/analytics/event',{
    method:'POST',keepalive:true,
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify({eventName,anonymousId:analyticsId(),cityCode,matchPublicId,source,metadata})
  }).catch(()=>{});
}

const imgFor=c=>cityImages[c?.code]||heroImage;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
async function sharePoster({city,title,subtitle,eyebrow='SOMALI CUP 2027',footer='Different cities. One people.',accent='#ffcf4a',fromName='',refPublicId=''}){
  const titleSize=String(title||'').length>24?58:String(title||'').length>18?68:82;
  const subtitleSize=String(subtitle||'').length>44?28:String(subtitle||'').length>30?32:38;
  const footerSize=String(footer||'').length>46?30:String(footer||'').length>34?36:46;
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
    <text x="72" y="520" fill="#fff" font-family="Arial,sans-serif" font-size="${titleSize}" font-weight="900" filter="url(#shadow)">${esc(title)}</text>
    <text x="72" y="610" fill="#a9bfd2" font-family="Arial,sans-serif" font-size="${subtitleSize}" font-weight="600">${esc(subtitle)}</text>
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
    <text x="72" y="1480" fill="#fff" font-family="Arial,sans-serif" font-size="${footerSize}" font-weight="800">${esc(footer)}</text>
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
  const fromParam=fromName?`&from=${encodeURIComponent(fromName)}`:'';
  const refParam=refPublicId?`&ref=${encodeURIComponent(refPublicId)}`:'';
  const previewBase=window.location.pathname.startsWith('/preview')?'/preview':'';
  const viralUrl=`${window.location.origin}${previewBase}/?city=${encodeURIComponent(city?.code||'')}&src=status${fromParam}${refParam}`;
  const lead=fromName?`${fromName} is backing ${city?.name}.\n`:'';
  const shareText=`${lead}${subtitle}\nJoin ${city?.name||'your city'}: ${viralUrl}`;
  if(navigator.share&&navigator.canShare?.({files:[file]})){
    try{
      await navigator.share({title:'Somali Cup',text:shareText,files:[file]});
      trackEvent('SHARE_COMPLETED',{cityCode:city?.code||'',source:'native_share',metadata:{outcome:'shared'}});
      return 'shared'
    }catch(e){if(e?.name==='AbortError')return 'cancelled'}
  }
  let linkCopied=false;
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(viralUrl);
      linkCopied=true;
    }
  }catch{}
  const url=URL.createObjectURL(pngBlob);
  const a=document.createElement('a');a.href=url;a.download='somali-cup-status.png';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
  const outcome=linkCopied?'downloaded_link_copied':'downloaded';
  trackEvent('SHARE_COMPLETED',{cityCode:city?.code||'',source:'poster_fallback',metadata:{outcome}});
  return outcome;
}

const shareResultMessage=result=>({
  shared:'Shared successfully.',
  downloaded_link_copied:'Poster saved · invite link copied.',
  downloaded:'Poster saved. Copy your invite link before posting it.',
  cancelled:'Share cancelled.'
})[result]||'Share ready.';

function Logo(){return <div className="logoLock"><div className="cupMark">🏆</div><div><strong>SOMALI CUP</strong><small>Different cities. One people.</small></div></div>}
function useReducedMotion(){
  const [reduced,setReduced]=useState(()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const mq=window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if(!mq)return;
    const onChange=()=>setReduced(mq.matches);
    mq.addEventListener?.('change',onChange);
    return()=>mq.removeEventListener?.('change',onChange);
  },[]);
  return reduced;
}
function MotionNumber({value,duration=650,suffix='',prefix='',className=''}) {
  const target=Number(value||0);
  const reduced=useReducedMotion();
  const [shown,setShown]=useState(reduced?target:0);
  const prev=useRef(reduced?target:0);
  useEffect(()=>{
    if(reduced){setShown(target);prev.current=target;return}
    const start=prev.current;
    const delta=target-start;
    if(!delta){setShown(target);return}
    const begin=performance.now();
    let frame;
    const tick=now=>{
      const t=Math.min(1,(now-begin)/duration);
      const eased=1-Math.pow(1-t,3);
      const next=start+delta*eased;
      setShown(next);
      if(t<1)frame=requestAnimationFrame(tick);
      else prev.current=target;
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[target,duration,reduced]);
  const decimals=Number.isInteger(target)?0:1;
  return <span className={`motionNumber ${className}`}>{prefix}{Number(shown).toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals})}{suffix}</span>
}
function AmbientMotion(){
  return <div className="ambientMotion" aria-hidden="true"><i/><i/><i/><span/><span/></div>
}
function CelebrationParticles({tone='gold',fireworks=false}){
  return <div className={`celebrationParticles ${tone} ${fireworks?'fireworks':''}`} aria-hidden="true">
    {Array.from({length:fireworks?18:10},(_,i)=><i key={i} style={{'--i':i}}/> )}
  </div>
}
function Progress({value}){const v=Math.max(0,Math.min(100,Number(value)||0));return <div className="progressTrack"><span className="motionProgress" style={{width:`${v}%`}}/></div>}
function CityThumb({city,size='md'}){return <div className={`cityThumb ${size}`} style={{backgroundImage:`linear-gradient(180deg,transparent,rgba(1,8,18,.85)),url("${imgFor(city)}")`}}><span>{flag(city?.country)}</span><b>{city?.code}</b></div>}

export default function App(){
  const [view,setView]=useState('home');
  const [standings,setStandings]=useState([]);
  const [season,setSeason]=useState({name:'Somali Cup 2027',status:null});
  const [qualificationError,setQualificationError]=useState(false);
  const [matchesError,setMatchesError]=useState(false);
  const [initialLoading,setInitialLoading]=useState(true);
  const [me,setMe]=useState(null);
  const [identityChecked,setIdentityChecked]=useState(false);
  const [showJoin,setShowJoin]=useState(false);
  const [joinCity,setJoinCity]=useState(null);
  const [viralCity,setViralCity]=useState(null);
  const [viralMatch,setViralMatch]=useState(null);
  const [viralMatchError,setViralMatchError]=useState('');
  const [joinedMoment,setJoinedMoment]=useState(null);
  const [assistMoment,setAssistMoment]=useState(null);
  const [notice,setNotice]=useState('');
  const [inviteBusy,setInviteBusy]=useState(false);
  const [matches,setMatches]=useState([]);
  const [tournament,setTournament]=useState({season:null,stages:[]});
  const [tournamentError,setTournamentError]=useState(false);
  const [selectedCity,setSelectedCity]=useState(null);
  const [mobileNav,setMobileNav]=useState(false);

  const refresh=async()=>{
    try{
      const d=await api('/api/qualification');
      setStandings(Array.isArray(d?.standings)?d.standings:[]);
      if(d?.season)setSeason(d.season);
      setQualificationError(false);
    }catch{
      setQualificationError(true);
    }
    try{
      let d;
      try{
        d=await api('/api/identity/me');
      }catch(firstError){
        if(firstError?.status===401){
          try{
            const recovered=await api('/api/identity/recover-device',{method:'POST',body:JSON.stringify({deviceKey:deviceKey()})});
            if(recovered?.token){
              localStorage.setItem('somalicup_session',recovered.token);
              d=await api('/api/identity/me');
            }else throw firstError;
          }catch{throw firstError}
        }else throw firstError;
      }
      const latest=d?.qualificationImpact?.latestAssist;
      const publicId=d?.user?.publicId;
      if(publicId){
        const key=`somalicup_last_assist_${publicId}`;
        const rawSeen=localStorage.getItem(key);
        if(latest?.id){
          if(rawSeen!==null&&Number(latest.id)>Number(rawSeen))setAssistMoment({latest,impact:d.qualificationImpact,membership:d.membership,user:d.user});
          localStorage.setItem(key,String(latest.id));
        }else if(rawSeen===null){
          localStorage.setItem(key,'0');
        }
      }
      setMe(d)
    }catch{setMe(null)}finally{setIdentityChecked(true)}
    try{
      const d=await api('/api/matches');
      setMatches(Array.isArray(d?.matches)?d.matches:[]);
      setMatchesError(false);
    }catch{
      setMatchesError(true);
    }
    try{
      const d=await api('/api/tournament');
      setTournament({season:d?.season||null,stages:Array.isArray(d?.stages)?d.stages:[]});
      setTournamentError(false);
    }catch{
      setTournamentError(true);
    }finally{
      setInitialLoading(false);
    }
  };
  useEffect(()=>{refresh();const params=new URLSearchParams(window.location.search);trackEvent('LANDING_VIEW',{source:(params.get('src')||'direct').slice(0,32)})},[]);
  useEffect(()=>{
    if(!me?.membership)return;
    let cancelled=false;
    const check=async()=>{
      if(document.visibilityState!=='visible')return;
      try{
        const d=await api('/api/identity/me');
        if(cancelled)return;
        const latest=d?.qualificationImpact?.latestAssist;
        const publicId=d?.user?.publicId;
        if(publicId){
          const key=`somalicup_last_assist_${publicId}`;
          const seen=Number(localStorage.getItem(key)||0);
          if(latest?.id){
            if(seen&&Number(latest.id)>seen)setAssistMoment({latest,impact:d.qualificationImpact,membership:d.membership,user:d.user});
            localStorage.setItem(key,String(latest.id));
          }
        }
        setMe(d);
      }catch{}
    };
    const id=setInterval(check,60000);
    const onFocus=()=>check();
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;clearInterval(id);window.removeEventListener('focus',onFocus)}
  },[me?.membership?.season_id,me?.user?.publicId]);
  useEffect(()=>{
    if(!identityChecked||me?.membership||qualificationError)return;
    const code=new URLSearchParams(window.location.search).get('city')?.toUpperCase();
    if(!code){setViralCity(null);return}
    const city=standings.find(c=>c.code===code&&c.is_open);
    if(city){setViralCity(city);const key='sc_ref_landing_'+city.code+'_'+window.location.search;if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');trackEvent('REFERRAL_LANDING',{cityCode:city.code,source:(new URLSearchParams(window.location.search).get('src')||'referral').slice(0,32)})}}
  },[standings,me,identityChecked]);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const matchId=(params.get('match')||'').trim();
    const invite=(params.get('invite')||'').trim();
    if(!matchId||!invite){setViralMatch(null);setViralMatchError('');return}
    let cancelled=false;
    setViralMatchError('');
    api(`/api/matches/${encodeURIComponent(matchId)}/invite/${encodeURIComponent(invite)}`)
      .then(d=>{if(!cancelled){setViralMatch(d);const key='sc_match_invite_'+matchId+'_'+invite;if(!sessionStorage.getItem(key)){sessionStorage.setItem(key,'1');trackEvent('MATCH_INVITE_LANDING',{matchPublicId:matchId,cityCode:d?.invite?.city?.code||'',source:'match_invite'})}}})
      .catch(e=>{if(!cancelled){setViralMatch(null);setViralMatchError(humanError(e,'That match invite is no longer available.'))}});
    return()=>{cancelled=true}
  },[]);
  const top=standings[0];
  const qualificationUnavailable=!initialLoading&&qualificationError&&standings.length===0;
  const matchesUnavailable=!initialLoading&&matchesError&&matches.length===0;
  const hasTournament=Boolean(tournament?.stages?.length);
  const tournamentUnavailable=!initialLoading&&tournamentError;
  const myCity=useMemo(()=>me?.membership?standings.find(c=>c.code===me.membership.code):null,[me,standings]);
  const total=standings.reduce((a,c)=>a+Number(c.verified_supporters||0),0);
  const viralFrom=(new URLSearchParams(window.location.search).get('from')||'').trim().slice(0,40);
  const requestJoin=(city=null)=>{
    trackEvent('JOIN_OPENED',{cityCode:city?.code||'',source:'app'});
    if(me?.membership){setNotice(`You already represent ${me.membership.name} this season.`);setTimeout(()=>setNotice(''),2600);return}
    setJoinCity(city||null);
    setShowJoin(true);
  };
  const joined=(payload)=>{
    localStorage.setItem('somalicup_session',payload.token);
    if(payload?.user?.publicId)localStorage.setItem(`somalicup_last_assist_${payload.user.publicId}`,'0');
    setMe({user:payload.user,membership:{...payload.city,season_id:payload.season?.id,season_name:payload.season?.name,status:'ACTIVE',verification_status:'VERIFIED'}});
    setIdentityChecked(true);
    setShowJoin(false);
    setJoinCity(null);
    setViralCity(null);
    setViralMatch(null);
    const params=new URLSearchParams(window.location.search);
    if(!params.get('match'))window.history.replaceState({},'',window.location.pathname);
    setJoinedMoment(payload);
    setNotice(`You're in. You represent ${payload.city.name}.`);
    refresh();
    setTimeout(()=>setNotice(''),2200);
  };
  const openCity=(c)=>{setSelectedCity(c);setView('city');window.scrollTo({top:0,behavior:'smooth'})};
  const leaveViralLanding=()=>{setViralCity(null);window.history.replaceState({},'',window.location.pathname);setView('home')};
  const enterInvitedMatch=async()=>{
    if(!viralMatch?.match){setViralMatch(null);setView('matches');return}
    const cityCode=me?.membership?.code;
    const ownMatch=cityCode?matches.find(m=>m.home?.code===cityCode||m.away?.code===cityCode):null;
    const target=ownMatch||viralMatch.match;
    const home=target.home,away=target.away;
    const eligible=cityCode===home?.code||cityCode===away?.code;
    if(eligible){
      const rawInvite=new URLSearchParams(window.location.search).get('invite')||'';
      const inviteToken=target.publicId===viralMatch.match.publicId?rawInvite:'';
      setInviteBusy(true);
      try{
        await api(`/api/matches/${target.publicId}/join`,{method:'POST',body:JSON.stringify({inviteToken})});
        setNotice(`You're in the ${me.membership.name} match squad.`);
        setTimeout(()=>setNotice(''),2200);
      }catch(e){
        setNotice(humanError(e,'We could not enter this match. Try again.'));
        setTimeout(()=>setNotice(''),2600);
      }finally{setInviteBusy(false)}
    }
    setViralMatch(null);
    setView('matches');
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const leaveMatchInvite=()=>{setViralMatch(null);window.history.replaceState({},'',window.location.pathname);setView('home')};

  return <div className="appShell">
    {!viralCity&&!viralMatch&&<>    <header className="topbar">
      <button className="brandButton" onClick={()=>setView('home')}><Logo/></button>
      <nav className={mobileNav?'nav open':'nav'}>
        {['home','cities','matches'].map(v=><button key={v} className={view===v?'active':''} onClick={()=>{setView(v);setMobileNav(false)}}>{v[0].toUpperCase()+v.slice(1)}</button>)}
        {hasTournament&&<button className={view==='tournament'?'active':''} onClick={()=>{setView('tournament');setMobileNav(false)}}>Cup</button>}
        <button className={view==='qualification'?'active':''} onClick={()=>{setView('qualification');setMobileNav(false)}}>Live Table</button>
      </nav>
      <div className="topActions">
        <div className="seasonPill">{season?.name||'Somali Cup'} <ChevronRight size={14}/></div>
        {me?<button className="profilePill" onClick={()=>setView('profile')}><span>{(me.user.nickname||me.user.displayName||'?')[0]}</span><b>{me.user.nickname||me.user.displayName}</b></button>:<button className="miniCta" onClick={requestJoin}>Join</button>}
        <button className="mobileMenu" onClick={()=>setMobileNav(!mobileNav)}><Menu/></button>
      </div>
    </header></>}

    <AmbientMotion/>
    <main className={(viralCity&&!me?.membership)||viralMatch?'mainStage viralStage':'mainStage'}>
      {viralMatch?<ViralMatchLanding data={viralMatch} me={me} matches={matches} busy={inviteBusy} onIdentity={()=>requestJoin()} onEnter={enterInvitedMatch} onLeave={leaveMatchInvite}/>:viralMatchError?<InviteRecovery message={viralMatchError} onHome={leaveMatchInvite}/>:viralCity&&!me?.membership?<ViralCityLanding city={viralCity} standings={standings} fromName={viralFrom} onJoin={()=>requestJoin(viralCity)} onOther={leaveViralLanding}/>:initialLoading?<LiveDataState loading onRetry={refresh}/>:<>
        {view==='home'&&(qualificationUnavailable?<LiveDataState title="Live city race unavailable" body="We couldn’t load the verified city standings. No demo numbers are being shown." onRetry={refresh}/>:<Home standings={standings} top={top} total={total} season={season} myCity={myCity} me={me} matches={matches} onJoin={requestJoin} openCity={openCity} goQualification={()=>setView('qualification')} goMatches={()=>setView('matches')}/>)}
        {view==='qualification'&&(qualificationUnavailable?<LiveDataState title="Live table unavailable" body="The verified qualification table could not be loaded." onRetry={refresh}/>:<Qualification standings={standings} season={season} onJoin={requestJoin} openCity={openCity}/>)}
        {view==='cities'&&(qualificationUnavailable?<LiveDataState title="City data unavailable" body="We couldn’t load the verified city list." onRetry={refresh}/>:<Cities standings={standings} openCity={openCity} onJoin={requestJoin}/>)}
        {view==='city'&&(qualificationUnavailable?<LiveDataState title="City data unavailable" body="We couldn’t load the verified city data." onRetry={refresh}/>:selectedCity&&<CityPage city={standings.find(c=>c.code===selectedCity.code)||selectedCity} me={me} onBack={()=>setView('cities')} onJoin={requestJoin}/>)}
        {view==='matches'&&(matchesUnavailable?<LiveDataState title="Live fixtures unavailable" body="We couldn’t load the verified Somali Cup fixtures. No sample scores are being shown." onRetry={refresh}/>:<MatchCenter matches={matches} me={me} onNeedIdentity={requestJoin}/>)}
        {view==='tournament'&&(tournamentUnavailable?<LiveDataState title="Cup data unavailable" body="We couldn’t load the verified tournament state." onRetry={refresh}/>:<TournamentView tournament={tournament} myCityCode={me?.membership?.code||''} goMatches={()=>setView('matches')}/>)}
        {view==='profile'&&(qualificationUnavailable?<LiveDataState title="Supporter data unavailable" body="Your identity is safe, but the live city data could not be loaded." onRetry={refresh}/>:<SupporterProfile me={me} city={myCity} season={season} onJoin={requestJoin} onCity={()=>myCity&&openCity(myCity)} onMatches={()=>setView('matches')}/>)}
      </>}
    </main>

    {!viralCity&&!viralMatch&&<nav className="mobileDock">
      <button className={view==='home'?'active':''} onClick={()=>setView('home')}><Trophy size={18}/><span>Home</span></button>
      <button className={view===(hasTournament?'tournament':'qualification')?'active':''} onClick={()=>setView(hasTournament?'tournament':'qualification')}><BarChart3 size={18}/><span>{hasTournament?'Cup':'Table'}</span></button>
      <button className={view==='matches'?'active':''} onClick={()=>setView('matches')}><Radio size={18}/><span>Matches</span></button>
      <button className={view==='cities'?'active':''} onClick={()=>setView('cities')}><MapPin size={18}/><span>Cities</span></button>
      <button className={view==='profile'?'active':''} onClick={()=>me?.membership?setView('profile'):requestJoin()}><Users size={18}/><span>{me?.membership?'Me':'Join'}</span></button>
    </nav>}

    {showJoin&&!me?.membership&&standings.length>0&&<JoinExperience standings={standings.filter(c=>c.is_open)} initialCity={joinCity} onClose={()=>{setShowJoin(false);setJoinCity(null)}} onJoined={joined}/>}
    {showJoin&&!me?.membership&&standings.length===0&&!initialLoading&&<LiveDataState overlay title="Joining is temporarily unavailable" body="We couldn’t load the verified city list, so Somali Cup won’t guess or show sample data." onRetry={refresh} onClose={()=>{setShowJoin(false);setJoinCity(null)}}/>}
    {joinedMoment&&<JoinedMoment payload={joinedMoment} city={{...(standings.find(c=>c.code===joinedMoment.city.code)||{}),...joinedMoment.city}} onDone={()=>{setJoinedMoment(null);setView(new URLSearchParams(window.location.search).get('match')?'matches':'profile')}}/>}
    {assistMoment&&<AssistMoment moment={assistMoment} city={standings.find(c=>c.code===assistMoment.membership?.code)||assistMoment.membership} onDone={()=>setAssistMoment(null)}/>}
    {notice&&<div className="toast"><Check size={16}/>{notice}</div>}
  </div>
}

function LiveDataState({loading=false,title='Loading verified Somali Cup data',body='Getting the latest verified information.',onRetry,onClose,overlay=false}){
  const content=<section className="liveDataState">
    <div className={loading?'liveDataMark loading':'liveDataMark'}><ShieldCheck size={26}/></div>
    <small>VERIFIED DATA</small>
    <h2>{loading?'Loading live data…':title}</h2>
    <p>{loading?body:body}</p>
    {!loading&&onRetry&&<button className="goldBtn" onClick={onRetry}>TRY AGAIN <ArrowRight size={16}/></button>}
    {onClose&&<button className="joinedSecondary" onClick={onClose}>Close</button>}
  </section>;
  return overlay?<div className="liveDataOverlay">{content}</div>:<div className="liveDataWrap">{content}</div>
}

function InviteRecovery({message,onHome}){
  return <div className="inviteRecovery">
    <section>
      <div className="inviteRecoveryMark"><Link2 size={24}/></div>
      <small>MATCH INVITE</small>
      <h1>This link can’t open the match.</h1>
      <p>{message}</p>
      <button className="goldBtn" onClick={onHome}>GO TO SOMALI CUP <ArrowRight size={16}/></button>
    </section>
  </div>
}

function ViralMatchLanding({data,me,matches,busy,onIdentity,onEnter,onLeave}){
  const invite=data?.invite;
  const invitedMatch=data?.match;
  if(!invitedMatch)return null;
  const memberCode=me?.membership?.code;
  const ownMatch=memberCode?matches.find(m=>m.home?.code===memberCode||m.away?.code===memberCode):null;
  const match=ownMatch||invitedMatch;
  const home=match.home,away=match.away;
  const homeScore=Number(home?.score||0),awayScore=Number(away?.score||0);
  const memberCity=memberCode===home?.code?home:memberCode===away?.code?away:null;
  const inviterCity=invite?.city;
  const redirected=Boolean(ownMatch&&ownMatch.publicId!==invitedMatch.publicId);
  const leader=homeScore===awayScore?null:(homeScore>awayScore?home:away);
  const gap=Math.abs(homeScore-awayScore);
  const statusCopy=match.status==='LIVE'
    ? leader?`${leader.name} lead by ${gap} ${gap===1?'Goal':'Goals'}.`:'The score is level. The next Goal takes the lead.'
    : match.status==='LOBBY'?'The lobby is open. Cities are calling their people in.':'This fixture is coming up.';
  return <div className="matchInviteLanding">
    <section className="matchInviteHero">
      <div className="matchInviteTop"><Logo/><span className={match.status==='LIVE'?'inviteLive live':'inviteLive'}><i/> {match.status}</span></div>
      <div className="matchInviteCallout"><UserPlus size={16}/><span>{redirected?<><b>{invite?.from||'A supporter'}</b> called you into Somali Cup. We opened your own city’s fixture.</>:<><b>{invite?.from||'A supporter'}</b> from {inviterCity?.name||'their city'} called you into this match.</>}</span></div>
      <div className="matchInviteVersus">
        <div className="inviteCity" style={{backgroundImage:`linear-gradient(180deg,rgba(2,8,18,.18),rgba(2,8,18,.95)),url("${imgFor(home)}")`}}><CityThumb city={home} size="lg"/><small>{home.code}</small><h2>{home.name}</h2><strong>{fmt(homeScore)}</strong></div>
        <div className="inviteVs"><small>{match.roundCode||'SOMALI CUP'}</small><b>VS</b><span>{match.status==='LIVE'?'LIVE SCORE':'FIXTURE'}</span></div>
        <div className="inviteCity" style={{backgroundImage:`linear-gradient(180deg,rgba(2,8,18,.18),rgba(2,8,18,.95)),url("${imgFor(away)}")`}}><CityThumb city={away} size="lg"/><small>{away.code}</small><h2>{away.name}</h2><strong>{fmt(awayScore)}</strong></div>
      </div>
      <div className="matchInviteAction">
        <small>THE MATCH IS CALLING</small>
        <h1>{memberCity?`Your city is playing.`:!me?'Which city is yours?':'Your city has a fixture.'}</h1>
        <p>{statusCopy} {memberCity?`Enter for ${memberCity.name}. Your verified entry can score exactly 1 Goal.`:!me?'Choose your real city first. Every active city has a current fixture.':'Somali Cup is opening your city’s current fixture.'}</p>
        {!me?<button className="matchInvitePrimary" onClick={onIdentity}>CHOOSE MY CITY <ArrowRight size={18}/></button>:
          memberCity?<button className="matchInvitePrimary" disabled={busy} onClick={onEnter}>{busy?'ENTERING…':`ENTER FOR ${memberCity.name.toUpperCase()}`} <ArrowRight size={18}/></button>:
          <button className="matchInvitePrimary" onClick={onEnter}>OPEN MY CITY MATCH <ArrowRight size={17}/></button>}
        <button className="viralOtherCity" onClick={onLeave}>Go to Somali Cup home</button>
        <div className="viralTrust"><ShieldCheck size={15}/><span>1 verified person = 1 Goal. Invites never change your city.</span></div>
      </div>
    </section>
  </div>
}

function ViralCityLanding({city,standings,fromName,onJoin,onOther}){
  const need=Math.max(0,Number(city.qualification_target||0)-Number(city.verified_supporters||0));
  const idx=Math.max(0,standings.findIndex(c=>c.code===city.code));
  const rival=idx===0?standings[1]:standings[idx-1];
  const cityGoals=Number(city.verified_supporters||0);
  const rivalGoals=Number(rival?.verified_supporters||0);
  const relation=!rival?'NONE':cityGoals>rivalGoals?'LEADING':cityGoals<rivalGoals?'BEHIND':'TIED';
  const gap=rival?Math.abs(cityGoals-rivalGoals):0;
  return <div className="viralLanding">
    <section className="viralLandingHero" style={{backgroundImage:`linear-gradient(180deg,rgba(1,7,16,.2),rgba(1,7,16,.96)),url("${imgFor(city)}")`}}>
      <div className="viralLandingTop"><Logo/><span><i/> LIVE QUALIFICATION</span></div>
      <div className="viralLandingContent">
        <small>{fromName?`${fromName.toUpperCase()} FROM ${city.name.toUpperCase()} CHALLENGED YOU`:`SOMEONE FROM ${city.name.toUpperCase()} SENT YOU THIS`}</small>
        <h1>{city.name}<br/><em>needs you.</em></h1>
        <p>{fromName?<><b>{fromName}</b> is backing {city.name}. Join the same city and score the next Goal.</>:<>Somalia’s cities are competing for Somali Cup 2027. Every verified person scores 1 Goal for their city.</>}</p>
        <div className="viralLandingNumbers">
          <div><span>CITY RANK</span><strong>#{city.rank}</strong></div>
          <div><span>GOALS SCORED</span><strong>{fmt(city.verified_supporters)}</strong></div>
          <div><span>GOALS NEEDED</span><strong>{fmt(need)}</strong></div>
        </div>
        <div className="viralLandingProgress"><div><span>{fmt(city.verified_supporters)} / {fmt(city.qualification_target)}</span><b>{Number(city.progress_pct||0).toFixed(0)}%</b></div><Progress value={city.progress_pct}/></div>
        {rival&&<div className={"viralUrgency "+relation.toLowerCase()}><Zap size={16}/><span>{relation==='LEADING'?<><b>{city.name} leads {rival.name} by {fmt(gap)} {gap===1?'Goal':'Goals'}.</b> Protect the lead.</>:relation==='BEHIND'?<><b>{city.name} is {fmt(gap)} {gap===1?'Goal':'Goals'} behind {rival.name}.</b> Your Goal cuts the gap.</>:<><b>{city.name} is level with {rival.name}.</b> The next Goal takes the lead.</>}</span></div>}
        <button className="viralJoinButton" onClick={onJoin}>I REPRESENT {city.name.toUpperCase()} <ArrowRight size={18}/></button>
        <span className="viralJoinMicro">Join once · score 1 Goal · then bring one person for the Assist</span>
        <button className="viralOtherCity" onClick={onOther}>I represent another city</button>
        <div className="viralTrust"><ShieldCheck size={15}/><span>One person. One city. One season.</span></div>
      </div>
    </section>
  </div>
}

function Home({standings,top,total,season,myCity,me,matches,onJoin,openCity,goQualification,goMatches}){
  const leaders=standings.slice(0,5);
  const remaining=myCity?Math.max(0,Number(myCity.qualification_target||0)-Number(myCity.verified_supporters||0)):0;
  const myIndex=myCity?standings.findIndex(c=>c.code===myCity.code):-1;
  const myRival=myIndex===0?standings[1]:myIndex>0?standings[myIndex-1]:null;
  const myGap=myRival?Math.abs(Number(myCity.verified_supporters||0)-Number(myRival.verified_supporters||0)):0;
  const myRelation=!myRival?'NONE':Number(myCity.verified_supporters||0)>Number(myRival.verified_supporters||0)?'LEADING':Number(myCity.verified_supporters||0)<Number(myRival.verified_supporters||0)?'BEHIND':'TIED';
  const myFixture=myCity?(matches||[]).find(m=>m.home?.code===myCity.code||m.away?.code===myCity.code):null;
  const opponent=myFixture?(myFixture.home?.code===myCity.code?myFixture.away:myFixture.home):null;
  const goalNumber=Number(me?.qualificationImpact?.goalNumber||me?.membership?.goal_number||0);
  const assists=Number(me?.qualificationImpact?.assists||0);
  const branch=Number(me?.qualificationImpact?.branch||0);
  const fixtureCta=!myFixture?'SHARE MY CITY':myFixture.status==='LIVE'?'ENTER MY CITY MATCH':myFixture.status==='LOBBY'?'OPEN MY CITY MATCH':'VIEW MY NEXT MATCH';
  const shareMyCity=()=>myCity&&sharePoster({
    city:myCity,
    title:'I REPRESENT '+myCity.name.toUpperCase(),
    subtitle:fmt(myCity.verified_supporters)+' Goals scored · '+Number(myCity.progress_pct||0).toFixed(0)+'% to qualification',
    footer:remaining?fmt(remaining)+' Goals needed':'Qualification target reached'
  });

  return <div className="simpleHome">
    <section className="viralHero" style={{backgroundImage:'linear-gradient(90deg,rgba(1,7,17,.98) 0%,rgba(1,8,18,.78) 44%,rgba(1,8,18,.28) 72%,rgba(1,8,18,.72) 100%),url("'+heroImage+'")'}}>
      <div className="viralHeroCopy">
        <div className="liveBadge"><span/> {myCity?'MY CITY TODAY':'QUALIFICATION IS LIVE'}</div>
        <h1>{myCity?<>{myCity.name.toUpperCase()}<br/><em>NEEDS YOU.</em></>:<>YOUR CITY.<br/><em>YOUR CUP.</em></>}</h1>
        <p>{myCity?'You already scored your Goal. Now protect your city’s position, grow your Branch and show up for the next fixture.':'Somalia’s cities are competing for Somali Cup 2027. Choose your city. Every verified person scores 1 Goal.'}</p>

        {!myCity?<>
          <button className="heroPrimary" onClick={onJoin}>REPRESENT YOUR CITY <ArrowRight size={18}/></button>
          <button className="heroTextLink" onClick={goQualification}>See the live city race <ChevronRight size={15}/></button>
        </>:<>
          <div className="returningCity returningMission">
            <div className="returningCityTop"><CityThumb city={myCity} size="md"/><div><small>YOU REPRESENT</small><strong>{myCity.name}</strong><span>{goalNumber?'Goal #'+fmt(goalNumber)+' · ':''}#{myCity.rank} in qualification</span></div></div>
            <div className="returningProgress"><div><span><MotionNumber value={myCity.verified_supporters}/> / {fmt(myCity.qualification_target)}</span><b>{remaining?fmt(remaining)+' Goals needed':'TARGET REACHED'}</b></div><Progress value={myCity.progress_pct}/></div>
            {myRival&&<div className={'returningRival '+myRelation.toLowerCase()}>{myRelation==='LEADING'?<><b>Lead {myRival.name} by {fmt(myGap)}.</b> Protect it.</>:myRelation==='BEHIND'?<><b>{fmt(myGap)} behind {myRival.name}.</b> Close the gap.</>:<><b>Level with {myRival.name}.</b> Next Goal leads.</>}</div>}
            {myFixture&&opponent&&<div className={'homeFixtureStrip '+String(myFixture.status||'').toLowerCase()}>
              <div><small>{myFixture.status==='LIVE'?'LIVE NOW':'YOUR CURRENT FIXTURE'}</small><strong>{myCity.code} <em>vs</em> {opponent.code}</strong><span>{myCity.name} vs {opponent.name}</span></div>
              <b>{myFixture.status}</b>
            </div>}
            <button className="heroPrimary" onClick={myFixture?goMatches:shareMyCity}>{myFixture?<Radio size={18}/>:<Share2 size={18}/>} {fixtureCta}</button>
            <button className="heroTextLink" onClick={goQualification}>See the live city race <ChevronRight size={15}/></button>
          </div>
        </>}
      </div>

      <div className="heroRaceCard">
        <div className="heroRaceHead"><span><i/> LIVE CITY RACE</span><button onClick={goQualification}>Full table <ArrowRight size={13}/></button></div>
        {leaders.map(c=><button key={c.code} className="heroRaceRow" onClick={()=>openCity(c)}>
          <span className="heroRank">#{c.rank}</span>
          <CityThumb city={c} size="sm"/>
          <div className="heroRaceName"><b>{c.name}</b><small><MotionNumber value={c.verified_supporters}/> Goals</small></div>
          <div className="heroRaceProgress"><strong>{Number(c.progress_pct||0).toFixed(0)}%</strong><Progress value={c.progress_pct}/></div>
        </button>)}
        <div className="heroRaceFooter"><Users size={14}/><span><MotionNumber value={total}/> Goals scored across {standings.length} cities</span></div>
      </div>
    </section>

    {myCity&&<section className="returningMissionBoard">
      <div className="missionBoardHead">
        <div><small>YOUR SOMALI CUP IMPACT</small><h2>One Goal. Keep the movement going.</h2></div>
        <button className="glassBtn" onClick={()=>openCity(myCity)}>Open {myCity.name} <ChevronRight size={15}/></button>
      </div>
      <div className="missionImpactGrid">
        <div className="missionImpact primary"><span>YOUR GOAL</span><strong>{goalNumber?'#'+fmt(goalNumber):'1'}</strong><small>Permanently yours</small></div>
        <div className="missionImpact"><span>ASSISTS</span><strong><MotionNumber value={assists}/></strong><small>People you brought directly</small></div>
        <div className="missionImpact"><span>BRANCH</span><strong><MotionNumber value={branch}/></strong><small>Your full supporter chain</small></div>
        <div className="missionImpact"><span>CITY POSITION</span><strong>#{myCity.rank}</strong><small>{myRelation==='LEADING'&&myRival?'+'+fmt(myGap)+' vs '+myRival.code:myRelation==='BEHIND'&&myRival?'-'+fmt(myGap)+' vs '+myRival.code:myRelation==='TIED'&&myRival?'Level with '+myRival.code:'Qualification race'}</small></div>
      </div>
      <div className="missionAction">
        <div>
          <small>NEXT MOVE</small>
          <h3>{myFixture?myFixture.status==='LIVE'?'Your city is playing now.':myFixture.status==='LOBBY'?'Your city’s lobby is open.':'Your city already has its next fixture.':'Bring the next Goal into '+myCity.name+'.'}</h3>
          <p>{myFixture&&opponent?myCity.name+' vs '+opponent.name+'. '+(myFixture.status==='LIVE'?'Enter the match and make your verified Goal count.':'Open the fixture, reserve your place and call your city.'):'Share your city. If one person joins through your link, you get the Assist and they score their own Goal.'}</p>
        </div>
        <button className="goldBtn" onClick={myFixture?goMatches:shareMyCity}>{myFixture?<Radio size={16}/>:<Share2 size={16}/>} {fixtureCta}</button>
      </div>
    </section>}

    {!myCity&&<>
    <section className="firstVisitFlow">
      <div className="flowIntro"><small>HOW IT WORKS</small><h2>Three steps. That’s it.</h2><p>No points to learn. Pick your city, score 1 Goal, then bring one person for the Assist.</p></div>
      <div className="flowSteps">
        <div><span>01</span><div><b>Choose your city</b><p>Pick the city you want to represent for the season.</p></div></div>
        <div><span>02</span><div><b>Score your Goal</b><p>Your verified join scores exactly 1 Goal for your city.</p></div></div>
        <div><span>03</span><div><b>Get the Assist</b><p>Share your city. If one person joins through you, that’s your Assist.</p></div></div>
      </div>
    </section>

    <section className="chooseCityNow">
      <div className="sectionTitle simple"><div><small>CHOOSE YOUR SIDE</small><h3>Which city do you represent?</h3></div></div>
      <div className="quickCityGrid">
        {standings.slice(0,6).map(c=>{
          const need=Math.max(0,Number(c.qualification_target||0)-Number(c.verified_supporters||0));
          return <button key={c.code} onClick={()=>onJoin(c)} className="quickCity">
            <div className="quickCityImage" style={{backgroundImage:'linear-gradient(180deg,rgba(2,8,18,.02),rgba(2,8,18,.92)),url("'+imgFor(c)+'")'}}>
              <span>#{c.rank}</span>
              <div><b>{c.name}</b><small>{need?fmt(need)+' Goals needed':'Target reached'}</small></div>
            </div>
            <div className="quickCityBottom"><Progress value={c.progress_pct}/><strong>{Number(c.progress_pct||0).toFixed(0)}%</strong></div>
          </button>
        })}
      </div>
      <button className="cityJoinPrimary" onClick={onJoin}>CHOOSE MY CITY <ArrowRight size={18}/></button>
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
    </>}
  </div>
}
function TournamentView({tournament,myCityCode,goMatches}){
  const stages=tournament?.stages||[];
  const defaultStage=stages.find(s=>s.status==='OPEN')||stages.find(s=>s.status!=='COMPLETE')||stages[stages.length-1]||null;
  const [stageCode,setStageCode]=useState(defaultStage?.code||'');
  useEffect(()=>{if(!stages.some(s=>s.code===stageCode))setStageCode(defaultStage?.code||'')},[stages,defaultStage?.code]);
  if(!stages.length)return <div className="pageWrap"><section className="cupEmpty"><Trophy size={35}/><small>SOMALI CUP</small><h1>The tournament path is not published yet.</h1><p>Qualification is still deciding who enters the Cup. No bracket is being guessed or shown early.</p></section></div>;
  const stage=stages.find(s=>s.code===stageCode)||defaultStage||stages[0];
  let myGroup=null,myRow=null;
  if(stage?.type==='GROUP'){
    for(const group of stage.groups||[]){
      const row=(group.table||[]).find(r=>r.city?.code===myCityCode);
      if(row){myGroup=group;myRow=row;break}
    }
  }
  const myKnockout=(stage?.matches||[]).find(m=>m.home?.code===myCityCode||m.away?.code===myCityCode);
  return <div className="cupPage pageWrap">
    <section className="cupHero">
      <div><small>THE ROAD TO THE CUP</small><h1>Somali Cup <em>2027</em></h1><p>Verified results decide every table, every qualifier and every next match.</p></div>
      <button className="glassBtn" onClick={goMatches}><Radio size={16}/> Match Centre</button>
    </section>
    <div className="cupStageRail">
      {stages.map((s,i)=><button key={s.code} className={s.code===stage.code?'active':''} onClick={()=>setStageCode(s.code)}>
        <span>{String(i+1).padStart(2,'0')}</span><div><b>{s.name}</b><small>{s.status}</small></div>
      </button>)}
    </div>

    {(myRow||myKnockout)&&<section className="myCupState">
      <div><small>YOUR CITY · {stage.name.toUpperCase()}</small>
        <h2>{myRow?myRow.city.name:(myKnockout.home?.code===myCityCode?myKnockout.home.name:myKnockout.away.name)}</h2>
        <p>{myRow?`#${myRow.rank} in ${myGroup.name} · ${myRow.points} pts · GD ${myRow.goalDiff>0?'+':''}${myRow.goalDiff}`:myKnockout.status==='FINAL'?'Result confirmed.':'Your next Cup fixture is set.'}</p>
      </div>
      <button className="goldBtn" onClick={goMatches}>{myKnockout?.status==='LIVE'?'ENTER MY MATCH':'OPEN MATCH CENTRE'} <ArrowRight size={15}/></button>
    </section>}

    {stage.type==='GROUP'?<div className="cupGroups">
      {(stage.groups||[]).map(group=><section className="cupGroup" key={group.code}>
        <div className="cupGroupHead"><div><small>{group.code}</small><h3>{group.name}</h3></div><span>{stage.advanceCount?stage.advanceCount+' advance':'GROUP STAGE'}</span></div>
        <div className="cupTableHead"><span>#</span><span>City</span><span>P</span><span>W</span><span>D</span><span>GD</span><span>Pts</span></div>
        {(group.table||[]).map(row=><div key={row.city.code} className={'cupTableRow '+(row.city.code===myCityCode?'mine':'')}>
          <b>{row.rank}</b><div><strong>{row.city.name}</strong><small>{row.city.code}</small></div><span>{row.played}</span><span>{row.wins}</span><span>{row.draws||0}</span><span>{row.goalDiff>0?'+':''}{row.goalDiff}</span><strong>{row.points}</strong>
        </div>)}
        <div className="cupGroupFixtures">
          {(group.matches||[]).slice(0,4).map(m=><div key={m.publicId}><span>{m.status}</span><b>{m.home.code} {m.home.score} — {m.away.score} {m.away.code}</b></div>)}
          {(group.matches||[]).length>4&&<small>+ {(group.matches||[]).length-4} more fixtures in Match Centre</small>}
        </div>
      </section>)}
    </div>:<section className="cupKnockout">
      <div className="cupKnockoutHead"><small>{stage.status}</small><h2>{stage.name}</h2><p>Only finalized winners move forward.</p></div>
      <div className="knockoutMatches">
        {(stage.matches||[]).length?(stage.matches||[]).map(m=><article key={m.publicId} className={m.home?.code===myCityCode||m.away?.code===myCityCode?'mine':''}>
          <div><span>MATCH {m.matchNo||'—'}</span><b>{m.status}</b></div>
          <section><strong>{m.home.name}</strong><em>{m.home.score}</em></section>
          <section><strong>{m.away.name}</strong><em>{m.away.score}</em></section>
          {m.winner&&<small><Trophy size={12}/> {m.winner.name} advance</small>}
        </article>):<div className="truthEmpty"><ShieldCheck size={19}/><div><b>Bracket slots are waiting for verified qualifiers.</b><p>No placeholder cities are being shown.</p></div></div>}
      </div>
    </section>}
  </div>
}

function Qualification({standings,season,onJoin,openCity}){
  return <div className="pageWrap">
    <section className="pageHero compact"><div><div className="liveBadge"><span/> {season?.status}</div><h1>Qualification <em>Leaderboard</em></h1><p>Every verified person scores exactly 1 Goal for their city. One person. One city. One season.</p></div><button className="goldBtn" onClick={onJoin}>Represent Your City <ArrowRight size={17}/></button></section>
    <div className="qualificationGrid">
      <section className="panel fullTable">
        <div className="leaderCols large"><span>#</span><span>City</span><span>Tier</span><span>Verified</span><span>Target</span><span>Progress</span><span>Status</span></div>
        {standings.map(c=><button className="leaderRow large" key={c.code} onClick={()=>openCity(c)}><b>{c.rank}</b><div className="cityInline"><span>{flag(c.country)}</span><div><strong>{c.name}</strong><small>{c.country}</small></div></div><span className="tierTag">{c.tier}</span><strong><MotionNumber value={c.verified_supporters}/></strong><span>{fmt(c.qualification_target)}</span><div className="leaderProgress"><Progress value={c.progress_pct}/><small>{Number(c.progress_pct||0).toFixed(1)}%</small></div><span className="statusTag">{c.status}</span></button>)}
      </section>
      <aside className="integrityCard"><div className="shieldBig">★</div><small>COMPETITION INTEGRITY</small><h3>One city per season.</h3><p>Your supporter identity is locked to one city for the active season. This protects the tournament and keeps every city’s numbers meaningful.</p><ul><li><Check/>1 verified person = 1 Goal</li><li><Check/>Clicks do not score Goals</li><li><Check/>Repeat joins are blocked</li><li><Check/>Admin changes are audited</li></ul></aside>
    </div>
  </div>
}

function Cities({standings,openCity,onJoin}){
  return <div className="pageWrap">
    <section className="pageHero compact"><div><small className="kicker">SOMALIA CITY NETWORK</small><h1>Choose the city that <em>feels like home.</em></h1><p>From Mogadishu to Kismayo, Garowe to Baidoa, every city enters with its own identity, supporters and road to the Cup.</p></div><button className="goldBtn" onClick={onJoin}>Join Your City</button></section>
    <div className="citiesGrid">{standings.map(c=><button className="cityPoster" key={c.code} onClick={()=>openCity(c)} style={{backgroundImage:`linear-gradient(180deg,rgba(2,8,18,.03),rgba(2,8,18,.96)),url("${imgFor(c)}")`}}><span className="rankChip">#{c.rank}</span><div><small>{flag(c.country)} {c.country}</small><h3>{c.name}</h3><p>{fmt(c.verified_supporters)} Goals scored</p><Progress value={c.progress_pct}/><b>{Number(c.progress_pct||0).toFixed(0)}% to target</b></div></button>)}</div>
  </div>
}

function CityPage({city,me,onBack,onJoin}){
  const mine=me?.membership?.code===city.code;
  return <div className="pageWrap">
    <button className="backBtn" onClick={onBack}><ArrowLeft size={15}/> All Cities</button>
    <section className="cityFeature" style={{backgroundImage:`linear-gradient(90deg,rgba(2,8,18,.98),rgba(2,8,18,.52),rgba(2,8,18,.8)),url("${imgFor(city)}")`}}>
      <div><span className="rankChip">#{city.rank} · {city.tier}</span><h1>{city.name}</h1><p>{city.country} · {city.status}</p><div className="cityFeatureStats"><div><strong>{fmt(city.verified_supporters)}</strong><span>Goals scored</span></div><div><strong>{fmt(city.qualification_target)}</strong><span>Qualification target</span></div><div><strong>{Number(city.progress_pct||0).toFixed(0)}%</strong><span>Progress</span></div></div>{mine?<div className="mineBadge"><Check/> You represent {city.name}</div>:<button className="goldBtn" onClick={()=>onJoin(city)}>Represent {city.name} <ArrowRight size={16}/></button>}</div>
    </section>
    <section className="cityShareBand">
      <div><small>SHARE THE RACE</small><h3>Put {city.name} on your WhatsApp Status.</h3><p>Turn your city’s qualification push into a premium Somali Cup poster.</p></div>
      <button className="goldBtn" onClick={()=>sharePoster({city,title:`I REPRESENT ${city.name.toUpperCase()}`,subtitle:`${fmt(city.verified_supporters)} Goals scored · ${Number(city.progress_pct||0).toFixed(0)}% to target`,footer:`${city.name} is chasing a place in Somali Cup 2027`})}><Share2 size={16}/> Create City Poster</button>
    </section>
  </div>
}

function SupporterProfile({me,city,season,onJoin,onCity,onMatches}){
  const [showStudio,setShowStudio]=useState(false);
  const [shareMsg,setShareMsg]=useState('');
  if(!me?.membership||!city)return <div className="pageWrap"><section className="pageHero compact"><div><small className="kicker">SUPPORTER IDENTITY</small><h1>Your Somali Cup <em>story starts here.</em></h1><p>Choose one city for the season and your supporter pass will live here.</p></div><button className="goldBtn" onClick={onJoin}>Choose Your City</button></section></div>;
  const name=me.user.nickname||me.user.displayName;
  const goalNumber=Number(me.qualificationImpact?.goalNumber||me.membership?.goal_number||0);
  const remaining=Math.max(0,Number(city.qualification_target||0)-Number(city.verified_supporters||0));
  const create=async(kind)=>{
    const presets={
      identity:{title:`I REPRESENT ${city.name.toUpperCase()}`,subtitle:`${name} · Verified Somali Cup supporter`,footer:'My city. My season. My Cup.'},
      qualification:{title:`${city.name.toUpperCase()} NEEDS ${fmt(remaining)} MORE`,subtitle:`${fmt(city.verified_supporters)} Goals scored · ${Number(city.progress_pct||0).toFixed(0)}% complete`,footer:`Help ${city.name} reach Somali Cup 2027`},
      callup:{title:'CALLING MY CITY',subtitle:`${city.name} supporters — join me in Somali Cup`,footer:'Represent your city at somalicup.com'}
    };
    try{
      const result=await sharePoster({city,...presets[kind],fromName:name,refPublicId:me.user.publicId});
      setShareMsg(shareResultMessage(result));
      setTimeout(()=>setShareMsg(''),2600);
      return result;
    }catch{
      setShareMsg('Could not create the poster on this device.');
      setTimeout(()=>setShareMsg(''),2600);
      return 'error';
    }
  };
  return <div className="supporterPage">
    <section className="supporterHero" style={{backgroundImage:`linear-gradient(90deg,rgba(2,8,18,.98),rgba(2,8,18,.58),rgba(2,8,18,.85)),url("${imgFor(city)}")`}}>
      <div className="supporterPass">
        <div className="passTop"><Logo/><span>SEASON PASS · {season?.name||'2027'}</span></div>
        <div className="passIdentity"><div className="passAvatar">{name?.[0]||'S'}</div><div><small>VERIFIED SUPPORTER</small><h1>{name}</h1><p>{city.name} · {city.code}</p></div></div>
        <div className="passCity"><CityThumb city={city} size="lg"/><div><span>YOUR CITY</span><strong>{city.name}</strong><small>{goalNumber?`Goal #${fmt(goalNumber)} · `:''}Rank #{city.rank}</small></div></div>
        <div className="passFooter"><span>SC-{String(me.user.publicId||'SUPPORTER').slice(-8).toUpperCase()}</span><b>ONE CITY · ONE SEASON</b></div>
      </div>
      <div className="supporterHeroCopy"><small>YOUR SOMALI CUP IDENTITY</small><h2>You don’t just watch.<br/><em>You represent.</em></h2><p>Your pass shows the Goal you scored for your city and the Assists you create next.</p><div className="supporterHeroBtns"><button className="goldBtn" onClick={()=>create('qualification')}><Share2 size={16}/> SHARE {city.name.toUpperCase()}</button><button className="heroTextLink light" onClick={onMatches}><Radio size={15}/> Go to Match Centre</button></div></div>
    </section>

    <section className="supporterDashboard">
      <div className="supporterStat highlight"><span>Your Goal</span><strong>{goalNumber?`#${fmt(goalNumber)}`:'1'}</strong><small>{goalNumber?'Your permanent city Goal number':`You joined ${city.name}`}</small></div>
      <div className="supporterStat"><span>Your Assists</span><strong><MotionNumber value={me.qualificationImpact?.assists||0}/></strong><small>People who joined through you</small></div>
      <div className="supporterStat"><span>Your Branch</span><strong><MotionNumber value={me.qualificationImpact?.branch||0}/></strong><small>Your full chain</small></div>
      <div className="supporterStat"><span>City rank</span><strong>#{city.rank}</strong><small>{fmt(city.verified_supporters)} Goals</small></div>
    </section>

    <section className="shareChoice">
      <div><small>YOUR NEXT MOVE</small><h3>Go for your next Assist.</h3><p>Share your city. When one person joins through your link, your Assist count goes up and they score their own Goal.</p></div>
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
    {shareMsg&&<div className="shareResultNotice"><Check size={15}/>{shareMsg}</div>}
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
  const [scoreMoment,setScoreMoment]=useState(null);
  const [matchAssistMoment,setMatchAssistMoment]=useState(null);
  const [liveError,setLiveError]=useState('');
  const [lastLiveAt,setLastLiveAt]=useState(null);
  const liveRef=useRef(null);
  const momentTimerRef=useRef(null);
  const load=async(match=selected,{quiet=false}={})=>{
    if(!match)return;
    try{
      const fresh=await api(`/api/matches/${match.publicId}/live`);
      const prev=liveRef.current;
      if(!quiet&&prev?.match?.publicId===fresh?.match?.publicId&&Number(fresh?.match?.scoreVersion||0)>Number(prev?.match?.scoreVersion||0)){
        const latestGoal=(fresh.activity||[]).find(a=>a.type==='GOAL');
        if(latestGoal){
          const h=Number(fresh.match?.home?.score||0),a=Number(fresh.match?.away?.score||0);
          const scoringCity=latestGoal.city_name||latestGoal.city_code||'A city';
          const scoringCode=latestGoal.city_code||'';
          const scoringLeads=(scoringCode===fresh.match?.home?.code&&h>a)||(scoringCode===fresh.match?.away?.code&&a>h);
          const isLevel=h===a;
          setScoreMoment({
            city:scoringCity,
            code:scoringCode,
            supporter:latestGoal.nickname||latestGoal.display_name||'A supporter',
            message:isLevel?'Level match.':scoringLeads?'They take the lead.':'The gap just changed.'
          });
          clearTimeout(momentTimerRef.current);
          momentTimerRef.current=setTimeout(()=>setScoreMoment(null),5200);
        }
      }
      liveRef.current=fresh;
      setLive(fresh);
      setLiveError('');
      setLastLiveAt(new Date());
    }catch(e){
      setLiveError(humanError(e,'We could not refresh the verified live score.'));
      if(!liveRef.current)setLive(null);
    }
    if(me){
      try{
        const d=await api(`/api/matches/${match.publicId}/me`);
        const p=d.participation;
        if(p){
          const key=`somalicup_match_assist_${match.publicId}_${me?.user?.publicId||'supporter'}`;
          const raw=localStorage.getItem(key);
          const latest=p.latestAssist;
          if(latest?.id){
            if(raw!==null&&Number(latest.id)>Number(raw)){
              setMatchAssistMoment({
                latest,
                assists:Number(p.assists||0),
                branch:Number(p.downstream_joins||0),
                indirect:Number(p.indirect_joins||0),
                city:{code:p.city_code,name:p.city_name}
              });
            }
            localStorage.setItem(key,String(latest.id));
          }else if(raw===null){
            localStorage.setItem(key,'0');
          }
        }
        setMine(p);
      }catch{setMine(null)}
    }else setMine(null)
  };
  useEffect(()=>{
    const wanted=new URLSearchParams(window.location.search).get('match');
    const deep=wanted?matches.find(m=>m.publicId===wanted):null;
    const cityCode=me?.membership?.code;
    const own=cityCode?matches.find(m=>m.home?.code===cityCode||m.away?.code===cityCode):null;
    const target=own||deep||matches[0]||null;
    if(target && selected?.publicId!==target.publicId)setSelected(target);
  },[matches,selected?.publicId,me?.membership?.code]);
  useEffect(()=>{
    liveRef.current=null;
    setScoreMoment(null);
    setMatchAssistMoment(null);
    load(selected,{quiet:true});
  },[selected?.publicId,Boolean(me)]);

  useEffect(()=>{
    if(!selected)return;
    let cancelled=false;
    let timer=null;
    const schedule=()=>{
      if(cancelled)return;
      const delay=matchStatusPollDelay(liveRef.current?.match?.status||selected?.status);
      timer=setTimeout(async()=>{
        if(!cancelled&&document.visibilityState==='visible')await load(selected);
        schedule();
      },delay);
    };
    const onFocus=()=>{if(!cancelled)load(selected)};
    schedule();
    window.addEventListener('focus',onFocus);
    return()=>{cancelled=true;clearTimeout(timer);window.removeEventListener('focus',onFocus)}
  },[selected?.publicId,Boolean(me)]);

  useEffect(()=>()=>clearTimeout(momentTimerRef.current),[]);
  const match=live?.match||selected;
  if(!match)return <div className="pageWrap"><section className="pageHero compact"><h1>No fixtures yet.</h1></section></div>;
  if(liveError&&!live)return <LiveDataState title="Live score unavailable" body={liveError+' No sample score is being shown.'} onRetry={()=>load(selected,{quiet:true})}/>;
  const home=match.home||{code:match.home_code,name:match.home_name,country:'Somalia',score:match.home_score||0};
  const away=match.away||{code:match.away_code,name:match.away_name,country:'Somalia',score:match.away_score||0};
  const homeScore=Number(home.score||0),awayScore=Number(away.score||0);
  const homeActive=Number(live?.counts?.homeActive||0);
  const awayActive=Number(live?.counts?.awayActive||0);
  const activeTotal=homeActive+awayActive;
  const homeSupportPct=activeTotal?Math.round(homeActive*100/activeTotal):0;
  const awaySupportPct=activeTotal?100-homeSupportPct:0;
  const scoreTotal=homeScore+awayScore;
  const homeScorePct=scoreTotal?Math.round(homeScore*100/scoreTotal):0;
  const awayScorePct=scoreTotal?100-homeScorePct:0;
  const leader=homeScore===awayScore?null:(homeScore>awayScore?home:away);
  const trailing=homeScore===awayScore?null:(homeScore>awayScore?away:home);
  const leadMargin=Math.abs(homeScore-awayScore);
  const directAssists=Number(mine?.assists??mine?.direct_joins??0);
  const branchTotal=Number(mine?.downstream_joins||0);
  const extendedBranch=Math.max(0,Number(mine?.indirect_joins??(branchTotal-directAssists)));
  const benchFilled=Math.min(3,directAssists);
  const commentary=(live?.activity||[]).slice(0,5);
  const join=async()=>{if(!me){onNeedIdentity();return}setBusy(true);setMsg('');try{const inviteToken=new URLSearchParams(window.location.search).get('invite')||'';const d=await api(`/api/matches/${match.publicId}/join`,{method:'POST',body:JSON.stringify({inviteToken})});setMine(d.participation);setMsg(d.created?'Place reserved.':'You are already registered.');await load(match)}catch(e){setMsg(humanError(e,'We could not reserve your place. Try again.'))}finally{setBusy(false)}};
  const activate=async()=>{setBusy(true);setMsg('');try{const d=await api(`/api/matches/${match.publicId}/activate`,{method:'POST',body:'{}'});setMsg(d.goalAdded?'GOAL — your verified entry moved the score.':'Your Goal is already counted.');await load(match)}catch(e){setMsg(humanError(e,'We could not count your Goal. Try again.'))}finally{setBusy(false)}};
  const copyLink=async()=>{const token=mine?.share_token||mine?.shareToken;if(!token)return false;const from=encodeURIComponent(me?.user?.nickname||me?.user?.displayName||'');const previewBase=window.location.pathname.startsWith('/preview')?'/preview':'';const url=`${window.location.origin}${previewBase}/?match=${match.publicId}&invite=${token}${from?'&from='+from:''}`;try{await navigator.clipboard.writeText(url);setBenchPulse(v=>v+1);setMsg('Match invite copied — bring one more person in.');return true}catch{setMsg(url);return false}};
  const myMatchCity=me?.membership?.code===home.code?home:me?.membership?.code===away.code?away:null;
  const shareMoment=async(type)=>{
    const city=myMatchCity||leader||home;
    const presets={
      callup:{eyebrow:'MATCH CALL-UP',title:`${city.name.toUpperCase()} NEEDS YOU`,subtitle:`${home.name} ${homeScore} — ${awayScore} ${away.name}`,footer:'Join my city in the Somali Cup match'},
      goal:{eyebrow:'GOAL · VERIFIED',title:'I SCORED FOR MY CITY',subtitle:`${city.name} · Somali Cup 2027`,footer:'One verified supporter. One goal.'},
      assist:{eyebrow:'ASSIST · VERIFIED',title:'I BROUGHT MY PEOPLE',subtitle:`${directAssists} direct ${directAssists===1?'Assist':'Assists'} · Branch ${branchTotal}`,footer:extendedBranch?`${extendedBranch} more came through my chain`:`${city.name} is stronger together`},
      fulltime:{eyebrow:'FULL TIME',title:`${(match.winner?.name||leader?.name||city.name).toUpperCase()}`,subtitle:`${home.code} ${homeScore} — ${awayScore} ${away.code}`,footer:'Somali Cup · The city story continues'}
    };
    try{
      const result=await sharePoster({city,...presets[type],fromName:me?.user?.nickname||me?.user?.displayName||'',refPublicId:me?.user?.publicId||''});
      setMsg(shareResultMessage(result));
    }catch{setMsg('Could not create poster on this device.')}
  };

  return <div className="matchExperience">
    {liveError&&live&&<div className="liveRecoveryBanner"><AlertTriangle size={15}/><div><b>Live refresh interrupted</b><span>{liveError}{lastLiveAt?` · Last verified update ${lastLiveAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:''}</span></div><button onClick={()=>load(selected,{quiet:true})}>Retry</button></div>}
    <section className="broadcastHero">
      <div className={`matchSide homeSide ${scoreMoment?.code===home.code?'scoredNow':''}`} style={{backgroundImage:`linear-gradient(90deg,rgba(0,15,30,.3),rgba(1,8,18,.92)),url("${imgFor(home)}")`}}><CityThumb city={home} size="lg"/><h2>{home.name}</h2><small>{home.code}</small></div>
      <div className="scoreBoard"><div className={"liveBadge "+(match.status==='LIVE'?'red':'')}><span/> {match.tiebreakMode==='SUDDEN_DEATH'?'SUDDEN DEATH':match.status}</div><small>{match.roundCode||match.round_code}</small><strong><MotionNumber value={home.score}/> <em>–</em> <MotionNumber value={away.score}/></strong><span className="matchClock">{match.tiebreakMode==='SUDDEN_DEATH'?'NEXT VERIFIED GOAL WINS':match.status==='LIVE'?'VERIFIED SCORE':match.status==='LOBBY'?'LOBBY OPEN':match.status==='SCHEDULED'?'UPCOMING':match.status}</span>{scoreMoment&&<div className="scoreMoment"><span>VERIFIED GOAL</span><b>{scoreMoment.city} scored.</b><small>{scoreMoment.message}</small></div>}</div>
      <div className={`matchSide awaySide ${scoreMoment?.code===away.code?'scoredNow':''}`} style={{backgroundImage:`linear-gradient(270deg,rgba(0,15,30,.3),rgba(1,8,18,.92)),url("${imgFor(away)}")`}}><CityThumb city={away} size="lg"/><h2>{away.name}</h2><small>{away.code}</small></div>
    </section>
    <section className="supportMeter"><div><b>{homeSupportPct}%</b><span>{fmt(homeActive)} active</span></div><div className="meterTrack"><i style={{width:`${homeSupportPct}%`}}/><em style={{width:`${awaySupportPct}%`}}/></div><div><b>{awaySupportPct}%</b><span>{fmt(awayActive)} active</span></div></section>

    <section className="matchNextAction">
      <div className="nextActionCopy">
        <small>YOUR NEXT MOVE</small>
        {!me?<><h3>Choose your city first.</h3><p>Your city identity decides which side you can represent in Somali Cup.</p></>:
        !myMatchCity?<><h3>Taking you to your city’s match.</h3><p>Every active city has a current Somali Cup fixture.</p></>:
        !mine?<><h3>Join {myMatchCity.name} in this match.</h3><p>Reserve your place. When it goes live, your verified entry scores 1 Goal.</p></>:
        mine.status==='REGISTERED'&&match.tiebreakMode==='SUDDEN_DEATH'?<><h3>Enter now. Win it.</h3><p>The next verified Goal ends the match. Your one Goal can decide it for {myMatchCity.name}.</p></>:
        mine.status==='REGISTERED'&&match.status==='LIVE'?<><h3>Enter now. Score once.</h3><p>Your verified entry scores exactly 1 Goal for {myMatchCity.name}.</p></>:
        mine.status==='REGISTERED'?<><h3>Your place is reserved.</h3><p>Use your personal link to bring your city into the lobby before kickoff.</p></>:
        match.status==='FINAL'?<><h3>Full time. Share the result.</h3><p>Turn the finish into the next Somali Cup moment.</p></>:
        match.tiebreakMode==='SUDDEN_DEATH'?<><h3>Your Goal is in. Call the winner.</h3><p>One unused supporter Goal can end this match. Bring your city in now.</p></>:
        <><h3>Your Goal is in. Go for the Assist.</h3><p>Bring one person through your link. If they join, you get the Assist and they score their own Goal.</p></>}
      </div>
      <div className="nextActionButton">
        {!me?<button className="goldBtn" onClick={onNeedIdentity}>CHOOSE MY CITY <ArrowRight size={16}/></button>:
        !myMatchCity?<button className="goldBtn" onClick={()=>{const own=matches.find(m=>m.home?.code===me?.membership?.code||m.away?.code===me?.membership?.code);if(own)setSelected(own)}}>OPEN MY CITY MATCH <ArrowRight size={16}/></button>:
        !mine?<button className="goldBtn" disabled={busy} onClick={join}>{busy?'Joining…':'JOIN THIS MATCH'} <ArrowRight size={16}/></button>:
        mine.status==='REGISTERED'&&match.tiebreakMode==='SUDDEN_DEATH'?<button className="goldBtn suddenDeathCta" disabled={busy} onClick={activate}>{busy?'Entering…':'ENTER & WIN IT'} <Zap size={16}/></button>:
        mine.status==='REGISTERED'&&match.status==='LIVE'?<button className="goldBtn" disabled={busy} onClick={activate}>{busy?'Entering…':'ENTER & SCORE'} <Play size={16}/></button>:
        mine.status==='REGISTERED'?<button className="goldBtn" onClick={copyLink}><Share2 size={16}/> CALL MY CITY</button>:
        match.status==='FINAL'?<button className="goldBtn" onClick={()=>shareMoment('fulltime')}><Share2 size={16}/> SHARE RESULT</button>:
        <button className={"goldBtn "+(match.tiebreakMode==='SUDDEN_DEATH'?'suddenDeathCta':'')} onClick={copyLink}><UserPlus size={16}/> {match.tiebreakMode==='SUDDEN_DEATH'?'CALL THE WINNER':'CALL THE BENCH'}</button>}
      </div>
    </section>

    <div className="matchDepthToggle"><button onClick={()=>setShowMatchDepth(v=>!v)}>{showMatchDepth?'Hide live detail':'See live match detail'} <ChevronRight size={14}/></button></div>
    {(showMatchDepth||mine?.status==='ACTIVE'||match.status==='FINAL')&&<>
    <section className={"matchNarrative "+(leader?'hasLeader':'level')}>
      <div className="narrativeState">
        <span className="statePulse"/>
        <small>MATCH STATE</small>
        <h3>{match.tiebreakMode==='SUDDEN_DEATH'?'Sudden death — next Goal wins':leader?`${leader.name} lead by ${leadMargin}`:'Level match — next goal changes everything'}</h3>
        <p>{match.tiebreakMode==='SUDDEN_DEATH'?'Regulation ended level. The next unused verified supporter Goal ends the match.':leader?`${trailing.name} need a response. The next verified Goal changes the match.`:'The score is level. The next verified Goal breaks the deadlock.'}</p>
      </div>
      <div className="pressureBattle">
        <div className="pressureCity home"><span>{home.code}</span><b>{homeScore}</b><i style={{height:`${homeScorePct}%`}}/></div>
        <div className="pressureCore"><Zap size={17}/><strong>SCORE PRESSURE</strong><small>Verified Goal balance</small></div>
        <div className="pressureCity away"><span>{away.code}</span><b>{awayScore}</b><i style={{height:`${awayScorePct}%`}}/></div>
      </div>
      <div className="nextMoment">
        <small>NEXT MOMENT</small>
        <strong>{match.tiebreakMode==='SUDDEN_DEATH'?'Match-winning Goal':leader?`${trailing.name} comeback window`:'First breakthrough'}</strong>
        <span>Goal · Assist · Branch</span>
      </div>
    </section>

    <section className="verifiedActivityPanel">
      <div className="panelHead"><div><small>VERIFIED MATCH ACTIVITY</small><h3>{commentary.length?'Goals happening now':'Waiting for the first verified Goal'}</h3></div><ShieldCheck/></div>
      <div className="verifiedActivityFeed">
        {commentary.length?commentary.map((a,i)=><div key={a.id||i}>
          <span className={a.city_code===home.code?'activitySide home':'activitySide away'}>{a.city_code||'SC'}</span>
          <div><b>{a.nickname||a.display_name||'Supporter'}</b><p>{a.type==='GOAL'?'scored a verified Goal for '+(a.city_name||a.city_code)+'.':a.type==='ASSIST'?'earned a verified Assist for '+(a.city_name||a.city_code)+'.':'created a verified match event for '+(a.city_name||a.city_code)+'.'}</p></div>
          <time>{a.created_at?new Date(a.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):''}</time>
        </div>):<div className="truthEmpty"><ShieldCheck size={19}/><div><b>No verified scoring events yet.</b><p>When a supporter enters and scores, it will appear here.</p></div></div>}
      </div>
    </section>
    <section className="benchAndCommentary">
      <div className="callBenchCard">
        <div className="benchHead"><div><small>CALL THE BENCH</small><h3>Bring 3 people into your squad.</h3></div><UserPlus size={22}/></div>
        <p>Share your match link. If someone joins through you and scores their verified Goal, that is your Assist. If they bring others, your Branch grows.</p>
        {mine&&<div className="matchBranchBreakdown">
          <div><span>DIRECT ASSISTS</span><strong>{fmt(directAssists)}</strong></div>
          <i/>
          <div><span>MORE THROUGH YOUR CHAIN</span><strong>{fmt(extendedBranch)}</strong></div>
          <i/>
          <div className="branchTotal"><span>YOUR BRANCH</span><strong>{fmt(branchTotal)}</strong></div>
        </div>}
        <div className="benchSlots">
          {[0,1,2].map(i=><div key={i} className={i<benchFilled?'filled':''}>{i<benchFilled?<><Check size={17}/><span>IN</span></>:<><UserPlus size={17}/><span>OPEN</span></>}</div>)}
        </div>
        <div className="benchFooter"><div><b>{benchFilled}/3</b><span>bench called</span></div>{mine?<button className="goldBtn" onClick={copyLink}><Share2 size={15}/> Call the Bench</button>:<button className="glassBtn" onClick={onNeedIdentity}>Join your city first</button>}</div>
        {benchPulse>0&&<small className="benchHint">Link ready. Share it on WhatsApp or WhatsApp Status.</small>}
      </div>

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
    {matchAssistMoment&&<MatchAssistMoment moment={matchAssistMoment} onCall={copyLink} onDone={()=>setMatchAssistMoment(null)}/>}
    {msg&&<div className="matchMsg">{msg}</div>}
  </div>
}

function MatchAssistMoment({moment,onCall,onDone}){
  const [copying,setCopying]=useState(false);
  const [copied,setCopied]=useState(false);
  const callAgain=async()=>{
    setCopying(true);
    try{setCopied(Boolean(await onCall()))}finally{setCopying(false)}
  };
  const assists=Number(moment?.assists||0);
  const branch=Number(moment?.branch||0);
  const indirect=Number(moment?.indirect||0);
  return <div className="matchAssistOverlay">
    <CelebrationParticles tone="gold"/>
    <section className="matchAssistCard motionEntrance">
      <div className="matchAssistBadge"><UserPlus size={27}/></div>
      <small>MATCH ASSIST · VERIFIED</small>
      <h2>You got<br/><em>the Assist.</em></h2>
      <p><b>{moment?.latest?.name||'Someone'}</b> entered through your call-up and scored a verified Goal for {moment?.city?.name}.</p>
      <div className="matchAssistImpact">
        <div><span>DIRECT ASSISTS</span><strong><MotionNumber value={assists}/></strong></div>
        <div><span>MORE THROUGH CHAIN</span><strong><MotionNumber value={indirect}/></strong></div>
        <div><span>YOUR BRANCH</span><strong><MotionNumber value={branch}/></strong></div>
      </div>
      <div className="matchAssistMeaning"><Zap size={18}/><div><b>Your call-up changed the match.</b><span>Call one more person. Their verified Goal can become your next Assist.</span></div></div>
      <button className="joinedPrimary" disabled={copying} onClick={callAgain}>{copying?'COPYING…':copied?'MATCH LINK COPIED':'CALL ONE MORE'} <UserPlus size={17}/></button>
      <button className="joinedSecondary" onClick={onDone}>Back to the match</button>
    </section>
  </div>
}

function AssistMoment({moment,city,onDone}){
  const [sharing,setSharing]=useState(false);
  const [shareMsg,setShareMsg]=useState('');
  const assists=Number(moment?.impact?.assists||0);
  const branch=Number(moment?.impact?.branch||0);
  const name=moment?.latest?.name||'Someone';
  const supporterName=moment?.user?.nickname||moment?.user?.displayName||'';
  const share=async()=>{
    setSharing(true);
    try{
      const result=await sharePoster({
        city,
        eyebrow:'ASSIST · VERIFIED',
        title:'I GOT THE ASSIST',
        subtitle:`${name} scored the next Goal for ${city?.name||'my city'}`,
        footer:`${assists} ${assists===1?'Assist':'Assists'} · ${branch} in my Branch — who’s next?`,
        fromName:supporterName,
        refPublicId:moment?.user?.publicId||''
      });
      setShareMsg(shareResultMessage(result));
    }finally{setSharing(false)}
  };
  return <div className="assistMomentOverlay">
    <CelebrationParticles tone="green"/>
    <section className="assistMomentCard motionEntrance">
      <div className="assistIcon"><Check size={28}/></div>
      <small>ASSIST · VERIFIED</small>
      <h2>You got<br/><em>the Assist.</em></h2>
      <p><b>{name}</b> joined through your link and scored a Goal for {city?.name}.</p>
      <div className="assistImpact">
        <div><span>YOUR GOAL</span><strong>1</strong></div>
        <div><span>ASSISTS</span><strong><MotionNumber value={assists}/></strong></div>
        <div><span>BRANCH</span><strong><MotionNumber value={branch}/></strong></div>
      </div>
      <div className="assistNext"><Zap size={18}/><div><b>Keep the chain moving.</b><span>One more person can become your next Assist and their own Goal.</span></div></div>
      <button className="joinedPrimary" disabled={sharing} onClick={share}>{sharing?'CREATING POSTER…':'GO FOR ANOTHER ASSIST'} <Share2 size={17}/></button>
      {shareMsg&&<div className="momentShareResult">{shareMsg}</div>}
      <button className="joinedSecondary" onClick={onDone}>Not now</button>
    </section>
  </div>
}

function JoinedMoment({payload,city,onDone}){
  const [sharing,setSharing]=useState(false);
  const [shareMsg,setShareMsg]=useState('');
  const supporters=Number(city.supporterNumber||city.verified_supporters||0);
  const goalNumber=Number(city.goalNumber||payload.city?.goalNumber||supporters);
  const target=Number(city.qualification_target||500);
  const remaining=Math.max(0,target-supporters);
  const nextNumber=goalNumber+1;
  const supporterName=payload.user?.nickname||payload.user?.displayName||'';
  const milestone=[100,250,500].includes(goalNumber);
  const rivalry=payload.rivalry;
  const rivalryLine=!rivalry?'':rivalry.relation==='LEADING'
    ?`${city.name} leads ${rivalry.rival.name} by ${rivalry.gap} ${rivalry.gap===1?'Goal':'Goals'} — protect the lead.`
    :rivalry.relation==='BEHIND'
      ?`${city.name} is ${rivalry.gap} ${rivalry.gap===1?'Goal':'Goals'} behind ${rivalry.rival.name} — close the gap.`
      :`${city.name} is level with ${rivalry.rival.name} — the next Goal takes the lead.`;
  const share=async()=>{
    setSharing(true);
    try{
      const result=await sharePoster({
        city,
        eyebrow:'I’M IN · SOMALI CUP 2027',
        title:`I REPRESENT ${city.name.toUpperCase()}`,
        subtitle:`${goalNumber?'Goal #'+fmt(goalNumber)+' for '+city.name:'My Goal now counts'}`,
        footer:rivalryLine||(remaining?`I scored Goal #${fmt(goalNumber)} — help ${city.name} score Goal #${fmt(nextNumber)}`:`${city.name} reached its target`),
        fromName:supporterName,
        refPublicId:payload.user?.publicId||''
      });
      setShareMsg(shareResultMessage(result));
    }finally{setSharing(false)}
  };
  return <div className="joinedMomentOverlay">
    <CelebrationParticles tone="gold" fireworks={milestone}/>
    <section className={`joinedMomentCard motionEntrance ${milestone?'milestoneMoment':''}`}>
      <div className="joinedBurst">★</div>
      <small>YOU’RE IN</small>
      <h2>You represent<br/><em>{city.name}.</em></h2>
      <div className="joinedNumber"><span>YOU SCORED</span><strong>GOAL #<MotionNumber value={goalNumber}/></strong><small>for {city.name} · permanently yours</small></div>
      <p>You scored 1 Goal for {city.name}. {rivalryLine||'Now go for the Assist.'}</p>
      <div className="joinedCityStrip"><CityThumb city={city} size="lg"/><div><span>YOUR CITY</span><strong>{city.name}</strong><small>{remaining?fmt(remaining)+' Goals needed to reach the target':'Qualification target reached'}</small></div></div>
      <div className="joinedShareReason"><Share2 size={18}/><div><b>{rivalry?.relation==='LEADING'?`Protect the lead. Make Goal #${fmt(nextNumber)} happen.`:rivalry?.relation==='BEHIND'?`Close the gap. Make Goal #${fmt(nextNumber)} happen.`:rivalry?.relation==='TIED'?`Take the lead. Make Goal #${fmt(nextNumber)} happen.`:`Help ${city.name} score Goal #${fmt(nextNumber)}.`}</b><span>Bring one person through your link. If they join, you get the Assist and they score the next Goal.</span></div></div>
      <button className="joinedPrimary" disabled={sharing} onClick={share}>{sharing?'CREATING POSTER…':`SHARE ${city.name.toUpperCase()}`} <Share2 size={17}/></button>
      {shareMsg&&<div className="momentShareResult">{shareMsg}</div>}
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
      const params=new URLSearchParams(window.location.search);
      const payload=await api('/api/identity/join',{method:'POST',body:JSON.stringify({
        displayName,nickname:'',email:'',cityCode:city.code,
        source:(params.get('src')||'direct').slice(0,24),
        referredBy:(params.get('from')||'').slice(0,80),
        refPublicId:(params.get('ref')||'').slice(0,64),
        deviceKey:deviceKey()
      })});
      onJoined(payload);
    }catch(e){
      if(e?.body?.error==='device_already_registered'){
        const cityName=e.body?.city?.name;
        setError(cityName?`This device already represents ${cityName} this season.`:'This device already has a Somali Cup supporter identity for this season.');
      }else setError(humanError(e,'We could not complete your join. Try again.'))
    }
    finally{setBusy(false)}
  };

  return <div className="joinOverlay simplifiedJoin">
    <div className="joinBackdrop" style={{backgroundImage:`linear-gradient(90deg,rgba(1,7,17,.12),rgba(1,7,17,.95)),url("${imgFor(city||standings[0])}")`}}/>
    <section className="joinPanel">
      <button className="closeBtn" onClick={onClose}><X/></button>
      <Logo/>
      <div className="simpleJoinProgress"><span className={step>=1?'active':''}>1</span><i/><span className={step>=2?'active':''}>2</span><b>{step===1?'Choose your city':'Join your city'}</b></div>

      {step===1&&<>
        <div className="joinTitle"><small>STEP 1 OF 2</small><h2>Which city is yours?</h2><p>Choose once for the season. Your verified join scores 1 Goal.</p></div>
        <div className="simpleCityPicker">
          {standings.map(c=><button key={c.code} className={city?.code===c.code?'selected':''} onClick={()=>setCity(c)}>
            <CityThumb city={c} size="sm"/>
            <div><b>{c.name}</b><small>{fmt(c.verified_supporters)} Goals</small></div>
            <strong>{Number(c.progress_pct||0).toFixed(0)}%</strong>
            {city?.code===c.code&&<i><Check size={13}/></i>}
          </button>)}
        </div>
        <button className="goldBtn full" disabled={!city} onClick={()=>setStep(2)}>CONTINUE WITH {city?.name?.toUpperCase()||'CITY'} <ArrowRight size={16}/></button>
      </>}

      {step===2&&<>
        <div className="joinTitle"><small>STEP 2 OF 2</small><h2>Join {city.name}.</h2><p>Add your name. Then your city gets your Goal.</p></div>
        <div className="joinSelectedCity"><CityThumb city={city} size="lg"/><div><small>YOU ARE JOINING</small><h3>{city.name}</h3><span>{fmt(Math.max(0,Number(city.qualification_target||0)-Number(city.verified_supporters||0)))} Goals needed</span></div></div>
        <label className="singleNameField">Your name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} autoFocus placeholder="Your name"/></label>
        <div className="joinPromise"><ShieldCheck/><span>One city. One season. One Goal from you.</span></div>
        {error&&<div className="errorBox">{error}</div>}
        <div className="joinFooterBtns"><button className="glassBtn" onClick={()=>setStep(1)}>Back</button><button className="goldBtn" disabled={busy||displayName.trim().length<2} onClick={submit}>{busy?'Joining…':`JOIN ${city.name.toUpperCase()}`} <ArrowRight size={16}/></button></div>
        <small className="postJoinPromise">Next: celebrate your Goal and go for the Assist.</small>
      </>}
    </section>
  </div>
}
