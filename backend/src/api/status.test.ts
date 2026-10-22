import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticApp} from './status';
test('página de diagnóstico permanece disponível sem liberar pesquisas ou revelar segredos',async()=>{
 const secret='segredo-nao-deve-ser-publicado-1234567890';process.env.SURVEY_API_KEY=secret;
 const server=diagnosticApp().listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const url='http://127.0.0.1:'+(server.address() as any).port;
 try{
  assert.equal((await fetch(url+'/')).status,200);
  const status=await(await fetch(url+'/status.json')).text();assert.ok(!status.includes(secret));assert.equal(JSON.parse(status).apiReady,false);
  assert.equal((await fetch(url+'/ready')).status,503);
  assert.equal((await fetch(url+'/api/v1/surveys',{method:'POST'})).status,503);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
