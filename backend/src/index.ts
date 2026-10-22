import express from 'express';
import { loadEnv } from './config/env';
import { createApp } from './app';
import { diagnosticApp } from './api/status';

let context:ReturnType<typeof createApp>|undefined;
let active=diagnosticApp();
let stopping=false;
let retry:NodeJS.Timeout|undefined;
let warned=false;
const port=Number(process.env.PORT)||4000;
const shell=express();shell.disable('x-powered-by');
shell.use((req,res,next)=>active(req,res,next));
const server=shell.listen(port,'0.0.0.0',()=>console.log(`Equilibra ouvindo na porta ${port}`));

async function initialize(){
 let candidate:ReturnType<typeof createApp>|undefined;
 try{
  candidate=createApp(loadEnv());await candidate.ready;
  if(stopping){await candidate.close();candidate.redis?.disconnect();return;}
  context=candidate;active=candidate.app;console.log('API pronta para homologação.');
 }catch{
  await candidate?.close().catch(()=>undefined);candidate?.redis?.disconnect();
  if(!warned){console.error('API não pronta: verifique autenticação, cifragem e armazenamento. Diagnóstico disponível na página inicial.');warned=true;}
  if(!stopping)retry=setTimeout(()=>void initialize(),30000);
 }
}
void initialize();
function shutdown(){
 if(stopping)return;stopping=true;if(retry)clearTimeout(retry);
 const timeout=setTimeout(()=>process.exit(1),25000);timeout.unref();
 server.close(async()=>{await context?.close();await context?.redis?.quit().catch(()=>undefined);clearTimeout(timeout);process.exit(0);});
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
