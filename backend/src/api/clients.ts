import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AppEnv } from '../config/env';
const Clients = z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),z.string().min(32)).refine(c=>Object.keys(c).length>0,'Configure pelo menos um projeto');
export function loadClients(env:AppEnv):Record<string,string>{
  let clients:Record<string,string>;
  try{clients=Clients.parse(env.API_CLIENTS_JSON?JSON.parse(env.API_CLIENTS_JSON):env.SURVEY_API_KEY?{default:env.SURVEY_API_KEY}:{});}
  catch{throw new Error('Configure API_CLIENTS_JSON com IDs válidos e chaves distintas de pelo menos 32 caracteres, ou SURVEY_API_KEY');}
  if(new Set(Object.values(clients)).size!==Object.values(clients).length)throw new Error('Cada projeto precisa de uma chave distinta');
  const ids=Object.keys(clients);
  if(new Set(ids.map(id=>id.toLowerCase())).size!==ids.length||ids.some(id=>/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(id)))throw new Error('IDs de projeto devem ser únicos também sem distinção de maiúsculas e não podem usar nomes reservados do sistema');
  return clients;
}
export function authenticate(authorization:string,clients:Record<string,string>):string|undefined{
 const supplied=Buffer.from(authorization);
 for(const [id,key] of Object.entries(clients)){
  const expected=Buffer.from('Bearer '+key);
  if(supplied.length===expected.length&&timingSafeEqual(supplied,expected))return id;
 }
 return undefined;
}
