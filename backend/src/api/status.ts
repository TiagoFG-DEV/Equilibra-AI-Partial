import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { loadClients } from './clients';
import type { AppEnv } from '../config/env';
import { resolveSurveyRoot } from '../config/paths';

export function statusPayload(ready:boolean){
 let auth=false;try{loadClients(process.env as unknown as AppEnv);auth=true;}catch{}
 const storage=process.env.SURVEY_STORAGE||'file';
 const checks=[
  {label:'Chave de acesso configurada',ok:auth},
  {label:'Chave de cifragem configurada',ok:/^[a-f0-9]{64}$/i.test(process.env.SURVEY_ENCRYPTION_KEY||'')},
  {label:'Referências e pesquisas disponíveis',ok:existsSync(path.join(resolveSurveyRoot(),'focus'))&&existsSync(path.join(resolveSurveyRoot(),'database'))},
  {label:'Configuração de armazenamento presente',ok:storage==='postgres'?!!process.env.SURVEY_DATABASE_URL:process.env.NODE_ENV!=='production'||!!process.env.SURVEY_OUTPUT_DIR},
  {label:'Estado recuperado e API pronta',ok:ready},
 ];
 return {apiReady:ready,mode:ready?'sandbox':'diagnostic',storage,nodeVersion:process.version,checks};
}
export function mountStatus(app:express.Express,isReady:()=>boolean){
 const directory=path.resolve(__dirname,'../../public');
 app.get('/',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(directory,'status.html')));
 for(const file of ['status.css','status.js'])app.get('/'+file,(_req,res)=>res.sendFile(path.join(directory,file)));
 app.get('/status.json',(_req,res)=>res.set('Cache-Control','no-store').json(statusPayload(isReady())));
}
export function diagnosticApp(){
 const app=express();app.disable('x-powered-by');mountStatus(app,()=>false);
 app.get('/health',(_req,res)=>res.json({ok:true,apiReady:false,mode:'diagnostic'}));
 app.get('/ready',(_req,res)=>res.status(503).json({ready:false}));
 app.use((_req,res)=>res.status(503).json({error:{code:'CONFIGURATION_REQUIRED',message:'Serviço ativo em diagnóstico. Corrija as configurações no Render; a API permanece bloqueada.'}}));
 return app;
}
