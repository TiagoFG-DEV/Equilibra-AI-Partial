import { Router } from 'express';
import { z } from 'zod';
import { Id } from './schema';
import { ApiError } from '../api/errors';
import type { SurveyEngine } from './engine';
export function surveyRouter(engineFor:(clientId:string)=>SurveyEngine) {
 const router=Router();
 const participant=z.string().regex(/^[a-f0-9]{64}$/);
 router.post('/surveys',async(req,res,next)=>{
  try{
   const body=z.object({focusId:Id,expectedParticipants:z.number().int().min(1).max(10000)}).strict().parse(req.body);
   const key=req.get('Idempotency-Key');
   if(!key||!Id.safeParse(key).success)throw new ApiError(400,'IDEMPOTENCY_KEY_REQUIRED','Envie Idempotency-Key com até 80 caracteres alfanuméricos, hífen ou sublinhado');
   res.status(201).json(await engineFor(res.locals.clientId).create(body.focusId,body.expectedParticipants,key));
  }catch(error){next(error);}
 });
 router.post('/surveys/:id/start',async(req,res,next)=>{
  try{const body=z.object({participantToken:participant}).strict().parse(req.body);res.json(await engineFor(res.locals.clientId).start(req.params.id,body.participantToken));}catch(error){next(error);}
 });
 router.post('/surveys/:id/messages',async(req,res,next)=>{
  try{const body=z.object({participantToken:participant,messageId:Id,text:z.string().max(4000)}).strict().parse(req.body);res.json(await engineFor(res.locals.clientId).message(req.params.id,body.participantToken,body.messageId,body.text));}catch(error){next(error);}
 });
 router.get('/surveys/:id/report',async(req,res,next)=>{
  try{res.json(await engineFor(res.locals.clientId).report(req.params.id));}catch(error){next(error);}
 });
 return router;
}
