import express from 'express';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import type { AppEnv } from './config/env';
import { securityHeaders, corsMiddleware } from './middleware/security';
import { createApiRateLimiter } from './middleware/rate-limit';
import { createRedis } from './lib/redis';
import { createAIProvider } from './providers/provider-factory';
import { SurveyEngine } from './survey/engine';
import { surveyRouter } from './survey/routes';
import { WhatsAppPairingService } from './services/whatsapp-pairing.service';
import { pairingRouter, localPairingOnly } from './routes/pairing.routes';
export function createApp(env: AppEnv) {
 const key=process.env.SURVEY_API_KEY;
 if(!key||key.length<32)throw new Error('SURVEY_API_KEY precisa de pelo menos 32 caracteres');
 if(env.NODE_ENV==='production')throw new Error('Produção bloqueada: este protótipo requer persistência durável, isolamento por tenant e protocolo humano homologado');
 const redis=createRedis(env);
 const engine=new SurveyEngine(path.resolve(process.env.SURVEY_ROOT||'..'),createAIProvider(env));
 const app=express();app.disable('x-powered-by');app.use(securityHeaders());app.use(corsMiddleware(env));app.use(express.json({limit:'32kb'}));
 app.get('/health',(_req,res)=>res.json({ok:true,mode:'development'}));
 const publicDir=path.resolve(__dirname,'../public');
 for(const file of ['conectar-whatsapp.html','pairing.css','pairing.js']) {
  app.get('/'+file,localPairingOnly,(_req,res)=>res.sendFile(path.join(publicDir,file)));
 }
 const pairing=new WhatsAppPairingService();
 app.use('/api',createApiRateLimiter(redis,env),(req,res,next)=>{
  const supplied=Buffer.from(req.get('authorization')||''),expected=Buffer.from(`Bearer ${key}`);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.status(401).json({error:'Não autorizado'});return;}next();
 }, (()=>{const router=express.Router();router.use('/whatsapp/connection',pairingRouter(pairing));router.use(surveyRouter(engine));return router;})());
 app.use((_err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(500).json({error:'Falha interna'});});
 return {app,redis};
}
