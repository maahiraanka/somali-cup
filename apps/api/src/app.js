import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { config } from './config.js';
import publicRoutes from './routes/public.js';
import identityRoutes from './routes/identity.js';
import qualificationRoutes from './routes/qualification.js';
import adminRoutes from './routes/admin.js';
import matchRoutes from './routes/matches.js';
import analyticsRoutes from './routes/analytics.js';
import tournamentRoutes from './routes/tournament.js';
import adminTournamentRoutes from './routes/adminTournament.js';
import adminAuthRoutes from './routes/adminAuth.js';
import awardRoutes from './routes/awards.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:false}));
app.use(compression());
app.use(express.json({limit:'256kb'}));

if(config.env!=='production'){
  app.use(cors({origin:config.appOrigin,credentials:true}));
}

app.get('/api/health',(_req,res)=>res.json({
  ok:true,
  service:'somali-cup-api',
  version:'0.3.1-vercel-staging-adapter'
}));

app.use('/api/public',publicRoutes);
app.use('/api/identity',identityRoutes);
app.use('/api/qualification',qualificationRoutes);
app.use('/api/matches',matchRoutes);
app.use('/api/analytics',analyticsRoutes);
app.use('/api/tournament',tournamentRoutes);
app.use('/api/admin/auth',adminAuthRoutes);
app.use('/api/admin/awards',awardRoutes);
app.use('/api/admin/tournament',adminTournamentRoutes);
app.use('/api/admin',adminRoutes);

app.use('/api',(req,res)=>res.status(404).json({error:'api_not_found'}));

app.use((err,_req,res,_next)=>{
  console.error(err);
  res.status(500).json({
    error:'internal_error',
    detail: process.env.NODE_ENV==='production' ? undefined : err.message
  });
});

export default app;
