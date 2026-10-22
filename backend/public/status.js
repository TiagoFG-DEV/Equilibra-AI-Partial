'use strict';
async function update(){
 try{
  const response=await fetch('/status.json',{cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error();const status=await response.json();
  const summary=document.getElementById('summary');summary.textContent=status.apiReady?'API pronta para testes. Autenticação obrigatória nas rotas de pesquisa.':'Servidor ativo, mas a API ainda não está pronta. Confira as pendências abaixo e as variáveis do serviço no Render.';
  summary.className=status.apiReady?'ready':'';
  const list=document.getElementById('checks');list.replaceChildren();
  for(const item of status.checks){const row=document.createElement('li');row.className=item.ok?'ok':'pending';row.textContent=(item.ok?'OK — ':'Pendente — ')+item.label;list.append(row);}
  document.getElementById('runtime').textContent='Armazenamento: '+status.storage+' · Node '+status.nodeVersion;
  document.getElementById('updated').textContent='Verificado em '+new Date().toLocaleTimeString('pt-BR');
 }catch{document.getElementById('summary').textContent='Não foi possível consultar o serviço. Ele pode estar reiniciando ou despertando no Render.';}
 setTimeout(update,15000);
}
update();
