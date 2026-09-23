import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import publicRoutes from './routes/public.js';
import identityRoutes from './routes/identity.js';
import qualificationRoutes from './routes/qualification.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(compression());
app.use(express.json({limit:'256kb'}));
if(config.env!=='production') app.use(cors({origin:config.appOrigin,credentials:true}));

app.get('/api/health',(_req,res)=>res.json({ok:true,service:'somali-cup-api',version:'0.2.0-identity-qualification'}));
app.use('/api/public',publicRoutes);
app.use('/api/identity',identityRoutes);
app.use('/api/qualification',qualificationRoutes);
app.use('/api/admin',adminRoutes);

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const webDist=path.resolve(__dirname,'../../web/dist');
app.use(express.static(webDist,{maxAge:config.env==='production'?'1h':0}));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(webDist,'index.html')));
app.use((req,res)=>res.status(404).json({error:'not_found'}));
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'internal_error'});});
app.listen(config.port,()=>console.log(`Somali Cup API listening on :${config.port}`));
