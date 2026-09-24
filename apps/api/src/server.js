import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './app.js';
import { config } from './config.js';
import { bootstrapDatabase } from './db/bootstrap.js';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const webDist=path.resolve(__dirname,'../../web/dist');

app.use(express.static(webDist,{maxAge:config.env==='production'?'1h':0}));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(webDist,'index.html')));

bootstrapDatabase()
  .then(()=>{
    app.listen(config.port,()=>console.log('Somali Cup API listening on :'+config.port));
  })
  .catch((error)=>{
    console.error('[startup] Somali Cup failed to bootstrap:',error);
    process.exitCode=1;
  });

export default app;
