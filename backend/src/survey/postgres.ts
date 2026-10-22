import { Pool } from 'pg';
import { ApiError } from '../api/errors';

export type Artifact = { cycleId:string; filename:string; content:string };
export interface SurveyBackend {
 load():Promise<string|null>;
 commit(state:string,artifacts:Artifact[]):Promise<void>;
}
type SqlClient={query(sql:string,values?:any[]):Promise<{rows:any[]}>;release():void};
export type SqlPool={query(sql:string,values?:any[]):Promise<{rows:any[]}>;connect():Promise<SqlClient>};
export const setupSql=`CREATE TABLE IF NOT EXISTS equilibra_state (
 project_id text PRIMARY KEY, ciphertext text NOT NULL, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
); CREATE TABLE IF NOT EXISTS equilibra_artifacts (
 project_id text NOT NULL REFERENCES equilibra_state(project_id), cycle_id text NOT NULL, filename text NOT NULL, ciphertext text NOT NULL,
 PRIMARY KEY(project_id,cycle_id,filename)
);`;

export function createPostgres(url:string){
 const parsed=new URL(url);
 if(!['postgres:','postgresql:'].includes(parsed.protocol))throw new Error('SURVEY_DATABASE_URL deve ser uma conexão PostgreSQL');
 const local=['localhost','127.0.0.1','[::1]'].includes(parsed.hostname);
 // SSL estrito: parâmetros da URI não podem sobrescrever rejectUnauthorized.
 for(const field of ['sslmode','sslcert','sslkey','sslrootcert'])parsed.searchParams.delete(field);
 const pool=new Pool({connectionString:parsed.toString(),ssl:local?false:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:15000,idleTimeoutMillis:30000,statement_timeout:20000});
 pool.on('error',()=>console.error('Conexão PostgreSQL interrompida; detalhes sensíveis omitidos.'));
 let setup:Promise<unknown>|undefined;
 return {pool,store:(projectId:string)=>new PostgresSurveyStore(pool,projectId,()=>{if(!setup)setup=pool.query(setupSql);return setup;})};
}

export class PostgresSurveyStore implements SurveyBackend {
 private version=0;
 constructor(private pool:SqlPool,private projectId:string,private setup:()=>Promise<unknown>){}
 async load(){
  await this.setup();
  const result=await this.pool.query('SELECT ciphertext,version FROM equilibra_state WHERE project_id=$1',[this.projectId]);
  this.version=result.rows[0]?.version||0;return result.rows[0]?.ciphertext||null;
 }
 async commit(state:string,artifacts:Artifact[]){
  await this.setup();const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const result=this.version===0
    ?await client.query('INSERT INTO equilibra_state(project_id,ciphertext) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING version',[this.projectId,state])
    :await client.query('UPDATE equilibra_state SET ciphertext=$2,version=version+1,updated_at=now() WHERE project_id=$1 AND version=$3 RETURNING version',[this.projectId,state,this.version]);
   if(!result.rows.length)throw new ApiError(409,'STORAGE_CONFLICT','Estado atualizado por outro processo; repita a mesma operação');
   for(const item of artifacts)await client.query('INSERT INTO equilibra_artifacts(project_id,cycle_id,filename,ciphertext) VALUES($1,$2,$3,$4) ON CONFLICT(project_id,cycle_id,filename) DO UPDATE SET ciphertext=EXCLUDED.ciphertext',[this.projectId,item.cycleId,item.filename,item.content]);
   await client.query('COMMIT');this.version=result.rows[0].version;
  }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}
  finally{client.release();}
 }
}
