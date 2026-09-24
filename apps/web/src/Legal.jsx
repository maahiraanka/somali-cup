import React from 'react';
import {ArrowLeft,ShieldCheck,Trophy} from 'lucide-react';

const docs={
  '/terms':{
    kicker:'TERMS OF USE',
    title:'Somali Cup Terms',
    intro:'These terms explain the basic conditions for using Somali Cup.',
    sections:[
      ['What Somali Cup is','Somali Cup is a digital city-support competition. Participants choose one eligible city for a season and verified participation may contribute to that city’s competition total.'],
      ['Your account and participation','Use accurate information and participate as yourself. One person must not create multiple identities, manipulate devices, automate participation, or attempt to generate false Goals, Assists or match activity.'],
      ['Fair play','Somali Cup may review suspicious activity, reject invalid participation, correct technical errors, suspend access, or remove activity that breaches competition rules.'],
      ['Availability','We work to keep Somali Cup available and accurate, but online services can be interrupted. Where live verified data cannot be loaded, Somali Cup may show an unavailable state instead of estimated or invented results.'],
      ['Changes','Competition features, schedules and these terms may change where reasonably required. Material competition-rule changes should be published before they take effect where practical.'],
      ['Responsibility','Participants are responsible for their own device, connectivity and use of shared links. Do not misuse Somali Cup, interfere with the service, or attempt to access another person’s account or restricted administration areas.']
    ]
  },
  '/privacy':{
    kicker:'PRIVACY',
    title:'Privacy at Somali Cup',
    intro:'This page explains the information Somali Cup uses to run the competition and protect its integrity.',
    sections:[
      ['Information we use','Somali Cup may process information you submit, such as your name, nickname, email where provided, chosen city, participation activity, referral relationships and match participation.'],
      ['Device and integrity information','To help enforce one-person participation and detect abuse, Somali Cup may create security hashes derived from device, session, network or browser information. Raw security data is not displayed publicly.'],
      ['How information is used','Information is used to provide supporter identity, count verified Goals, calculate Assists and Branch impact, operate matches, recover sessions, investigate integrity signals, improve the service and maintain audit records.'],
      ['Public information','Competition totals, city standings and selected supporter-facing competition moments may be public. Private account or security information is not intended to be publicly exposed.'],
      ['Retention and security','Records may be retained where needed for competition integrity, security, dispute handling and operational history. Reasonable technical controls are used to protect stored information.'],
      ['Your choices','You can choose not to participate. If a privacy or account issue requires review, use the official Somali Cup contact channel published by the operator.']
    ]
  },
  '/rules':{
    kicker:'COMPETITION RULES',
    title:'How Somali Cup Works',
    intro:'The core rules are designed to keep the competition simple, understandable and fair.',
    sections:[
      ['One verified person = one Goal','A verified person joining an eligible city contributes exactly one Goal to that city’s qualification total for the season.'],
      ['One city per season','A supporter represents one city for the active season. Creating extra identities or changing devices to represent multiple cities is not allowed.'],
      ['Assists do not create extra city Goals','An Assist is credited when another verified person joins through your personal link. The referred person’s verified participation creates their one Goal; the Assist itself does not add another city Goal.'],
      ['Branch impact','Branch measures verified downstream participation connected to a supporter’s referral chain. It is recognition of reach, not an extra city score.'],
      ['Match Goals','In an eligible match, a verified supporter can activate one match Goal for their city. Repeated activation must not create additional score.'],
      ['Match Assists','A match Assist may be credited when a verified supporter joins or activates through another supporter’s valid match invitation, subject to the match rules.'],
      ['Match result','Group-stage matches may allow draws where configured. Knockout or Final matches may use sudden death, where the next verified Goal after a regulation tie wins.'],
      ['Integrity and corrections','Duplicate identities, automation, manipulation, invalid referrals or other abusive activity may be blocked or removed. Technical corrections may be made where verified competition truth requires them.'],
      ['Schedules and progression','Published fixture times and tournament progression are authoritative once confirmed in Somali Cup. Qualification structure and later tournament stages may be published separately.']
    ]
  }
};

export function PublicFooter(){
  return <footer className="publicLegalFooter">
    <span>© 2027 Somali Cup · Different cities. One people.</span>
    <nav><a href="/rules">Competition Rules</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
  </footer>
}

export default function LegalPage({path=window.location.pathname}){
  const doc=docs[path]||docs['/terms'];
  return <main className="legalPage">
    <div className="legalGlow"/>
    <header className="legalTop">
      <a href="/" className="legalBrand"><span><Trophy size={18}/></span><b>SOMALI CUP</b></a>
      <a href="/" className="legalBack"><ArrowLeft size={14}/> Back to Somali Cup</a>
    </header>
    <article className="legalDoc">
      <div className="legalTitle"><small>{doc.kicker}</small><h1>{doc.title}</h1><p>{doc.intro}</p></div>
      <div className="legalRule"><ShieldCheck size={18}/><span>Fair competition. Verified participation. Clear rules.</span></div>
      {doc.sections.map(([title,body])=><section key={title}><h2>{title}</h2><p>{body}</p></section>)}
      <div className="legalUpdated">Published for Somali Cup 2027 · Last updated September 2026</div>
    </article>
    <PublicFooter/>
  </main>
}
