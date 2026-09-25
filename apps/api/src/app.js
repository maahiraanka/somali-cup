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
import competitionRoutes from './routes/competitions.js';
import adminCompetitionRoutes from './routes/adminCompetitions.js';
import adminTestLabRoutes from './routes/adminTestLab.js';
import { getStartupState } from './startupState.js';

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
  version:'0.6.1-force-factory-reset'
}));

app.get('/api/startup',(_req,res)=>{
  const current=getStartupState();
  const status=current.state==='READY'?200:current.state==='FAILED'?500:503;
  res.status(status).json({
    ok:current.state==='READY',
    state:current.state,
    error:current.state==='FAILED'?'database_bootstrap_failed':undefined
  });
});

app.use('/api',(req,res,next)=>{
  if(req.path==='/health'||req.path==='/startup')return next();
  const current=getStartupState();
  if(current.state==='READY')return next();
  return res.status(503).json({error:'service_starting',state:current.state,retry:true});
});

app.use('/api/public',publicRoutes);
app.use('/api/competitions',competitionRoutes);
app.use('/api/identity',identityRoutes);
app.use('/api/qualification',qualificationRoutes);
app.use('/api/matches',matchRoutes);
app.use('/api/analytics',analyticsRoutes);
app.use('/api/tournament',tournamentRoutes);
app.use('/api/admin/auth',adminAuthRoutes);
app.use('/api/admin/awards',awardRoutes);
app.use('/api/admin/competitions',adminCompetitionRoutes);
app.use('/api/admin/test-lab',adminTestLabRoutes);
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
