import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { config } from './config.js';
import { bootstrapDatabase } from './db/bootstrap.js';
import { startLifecycleTimer, syncMatchLifecycle } from './matchLifecycle.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const webDist=path.resolve(__dirname,'../../web/dist');

let bootstrapState='STARTING';
let bootstrapError=null;

app.get('/api/startup',(_req,res)=>{
  const status=bootstrapState==='READY'?200:bootstrapState==='FAILED'?500:503;
  res.status(status).json({
    ok:bootstrapState==='READY',
    state:bootstrapState,
    error:bootstrapState==='FAILED'?'database_bootstrap_failed':undefined
  });
});

app.use((req,res,next)=>{
  if(req.path.startsWith('/preview')||req.path.startsWith('/admin')){
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  }
  next();
});

app.use((req,res,next)=>{
  if(!req.path.startsWith('/api'))return next();
  if(req.path==='/api/health'||req.path==='/api/startup')return next();
  if(bootstrapState==='READY')return next();
  return res.status(503).json({
    error:'service_starting',
    state:bootstrapState,
    retry:true
  });
});

app.use(express.static(webDist,{maxAge:config.env==='production'?'1h':0}));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(webDist,'index.html')));

const server=app.listen(config.port,()=>{
  console.log('Somali Cup API listening on :'+config.port);
});

bootstrapDatabase()
  .then(async()=>{
    bootstrapState='READY';
    await syncMatchLifecycle().catch(e=>console.error('[lifecycle] initial sync failed',e));
    startLifecycleTimer();
    console.log('[startup] database ready');
  })
  .catch((error)=>{
    bootstrapState='FAILED';
    bootstrapError=error;
    console.error('[startup] database bootstrap failed:',error);
  });

process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));

export default app;
