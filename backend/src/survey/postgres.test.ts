import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { PGlite } from '@electric-sql/pglite';
import { PostgresSurveyStore,setupSql, type SqlPool } from './postgres';
import { SurveyEngine } from './engine';
import { decryptJson } from './storage';

test('PostgreSQL: ciclo completo, retomada, replay e artefatos cifrados sem disco local',async()=>{
 process.env.SURVEY_ENCRYPTION_KEY='e'.repeat(64);process.env.SURVEY_ALLOW_DEMO='true';
 const db=new PGlite();await db.exec(setupSql);
 const pool:SqlPool={query:(sql,values)=>db.query(sql,values),connect:async()=>({query:(sql,values)=>db.query(sql,values),release:()=>{}})};
 const folder=path.join(await fs.mkdtemp(path.join(os.tmpdir(),'equilibra-pg-')),'nao-deve-existir');
 const provider={name:'fake',chat:async()=>' {"riskIds":[]}',stream:async function*(){},embeddings:async()=>[]};
 const engine=()=>new SurveyEngine(path.resolve(__dirname,'../../../skills'),provider,folder,new PostgresSurveyStore(pool,'projectA',async()=>{}));
 try{
  let api=engine();const cycle=await api.create('exemplo',5,'operation-1');let mid=0;
  for(const token of cycle.participantTokens){
   await api.start(cycle.cycleId,token);
   const acceptId='accept-'+(++mid);
   await api.message(cycle.cycleId,token,acceptId,'participar');
   api=engine();await api.initialize();
   assert.equal((await api.message(cycle.cycleId,token,acceptId,'participar') as any).duplicate,true);
   await api.message(cycle.cycleId,token,'score-'+(++mid),'8');
   await api.message(cycle.cycleId,token,'text-'+(++mid),'marcador-ficticio-nao-persistir');
   assert.equal((await api.message(cycle.cycleId,token,'skip-'+(++mid),'pular') as any).finished,true);
  }
  api=engine();const report=await api.report(cycle.cycleId);assert.equal(report.published,true);
  assert.equal((await api.create('exemplo',5,'operation-1')).cycleId,cycle.cycleId);
  const result=await db.query<{ciphertext:string}>('SELECT ciphertext FROM equilibra_artifacts WHERE project_id=$1',['projectA']);
  assert.equal(result.rows.length,6);
  for(const row of result.rows){assert.ok(row.ciphertext.includes('AES-256-GCM'));assert.ok(!JSON.stringify(decryptJson(row.ciphertext,Buffer.from('e'.repeat(64),'hex'))).includes('marcador-ficticio'));}
  await assert.rejects(fs.access(folder));
  const other=new SurveyEngine(path.resolve(__dirname,'../../../skills'),provider,folder,new PostgresSurveyStore(pool,'projectB',async()=>{}));
  await assert.rejects(other.report(cycle.cycleId),/não encontrada/);
  const first=new PostgresSurveyStore(pool,'race',async()=>{}),second=new PostgresSurveyStore(pool,'race',async()=>{});
  await first.load();await second.load();await first.commit('cipher-one',[]);
  await assert.rejects(second.commit('cipher-two',[]),/outro processo/);
  assert.equal(await second.load(),'cipher-one');
 }finally{await db.close();}
});
