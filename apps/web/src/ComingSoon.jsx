import React from 'react';
import {Globe2,Sparkles,Trophy} from 'lucide-react';
import {PublicFooter} from './Legal';

export default function ComingSoon(){
  return <main className="comingSoonPage">
    <div className="comingSoonAmbient" aria-hidden="true"><i/><i/><i/><span/><span/></div>
    <section className="comingSoonShell">
      <header className="comingSoonHeader">
        <div className="comingSoonBrand">
          <div className="comingSoonMark"><Trophy size={20}/></div>
          <div><strong>SOMALI CUP</strong><small>Different cities. One people.</small></div>
        </div>
        <div className="comingSoonPill"><span/> BUILDING THE CUP</div>
      </header>

      <div className="comingSoonHero">
        <div className="comingSoonKicker"><Sparkles size={14}/> SOMALI CUP 2027</div>
        <h1>THE CITIES<br/><em>ARE COMING.</em></h1>
        <p>Somalia’s cities will compete. Communities will rally. One Cup will bring everyone together.</p>

        <div className="comingSoonStatus">
          <div>
            <span>COMING SOON</span>
            <strong>Somali Cup</strong>
            <small>A new nationwide digital city competition.</small>
          </div>
          <div className="comingSoonOrb"><Globe2 size={30}/><span>SOMALIA</span></div>
        </div>

        <div className="comingSoonLine"><i/><span>Qualification · Rivalry · Match Day · The Road to the Cup</span><i/></div>
      </div>

      <div className="comingSoonFooterWrap">
        <footer className="comingSoonFooter">
          <span>© 2027 Somali Cup</span>
          <b>Different cities. One people.</b>
        </footer>
        <PublicFooter/>
      </div>
    </section>
  </main>
}
