import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import ComingSoon from './ComingSoon';
import './styles.css';
const path=window.location.pathname;
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
  return mode==='LIVE'?<App/>:<ComingSoon/>;
}
const Root=path.startsWith('/admin')?AdminApp:path.startsWith('/preview')?App:PublicRoot;
if(path.startsWith('/admin')||path.startsWith('/preview')){
  const robots=document.createElement('meta');
  robots.name='robots';
  robots.content='noindex,nofollow,noarchive';
  document.head.appendChild(robots);
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Root/></React.StrictMode>);
