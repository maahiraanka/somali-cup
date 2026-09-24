import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import ComingSoon from './ComingSoon';
import LegalPage,{PublicFooter} from './Legal';
import './styles.css';
const path=window.location.pathname;

class AppErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null}}
  static getDerivedStateFromError(error){return {error}}
  componentDidCatch(error,info){
    console.error('Somali Cup UI error',error,info);
  }
  render(){
    if(!this.state.error)return this.props.children;
    const admin=window.location.pathname.startsWith('/admin');
    return <div className="fatalRecovery">
      <section>
        <div className="fatalRecoveryMark">!</div>
        <small>{admin?'ADMIN RECOVERY':'PAGE RECOVERY'}</small>
        <h1>This page hit a problem.</h1>
        <p>Your data has not been changed. Return to a safe page and try again.</p>
        <div>
          <button onClick={()=>window.location.assign(admin?'/admin':'/')}>{admin?'BACK TO ADMIN':'BACK TO HOME'}</button>
          <button className="secondary" onClick={()=>window.location.reload()}>RETRY</button>
        </div>
      </section>
    </div>
  }
}
function PublicRoot(){
  const [mode,setMode]=React.useState('COMING_SOON');
  React.useEffect(()=>{
    let cancelled=false;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    fetch('/api/public/runtime',{signal:controller.signal})
      .then(r=>r.ok?r.json():Promise.reject(new Error('runtime_unavailable')))
      .then(d=>{if(!cancelled&&d?.launchMode==='LIVE')setMode('LIVE')})
      .catch(()=>{})
      .finally(()=>clearTimeout(timer));
    return()=>{cancelled=true;controller.abort();clearTimeout(timer)}
  },[]);
  return mode==='LIVE'?<><App/><PublicFooter/></>:<ComingSoon/>;
}
const legalPaths=new Set(['/terms','/privacy','/rules']);
const Root=path.startsWith('/admin')?AdminApp:path.startsWith('/preview')?App:legalPaths.has(path)?()=> <LegalPage path={path}/>:PublicRoot;
if(path.startsWith('/admin')||path.startsWith('/preview')){
  const robots=document.createElement('meta');
  robots.name='robots';
  robots.content='noindex,nofollow,noarchive';
  document.head.appendChild(robots);
}
createRoot(document.getElementById('root')).render(<React.StrictMode><AppErrorBoundary><Root/></AppErrorBoundary></React.StrictMode>);
