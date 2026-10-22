import { Router } from 'express';
import { z } from 'zod';
import { Id } from './schema';
import type { SurveyEngine } from './engine';
export function surveyRouter(engine: SurveyEngine) {
 const router=Router();
 router.post('/surveys',async(req,res)=>{
  const body=z.object({focusId:Id,expectedParticipants:z.number().int().min(1).max(10000)}).strict().safeParse(req.body);
  if(!body.success){res.status(400).json({error:'Pesquisa inválida'});return;}
  try{res.status(201).json(await engine.create(body.data.focusId,body.data.expectedParticipants));}catch{res.status(422).json({error:'Pesquisa ou base inválida/não aprovada'});}
 });
 router.post('/surveys/:id/messages',async(req,res)=>{
  const body=z.object({participantToken:z.string().regex(/^[a-f0-9]{64}$/),messageId:Id,text:z.string().max(4000)}).strict().safeParse(req.body);
  if(!body.success){res.status(400).json({error:'Mensagem inválida'});return;}
  try{res.json(await engine.message(req.params.id,body.data.participantToken,body.data.messageId,body.data.text));}catch{res.status(422).json({error:'Falha no processamento'});}
 });
 router.get('/surveys/:id/report',(req,res)=>{try{res.json(engine.report(req.params.id));}catch{res.status(404).json({error:'Ciclo inexistente'});}});
 return router;
}
