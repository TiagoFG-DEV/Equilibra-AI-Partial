import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SurveyEngine } from './engine';
test('consentimento, formato, limite de aprofundamento, conclusão, privacidade e agregação',async()=>{
 process.env.SURVEY_ENCRYPTION_KEY='a'.repeat(64);process.env.SURVEY_ALLOW_DEMO='true';
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'equilibra-test-'));
 await fs.mkdir(path.join(root,'focus'));await fs.mkdir(path.join(root,'database'));
 const repo=path.resolve(__dirname,'../../../');
 await fs.copyFile(path.join(repo,'focus/exemplo.json'),path.join(root,'focus/exemplo.json'));
 await fs.copyFile(path.join(repo,'database/exemplo.json'),path.join(root,'database/exemplo.json'));
 const provider={name:'test',chat:async()=>'{"riskIds":["sobrecarga-demo"]}',stream:async function*(){},embeddings:async()=>[]};
 const engine=new SurveyEngine(root,provider);const cycle=await engine.create('exemplo',5);
 let n=0;const send=(token:string,text:string)=>engine.message(cycle.cycleId,token,'m'+(++n),text) as Promise<any>;
 for(const token of cycle.participantTokens){
  assert.match((await send(token,'7')).reply,/participar/);
  await send(token,'participar');
  assert.match((await send(token,'trabalho 8 horas')).reply,/Responda com número/);
  assert.match((await send(token,'11')).reply,/Responda com número/);
  assert.equal((await send(token,'2,5; comentário privado')).optional,true);
  for(let i=0;i<3;i++)await send(token,'Relato ocupacional privado');
  assert.equal((await send(token,'Condições de trabalho')).optional,undefined);
  assert.equal((await send(token,'pular')).finished,true);
 }
 const report=engine.report(cycle.cycleId);assert.equal(report.published,true);
 const aggregate=JSON.stringify(report);assert.ok(!aggregate.includes('privado'));assert.ok(!aggregate.includes(cycle.participantTokens[0]));
 const saved=await fs.readFile(path.join(root,'survey',cycle.cycleId,'department.json'),'utf8');assert.ok(saved.includes('2.5'));
 const files=await fs.readdir(path.join(root,'survey',cycle.cycleId));assert.equal(files.length,6);
 const individual=await fs.readFile(path.join(root,'survey',cycle.cycleId,files.find(f=>f!=='department.json')!),'utf8');assert.ok(individual.includes('AES-256-GCM'));assert.ok(!individual.includes('questionId'));
});
test('recusa não conclui pesquisa e duplicidade não avança',async()=>{
 const root=path.resolve(__dirname,'../../../');
 const engine=new SurveyEngine(root,{name:'offline',chat:async()=>{throw Error();},stream:async function*(){},embeddings:async()=>[]});
 const c=await engine.create('exemplo',1),t=c.participantTokens[0];
 await engine.message(c.cycleId,t,'a','sair');
 assert.deepEqual(await engine.message(c.cycleId,t,'a','participar'),{duplicate:true});
 assert.equal(engine.report(c.cycleId).complete,false);
});
