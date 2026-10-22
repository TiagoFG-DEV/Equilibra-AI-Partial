import express from 'express';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppEnv } from './config/env';
import { securityHeaders, corsMiddleware } from './middleware/security';
import { createApiRateLimiter } from './middleware/rate-limit';
import { createRedis } from './lib/redis';
import { createAIProvider } from './providers/provider-factory';
import type { AIProvider } from './providers/ai-provider.types';
import { SurveyEngine } from './survey/engine';
import { surveyRouter } from './survey/routes';
import { WhatsAppPairingService } from './services/whatsapp-pairing.service';
import { pairingRouter, localPairingOnly } from './routes/pairing.routes';
import { resolveSurveyRoot } from './config/paths';
import { authenticate, loadClients } from './api/clients';
import { ApiError } from './api/errors';
import { openApi } from './api/openapi';

export function createApp(env: AppEnv, options:{provider?:AIProvider}={}) {
 const clients=loadClients(env);
 if(env.NODE_ENV==='production'&&(!env.SURVEY_OUTPUT_DIR||!path.isAbsolute(env.SURVEY_OUTPUT_DIR)))throw new Error('Produção exige SURVEY_OUTPUT_DIR absoluto em disco persistente');
 const root=resolveSurveyRoot(),output=env.SURVEY_OUTPUT_DIR||path.join(root,'survey');
 const redis=createRedis(env),provider=options.provider||createAIProvider(env);
 const engines=new Map(Object.keys(clients).map(id=>[id,new SurveyEngine(root,provider,path.join(output,id))]));
 let initialized=false;
 const ready=Promise.all([...engines.values()].map(e=>e.initialize())).then(()=>{initialized=true;});
 const app=express();app.disable('x-powered-by');
 if(env.TRUST_PROXY_HOPS)app.set('trust proxy',env.TRUST_PROXY_HOPS);
 app.use((_req,res,next)=>{res.locals.requestId=randomUUID();res.setHeader('X-Request-Id',res.locals.requestId);res.setHeader('Cache-Control','no-store');next();});
 app.use(securityHeaders());app.use(corsMiddleware(env));app.use(express.json({limit:'32kb'}));
 app.get('/health',(_req,res)=>res.json({ok:true,apiVersion:'1',dataUse:'sandbox'}));
 app.get('/ready',(_req,res)=>res.status(initialized?200:503).json({ready:initialized}));
 app.get('/openapi.json',(_req,res)=>res.json(openApi));
 const pairingEnabled=env.WHATSAPP_PAIRING_ENABLED?env.WHATSAPP_PAIRING_ENABLED==='true':env.NODE_ENV!=='production';
 const api=express.Router();
 api.use(createApiRateLimiter(redis,env));
 api.use((req,res,next)=>{
  const clientId=authenticate(req.get('authorization')||'',clients);
  if(!clientId){next(new ApiError(401,'UNAUTHORIZED','Chave de API inválida'));return;}
  res.locals.clientId=clientId;
  if(!initialized){next(new ApiError(503,'NOT_READY','Serviço inicializando'));return;}next();
 });
 if(pairingEnabled){
  const publicDir=path.resolve(__dirname,'../public');
  for(const file of ['conectar-whatsapp.html','pairing.css','pairing.js'])app.get('/'+file,localPairingOnly,(_req,res)=>res.sendFile(path.join(publicDir,file)));
  api.use('/whatsapp/connection',pairingRouter(new WhatsAppPairingService()));
 }
 api.use(surveyRouter(id=>engines.get(id)!));
 app.use('/api/v1',api);
 app.use('/api',api); // Compatibilidade: novas integrações usam /api/v1.
 app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND','Rota não encontrada')));
 app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  const bodyError=error as {type?:string};
  const status=error instanceof ApiError?error.status:error instanceof z.ZodError?400:bodyError.type==='entity.too.large'?413:bodyError.type==='entity.parse.failed'?400:(error as NodeJS.ErrnoException).code==='ENOENT'?422:500;
  res.status(status).json({error:{code:error instanceof ApiError?error.code:status===400?'INVALID_REQUEST':status===413?'PAYLOAD_TOO_LARGE':status===422?'INVALID_SURVEY':'INTERNAL_ERROR',message:error instanceof ApiError?error.message:status===500?'Falha interna':status===422?'Pesquisa ou referência não encontrada':'Requisição inválida',requestId:res.locals.requestId}});
 });
 return {app,redis,ready,drain:()=>Promise.all([...engines.values()].map(e=>e.drain()))};
}
