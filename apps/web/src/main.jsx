import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import ComingSoon from './ComingSoon';
import './styles.css';
const path=window.location.pathname;
const Root=path.startsWith('/admin')?AdminApp:path.startsWith('/preview')?App:ComingSoon;
if(path.startsWith('/admin')||path.startsWith('/preview')){
  const robots=document.createElement('meta');
  robots.name='robots';
  robots.content='noindex,nofollow,noarchive';
  document.head.appendChild(robots);
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Root/></React.StrictMode>);
