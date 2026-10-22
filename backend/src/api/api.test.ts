import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { createApp } from '../app';
import { loadEnv } from '../config/env';
import { projectRoot } from '../config/paths';
import { decryptJson } from '../survey/storage';

const provider={name:'offline-test',chat:async()=>{throw new Error('offline');},stream:async function*(){},embeddings:async()=>[]};
async function serve(context:ReturnType<typeof createApp>){
 await context.ready;
 const server=await new Promise<Server>(resolve=>{const s=context.app.listen(0,'127.0.0.1',()=>resolve(s));});
 const address=server.address() as {port:number};
 return {server,url:`http://127.0.0.1:${address.port}`};
}
const close=(server:Server)=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));

test('API publicada: autenticação, isolamento, retomada após reinício e idempotência',async()=>{
 const output=await fs.mkdtemp(path.join(os.tmpdir(),'equilibra-api-'));
 const a='a'.repeat(40),b='b'.repeat(40);
 Object.assign(process.env,{NODE_ENV:'production',API_CLIENTS_JSON:JSON.stringify({appA:a,appB:b}),SURVEY_ENCRYPTION_KEY:'c'.repeat(64),SURVEY_OUTPUT_DIR:output,SURVEY_ROOT:path.join(projectRoot,'skills'),SURVEY_ALLOW_DEMO:'true',WHATSAPP_PAIRING_ENABLED:'false',CORS_ORIGINS:'https://frontend.example',REDIS_URL:'',RATE_LIMIT_MAX:'1000',TRUST_PROXY_HOPS:'0'});
 const env=loadEnv();
 let context=createApp(env,{provider}),running=await serve(context);
 const request=async(route:string,key=a,method='GET',body?:unknown,extra:Record<string,string>={})=>{
  const response=await fetch(running.url+route,{method,headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();return {response,data};
 };
 try{
  assert.equal((await request('/health')).response.status,200);
  assert.equal((await request('/ready')).data.ready,true);
  assert.equal((await request('/openapi.json')).data.openapi,'3.0.3');
  assert.equal((await request('/api/v1/surveys/x/report','invalid')).response.status,401);
  assert.equal((await request('/api/v1/surveys/x/report',a,'GET',undefined,{Origin:'https://evil.example'})).response.status,403);
  assert.equal((await request('/conectar-whatsapp.html')).response.status,404);
  const payload={focusId:'exemplo',expectedParticipants:5};
  assert.equal((await request('/api/v1/surveys',a,'POST',payload)).data.error.code,'IDEMPOTENCY_KEY_REQUIRED');
  const created=await request('/api/v1/surveys',a,'POST',payload,{'Idempotency-Key':'cycle-1'});
  assert.equal(created.response.status,201);
  const {cycleId,participantTokens}=created.data,token=participantTokens[0];
  assert.equal((await request('/api/v1/surveys',a,'POST',payload,{'Idempotency-Key':'cycle-1'})).data.cycleId,cycleId);
  assert.equal((await request('/api/v1/surveys',a,'POST',{...payload,expectedParticipants:6},{'Idempotency-Key':'cycle-1'})).response.status,409);
  assert.equal((await request(`/api/v1/surveys/${cycleId}/report`,b)).response.status,404);
  await request(`/api/v1/surveys/${cycleId}/start`,a,'POST',{participantToken:token});
  const message={participantToken:token,messageId:'accept-1',text:'participar'};
  const accepted=await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',message);
  assert.match(accepted.data.reply,/Como você avalia/);
  assert.equal((await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',message)).data.duplicate,true);
  assert.equal((await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',{...message,text:'outra resposta'})).response.status,409);
  const encrypted=await fs.readFile(path.join(output,'appA','.state.enc.json'),'utf8');
  assert.ok(!encrypted.includes(token));assert.ok(!encrypted.includes('factorsCompleted'));
  await close(running.server);await context.drain();
  context=createApp(env,{provider});running=await serve(context);
  const replay=await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',message);
  assert.equal(replay.data.duplicate,true);assert.equal(replay.data.reply,accepted.data.reply);
  assert.equal((await request('/api/v1/surveys',a,'POST',payload,{'Idempotency-Key':'cycle-1'})).data.cycleId,cycleId);
  // Simula falha de commit em disco; o mesmo ID deve poder ser retomado sem perda.
  const statePath=path.join(output,'appA','.state.enc.json');
  await fs.rename(statePath,statePath+'.backup');await fs.mkdir(statePath);
  const rejected=await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',{participantToken:token,messageId:'disk-failure',text:'ajuda'});
  assert.equal(rejected.response.status,500);
  await fs.rmdir(statePath);await fs.rename(statePath+'.backup',statePath);
  const retried=await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',{participantToken:token,messageId:'disk-failure',text:'ajuda'});
  assert.equal(retried.response.status,200);assert.equal(retried.data.duplicate,undefined);
  const next=await request(`/api/v1/surveys/${cycleId}/messages`,a,'POST',{participantToken:token,messageId:'score-1',text:'7; marcador-privado-nao-persistir'});
  assert.equal(next.response.status,200);assert.match(next.data.reply,/Descreva/);
  const state=await fs.readFile(path.join(output,'appA','.state.enc.json'),'utf8');assert.ok(!state.includes('marcador-privado'));
  assert.ok(!JSON.stringify(decryptJson(state,Buffer.from('c'.repeat(64),'hex'))).includes('marcador-privado'));
 }finally{await close(running.server);await context.drain();}
 // Chave de cifragem incorreta deve falhar, nunca apagar ou reiniciar a pesquisa.
 process.env.SURVEY_ENCRYPTION_KEY='d'.repeat(64);
 const invalid=createApp(loadEnv(),{provider});await assert.rejects(invalid.ready,/recuperar estado/);
});
