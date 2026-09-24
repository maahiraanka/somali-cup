import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { config } from './config.js';
import { bootstrapDatabase } from './db/bootstrap.js';
import { startLifecycleTimer, syncMatchLifecycle } from './matchLifecycle.js';
import { markStartupFailed, markStartupReady } from './startupState.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const webDist=path.resolve(__dirname,'../../web/dist');

app.use((req,res,next)=>{
  if(req.path.startsWith('/preview')||req.path.startsWith('/admin')){
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  }
  next();
});

app.use(express.static(webDist,{maxAge:config.env==='production'?'1h':0}));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(webDist,'index.html')));

const server=app.listen(config.port,()=>{
  console.log('Somali Cup API listening on :'+config.port);
});

bootstrapDatabase()
  .then(async()=>{
    markStartupReady();
    await syncMatchLifecycle().catch(e=>console.error('[lifecycle] initial sync failed',e));
    startLifecycleTimer();
    console.log('[startup] database ready');
  })
  .catch((error)=>{
    markStartupFailed(error);
    console.error('[startup] database bootstrap failed:',error);
  });

process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));

export default app;
