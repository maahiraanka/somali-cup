import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminApp from './AdminApp';
import './styles.css';
const Root=window.location.pathname.startsWith('/admin')?AdminApp:App;
createRoot(document.getElementById('root')).render(<React.StrictMode><Root/></React.StrictMode>);
