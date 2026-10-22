const token={type:'string',pattern:'^[a-f0-9]{64}$'};
const id={type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$'};
const body=(properties:object,required:string[])=>({required:true,content:{'application/json':{schema:{type:'object',additionalProperties:false,properties,required}}}});
const errors={400:{description:'Formato inválido'},401:{description:'Chave inválida'},403:{description:'Origem não permitida'},404:{description:'Recurso inexistente ou de outro projeto'},409:{description:'ID de mensagem/chave reutilizado com conteúdo diferente'},413:{description:'Corpo acima do limite'},422:{description:'Pesquisa indisponível'},429:{description:'Limite de requisições'},500:{description:'Falha interna sem conteúdo sensível'},503:{description:'API inicializando'}};
const response=(description:string,schema:object)=>({description,content:{'application/json':{schema}}});
const cycleParameter={in:'path',name:'id',required:true,schema:{type:'string',format:'uuid'}};
const reply={type:'object',properties:{reply:{type:'string'},started:{type:'boolean'},finished:{type:'boolean'},optional:{type:'boolean'},suspended:{type:'boolean'},duplicate:{type:'boolean'}}};
export const openApi={
 openapi:'3.0.3',info:{title:'Equilibra Survey API',version:'1.0.0',description:'API servidor-servidor para pesquisas. Implantação atual de homologação; dados fictícios. Chave por projeto. Estado cifrado em disco, uma instância por volume.'},
 servers:[{url:'/api/v1'}],security:[{BearerAuth:[]}],
 components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer'}},schemas:{Error:{type:'object',properties:{error:{type:'object',properties:{code:{type:'string'},message:{type:'string'},requestId:{type:'string',format:'uuid'}}}}}}},
 paths:{
  '/surveys':{post:{summary:'Criar pesquisa',parameters:[{in:'header',name:'Idempotency-Key',required:true,schema:id}],requestBody:body({focusId:id,expectedParticipants:{type:'integer',minimum:1,maximum:10000}},['focusId','expectedParticipants']),responses:{...errors,201:response('Ciclo criado ou repetição da mesma criação',{type:'object',properties:{cycleId:{type:'string',format:'uuid'},participantTokens:{type:'array',items:token},openingMessage:{type:'string'},privacyNotice:{type:'string'},demo:{type:'boolean'}}})}}},
  '/surveys/{id}/start':{post:{summary:'Obter abertura proativa antes do aceite; transporte deve enviá-la',parameters:[cycleParameter],requestBody:body({participantToken:token},['participantToken']),responses:{...errors,200:response('Abertura ou started=false',reply)}}},
  '/surveys/{id}/messages':{post:{summary:'Processar resposta; messageId é idempotente dentro da participação',parameters:[cycleParameter],requestBody:body({participantToken:token,messageId:id,text:{type:'string',maxLength:4000}},['participantToken','messageId','text']),responses:{...errors,200:response('Resposta do agente; repetição devolve a resposta anterior com duplicate=true',reply)}}},
  '/surveys/{id}/report':{get:{summary:'Consultar conclusão e relatório coletivo protegido',parameters:[cycleParameter],responses:{...errors,200:response('Relatório nulo até conclusão e grupo mínimo',{type:'object',properties:{complete:{type:'boolean'},published:{type:'boolean'},report:{type:'object',nullable:true,additionalProperties:true}}})}}}
 }
};
