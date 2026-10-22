# Equilibra — motor de pesquisas conversacionais

Serviço TypeScript para integrar pesquisas ocupacionais ao site Equilibra e ao canal WhatsApp, com uma interface local mínima exclusivamente para pareamento. O objetivo é facilitar a coleta e a síntese para o RH, mantendo o controle do roteiro no servidor. A IA classifica indícios dentro de uma base cadastrada; não define notas, não inventa fatos, não decide conformidade e não substitui avaliação profissional.

Este repositório oferece uma API HTTP versionada, publicável no Render para homologação com dados fictícios. `NODE_ENV=production` é aceito quando `SURVEY_OUTPUT_DIR` aponta para um caminho absoluto em volume persistente. O estado das pesquisas é cifrado e recuperado após reinício; cada projeto consumidor tem chave e diretório próprios. A implantação técnica não significa liberação para dados pessoais reais: gestão de direitos após conclusão, retenção, protocolo humano e validação metodológica ainda exigem trabalho. Não existe garantia absoluta de segurança ou conformidade com a LGPD.

## Publicar a API: Render recomendado

A arquitetura suportada nesta versão é **um serviço Node.js no Render, uma única instância e um disco persistente**. O site consumidor pode ficar na Vercel, no próprio Render ou em qualquer outra hospedagem. O backend desse site chama a API por HTTPS. Não coloque a chave de integração no JavaScript entregue ao navegador.

O [Render oferece discos persistentes em serviços pagos](https://render.com/docs/disks); sem disco, arquivos locais são perdidos em reinícios/deploys. O [plano gratuito suspende serviços inativos e não permite disco persistente](https://render.com/docs/free). Por isso o Blueprint `render.yaml` seleciona um serviço pago com disco. Confira o custo no painel antes de criar; nenhum recurso pago foi contratado por este repositório.

### Passo a passo no Render

1. Envie esta versão ao GitHub e entre no [painel do Render](https://dashboard.render.com/).
2. Escolha New → Blueprint, conecte o repositório e a branch desejada. O Render detectará `render.yaml` na raiz. Revise o plano, a região e o disco antes de confirmar.
3. A raiz do projeto deve permanecer a raiz do repositório, não `backend`. O build é `npm ci --include=dev && npm run db:generate && npm run build`; o start é `npm start`. `--include=dev` instala o compilador mesmo com NODE_ENV=production. A geração Prisma produz os tipos exigidos pelos módulos legados, sem conectar ao banco ou executar migrações. O Node é 22. O servidor escuta em `0.0.0.0` e usa a variável `PORT` fornecida pelo Render.
4. Defina `SURVEY_ENCRYPTION_KEY` com exatamente 64 caracteres hexadecimais aleatórios. Gere com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Guarde uma cópia segura: trocar ou perder essa chave impede recuperar o estado existente. Não use a mesma chave da autenticação.
5. Preencha `GROQ_API_KEY` e `GROQ_CHAT_MODEL` com as credenciais e um modelo disponível na sua conta. Para outro provedor, altere `AI_PROVIDER` e configure as variáveis correspondentes do exemplo de ambiente. Não é necessário cadastrar chaves de todos os provedores.
6. Em `CORS_ORIGINS`, coloque as origens exatas autorizadas, separadas por vírgula, como `https://seu-site.vercel.app`. Não inclua caminhos de páginas. Se todas as chamadas forem backend-backend, a ausência de Origin é aceita; CORS não substitui autenticação.
7. O Blueprint gera `SURVEY_API_KEY` para uma integração inicial chamada `default`. Copie a chave do painel para o ambiente privado do backend consumidor. Para vários projetos, configure `API_CLIENTS_JSON` como descrito abaixo; essa variável passa a ter precedência.
8. Preserve `SURVEY_OUTPUT_DIR=/var/data/survey`, o disco montado em `/var/data`, `SURVEY_ROOT=../skills`, `SURVEY_MIN_GROUP=5`, `SURVEY_ALLOW_DEMO=true` e `WHATSAPP_PAIRING_ENABLED=false`. A base de exemplo é demonstrativa; o modo demo não deve receber dados reais.
9. Aguarde o deploy e teste `https://SEU-SERVICO.onrender.com/health`, `/ready` e `/openapi.json`. O health check do Render é `/ready`, que só fica pronto após carregar e decifrar o estado.
10. Faça uma pesquisa fictícia de ponta a ponta. Para verificar persistência, envie algumas respostas, reinicie o serviço e retome com os mesmos IDs e tokens. Teste restauração de backup em ambiente separado antes de qualquer operação real.

Também é possível criar New → Web Service manualmente usando os mesmos comandos, variáveis e disco do Blueprint. A especificação usada está na [documentação de Blueprints do Render](https://render.com/docs/blueprint-spec). Não execute duas réplicas, dois processos Node, PM2 cluster ou um segundo serviço escrevendo no mesmo volume. O armazenamento atual não possui lock distribuído e não suporta escala horizontal.

### Vercel: hospedar o projeto consumidor

Use a Vercel para o frontend e/ou backend do site Equilibra. Nas variáveis privadas desse projeto, defina `EQUILIBRA_API_URL=https://SEU-SERVICO.onrender.com` e `EQUILIBRA_API_KEY=<chave-do-projeto>`. Uma rota do backend na Vercel importa o cliente de exemplo ou usa `fetch` para chamar o Render. Nunca use prefixos públicos como `NEXT_PUBLIC_` ou `VITE_` para a chave.

Não há `vercel.json` ou handler serverless nesta entrega. A API mantém cache e snapshots locais cifrados, e depende de disco persistente. Para executá-la diretamente em Vercel Functions, seria necessário substituir o armazenamento por banco externo transacional, implementar coordenação entre invocações e separar o transporte WhatsApp. Não basta exportar o Express ou gravar em `/tmp`. Consulte os [recursos e limites do runtime Node.js da Vercel](https://vercel.com/docs/functions/runtimes/node-js). A recomendação de Render decorre da persistência/processo desta implementação, não de uma alegação genérica de que a Vercel não oferece WebSockets.

## Contrato público e integração em outros projetos

A URL base é `https://SEU-SERVICO.onrender.com/api/v1`. As rotas antigas `/api` permanecem como alias de compatibilidade, mas novas integrações devem usar `/api/v1`. O arquivo de contrato é servido em `GET /openapi.json` (OpenAPI 3.0.3) e pode ser importado no Postman ou Insomnia. Essa documentação é pública e não contém chaves ou dados de pesquisa.

| Método e caminho | Uso |
| --- | --- |
| `GET /health` | Processo respondendo, versão da API e indicação de sandbox |
| `GET /ready` | Estado carregado; 200 pronto, 503 inicializando |
| `GET /openapi.json` | Contrato de integração |
| `POST /api/v1/surveys` | Criar ciclo com `focusId`, `expectedParticipants` e cabeçalho `Idempotency-Key` |
| `POST /api/v1/surveys/:id/start` | Gerar apresentação proativa com `participantToken` |
| `POST /api/v1/surveys/:id/messages` | Processar `participantToken`, `messageId` e `text` |
| `GET /api/v1/surveys/:id/report` | Consultar conclusão e relatório coletivo, quando publicável |

### Chaves por projeto e autorização

Configure `API_CLIENTS_JSON` no servidor como um objeto JSON de IDs estáveis para segredos distintos, por exemplo `{"equilibra":"<segredo-aleatorio-com-32-ou-mais-caracteres>","outro-projeto":"<outro-segredo-distinto>"}`. Os IDs aceitam letras, números, hífen e sublinhado, com até 64 caracteres. Os valores deste exemplo são placeholders: gere segredos reais e independentes. Se a variável não for preenchida, `SURVEY_API_KEY` configura um único projeto `default`.

O projeto é resolvido pela chave Bearer; o cliente não escolhe tenant por parâmetro, URL ou corpo. Uma chave de outro projeto não encontra ciclos, tokens e relatórios do primeiro. O resultado é 404, sem confirmar a existência do recurso. Alterar o ID de um projeto muda sua partição de disco e não migra dados automaticamente. Para girar uma chave de API, mantenha o ID e substitua apenas o segredo no painel. Não confunda isso com rotação da chave de cifragem, que exige migração dos arquivos.

Cada chave dá acesso de backend ao projeto inteiro, inclusive à criação de convites. Ela não é uma credencial individual de colaborador nem uma permissão de RH. O backend consumidor deve autenticar seus próprios usuários, vincular pesquisas ao departamento e não expor tokens ou chaves ao painel do RH. A base `skills/database` e os roteiros `skills/focus` são administrados pelos desenvolvedores e compartilhados pelos projetos; os estados/resultados são particionados.

### Exemplo de criação por HTTP

```http
POST /api/v1/surveys HTTP/1.1
Authorization: Bearer <chave-privada-do-projeto>
Content-Type: application/json
Idempotency-Key: ciclo-operacoes-2026-10

{"focusId":"exemplo","expectedParticipants":5}
```

A resposta 201 contém `cycleId`, `participantTokens`, `privacyNotice`, `openingMessage` e `demo`. O consumidor deve guardar IDs/tokens no domínio privado de mensageria. Uma mesma chave de criação com o mesmo corpo devolve o mesmo ciclo e os mesmos tokens, inclusive após reinício. A mesma chave com corpo diferente retorna 409. Use nova chave para cada nova pesquisa; não faça cache público dessas respostas.

Para iniciar a conversa, chame `/start` com o token e envie `reply` pelo canal do participante. Depois encaminhe cada resposta para `/messages`. O mesmo `messageId` com o mesmo texto retorna a resposta anterior acrescida de `duplicate: true`; conteúdo diferente com o mesmo ID retorna 409. Isso evita avanço duplicado, mas não representa confirmação de entrega no WhatsApp. O transporte deve controlar o que já enviou, incluindo seu outbox.

### Cliente JavaScript reutilizável

O arquivo `backend/examples/api-client.mjs` exporta `EquilibraClient`, sem dependências externas, para Node.js 20+ e backends com fetch. Pode ser copiado para outro projeto. Exemplo de uso no servidor:

```js
import { EquilibraClient } from './api-client.mjs';
const api = new EquilibraClient(process.env.EQUILIBRA_API_URL, process.env.EQUILIBRA_API_KEY);
const cycle = await api.createSurvey('exemplo', 5, 'ciclo-operacoes-2026-10');
const token = cycle.participantTokens[0];
const invitation = await api.start(cycle.cycleId, token);
// Seu adaptador envia invitation.reply antes de receber o aceite.
const answer = await api.message(cycle.cycleId, token, 'mensagem-original-1', 'participar');
const result = await api.report(cycle.cycleId);
```

Persista a chave de criação e os IDs das mensagens no consumidor. Em timeout, repita a solicitação com a mesma chave/ID e conteúdo. Não gere novo ID para cada retry, pois isso pode duplicar operações. O cliente de exemplo usa timeout de 30 segundos, sem retry automático. A classificação por provedores suportados tem timeout de 15 segundos e fallback; o processamento serializado pode gerar espera adicional sob carga. Não mantenha esse processamento no caminho síncrono de um webhook que exija ACK imediato: valide, enfileire e responda ao provedor antes de consultar o motor.

### Erros e observabilidade

Erros retornam `{"error":{"code":"...","message":"...","requestId":"..."}}`, com o mesmo identificador no cabeçalho `X-Request-Id`. Códigos HTTP: 400 para formato/chave de idempotência ausente, 401 para autenticação, 403 para origem, 404 para recurso inexistente, 409 para conflito de idempotência, 413 para corpo acima de 32 KB, 422 para pesquisa indisponível/não aprovada, 429 para limite de requisições e 500 para falha interna. Não registre corpos, tokens, segredos ou falas para diagnosticar um erro.

Rate limiting usa Redis se `REDIS_URL` estiver configurada; caso contrário usa memória do processo e reinicia com ele. O limite padrão é 100 requisições por minuto por IP. `TRUST_PROXY_HOPS=1` no Blueprint considera um proxy reverso; não use `trust proxy=true` indiscriminadamente. Se adicionar outra CDN/proxy, revise a topologia e o número de saltos. As chamadas usam Bearer e não cookies; CORS autoriza somente origens configuradas e chamadas sem Origin.

### Persistência e limites desta implantação

`SURVEY_OUTPUT_DIR/<projeto>/.state.enc.json` guarda o snapshot cifrado de ciclos, notas, indícios, aceite, tokens aleatórios e recibos de idempotência, sem relatos brutos. Cada mutação é serializada por projeto e confirmada ao cliente somente depois da gravação atômica desse estado. Em falha de gravação, a memória volta ao estado anterior. A escrita usa arquivo temporário, sincronização e rename. Uma chave incorreta ou estado corrompido impede a inicialização; não se descarta o estado silenciosamente.

Os arquivos de resultado ficam em `SURVEY_OUTPUT_DIR/<projeto>/<cycleId>/`. O relatório individual continua cifrado e privado; o coletivo é JSON sem relatos. O snapshot é a fonte de verdade da API. Resultados auxiliares e snapshot não formam uma transação multiarquivo: se houver queda entre suas escritas, pode restar arquivo auxiliar órfão, que não deve ser contado como resposta. Retentativas reconciliam os nomes determinísticos. Não importe arquivos do diretório para contar participantes.

O diretório padrão no desenvolvimento continua `skills/survey`, agora com subpastas por projeto. Para produção configure obrigatoriamente volume persistente absoluto; o Blueprint usa `/var/data/survey`. Faça backups cifrados e restaure junto com a mesma chave em ambiente isolado. Sem disco persistente, o caminho absoluto por si só não garante retenção. Esta implementação carrega o estado de cada projeto em memória; conjuntos grandes precisam migrar para banco transacional e filas, não aumentar réplicas.

## Regra principal: o agente se apresenta primeiro

Toda nova conversa de pesquisa deve ser iniciada pelo Equilibra com apresentação transparente, antes de qualquer pergunta do roteiro. O destinatário é o colaborador convidado a responder sobre sua própria rotina de trabalho, não o dono da empresa, o RH ou quem contratou a plataforma. A mensagem identifica o assistente virtual do Equilibra, informa o uso de inteligência artificial e explica em linguagem simples a finalidade da pesquisa. Não deve sugerir que o participante administra ou possui a empresa, nem apresentar o agente como seu funcionário ou representante da chefia. O agente não deve se passar por pessoa ou funcionário humano, nem inventar cargo, identidade ou credenciais profissionais.

A abertura fixa do servidor é:

> Olá! Sou o assistente virtual do Equilibra e utilizo inteligência artificial. Vou conversar com você sobre sua rotina de trabalho e como ela pode afetar sua saúde e bem-estar. Sua participação é voluntária e suas respostas são tratadas de forma confidencial. Esta pesquisa contribui para melhorar seu ambiente e suas condições de trabalho. Responda com sinceridade, sem informar nomes ou outros dados que identifiquem pessoas.

A abertura não promete participação completamente anônima: tokens de convite e credenciais de mensageria podem permitir vinculação no domínio técnico. Confidencialidade e pseudonimização não são anonimização irreversível. A menção à saúde é limitada à relação com o trabalho; o roteiro não deve solicitar histórico clínico, diagnósticos ou detalhes de saúde pessoal sem finalidade e base apropriadas.

Em seguida vêm o aviso de privacidade da pesquisa e as opções de participar, recusar e consultar ajuda ou dados. A primeira pergunta só aparece após essa apresentação e o aceite explícito. Uma mensagem inicial enviada pelo participante, inclusive `participar`, não dispensa a apresentação. Comandos de privacidade continuam disponíveis desde o primeiro contato. A retomada de uma pesquisa em andamento não precisa reiniciar o roteiro ou repetir a apresentação a cada resposta.

O texto está em `backend/src/survey/introduction.ts`; é acrescentado pelo servidor, independentemente do modelo, de `focus` ou de instruções do participante. A persona declarativa em `skills/equilibra-nr1.skill.json` também registra essa prioridade. A humanização do tom nunca deve ocultar que se trata de IA.

Para iniciar proativamente, o backend de mensageria chama `POST /api/surveys/<cycleId>/start` com `{"participantToken":"<token>"}` e o cabeçalho Bearer habitual. O retorno fornece `reply` e `started: true`, sem exigir mensagem anterior do participante. A integração deve enviar esse texto como primeiro contato, confirmar entrega e só então encaminhar respostas para `/messages`. O ciclo também fornece `openingMessage` como referência ao ser criado. O endpoint não envia mensagens sozinho; o transporte WhatsApp permanece separado e sujeito às regras de envio vigentes. Se a sessão já estiver pausada, encerrada, concluída ou com aceite, `/start` retorna `started: false` para evitar novo convite indevido.

## Os três diretórios de negócio

```text
skills/
  database/               Referências e taxonomia; leitura pelo motor
    exemplo.json          Exemplo NÃO aprovado
  focus/                  Roteiros versionados; leitura pelo motor
    exemplo.json          Pesquisa NÃO oficial, apenas demonstração
  survey/                 Saída privada; nunca servida por HTTP estático
    .gitkeep              Único arquivo desta pasta versionado
    <projectId>/
      .state.enc.json     Estado e recibos cifrados para retomada
      <cycleId>/
        <sha256-token>.json Envelope cifrado da síntese individual
        department.json    Resultado coletivo após conclusão e grupo mínimo
  equilibra-nr1.skill.json Persona declarativa mantida no projeto
backend/                  API, adaptadores e interface local
  src/survey/             Motor, schemas e testes
  src/config/paths.ts     Resolução centralizada dos caminhos
packages/core/            Contratos compartilhados
.old/                     Arquivo local de desenvolvimento; fora do Git e Docker
```

Os três diretórios de negócio ficam dentro de `skills`, preservando a arquitetura reorganizada. `backend` e `packages` mantêm o código técnico. Material antigo, exemplos de outros domínios e documentação arquivada ficam somente em `.old`, que não é publicada no GitHub nem incluída no contexto Docker. A execução, o build e os testes não dependem dela. O painel e o simulador antigos foram removidos. `backend/public` contém somente a tela local de pareamento e seus dois assets. Rotas legadas de chat, widget, autenticação e relatórios não são expostas.

O processo nunca escreve em `database` ou `focus`. Para garantir consulta somente, monte esses diretórios como volumes read-only e use uma identidade de serviço sem permissão de escrita. A convenção no código sozinha não substitui permissões do sistema operacional. `survey` deve ser um volume privado, fora do repositório publicado e dos diretórios estáticos. Os arquivos gerados estão no `.gitignore`.

## Organização completa das pastas

A estrutura abaixo distingue código-fonte, arquivos de referência e diretórios gerados durante o desenvolvimento. Pastas geradas ou locais podem não existir em um clone novo.

```text
Equilibra-AI-Partial/
├── backend/
│   ├── src/
│   │   ├── api/            Autenticação por projeto, erros, OpenAPI e testes HTTP
│   │   ├── config/         Ambiente, caminhos e testes de resolução
│   │   ├── lib/            Clientes e utilitários de infraestrutura
│   │   ├── middleware/     Proteções HTTP e limites de requisições
│   │   ├── providers/      Adaptadores dos provedores de IA
│   │   ├── routes/         Rotas HTTP, incluindo pareamento local
│   │   ├── services/       Serviços de aplicação e conexão WhatsApp
│   │   ├── survey/         Motor de pesquisa, schemas, rotas e testes
│   │   ├── app.ts          Montagem da aplicação e rotas ativas
│   │   └── index.ts        Inicialização e encerramento do servidor
│   ├── public/
│   │   ├── conectar-whatsapp.html
│   │   ├── pairing.css
│   │   └── pairing.js
│   ├── examples/           Cliente de integração Node.js reutilizável
│   ├── prisma/             Schema e migrações da infraestrutura legada
│   ├── dist/               JavaScript compilado; gerado e ignorado
│   ├── wa_pairing_session/ Credenciais locais de vínculo; ignoradas
│   ├── .env.example        Modelo versionado das configurações
│   ├── .env                Configuração local opcional; ignorada
│   ├── Dockerfile          Construção do container da API
│   ├── package.json        Dependências e comandos do backend
│   └── tsconfig.json       Configuração de compilação TypeScript
├── packages/
│   └── core/
│       ├── src/            Tipos, schemas e regras compartilhadas
│       ├── dist/           Compilação gerada e ignorada
│       ├── package.json
│       └── tsconfig.json
├── skills/
│   ├── database/           Conhecimento de consulta e taxonomia
│   ├── focus/              Definições JSON das pesquisas
│   ├── survey/             Resultados privados gerados pelo motor
│   └── equilibra-nr1.skill.json
├── .old/                   Material arquivado local; ignorado
├── node_modules/           Dependências instaladas; ignoradas
├── .env                    Configuração local da raiz; ignorada
├── .gitignore              Regras de exclusão do versionamento
├── .dockerignore           Exclusões do contexto de construção Docker
├── package.json            Workspaces e comandos gerais do projeto
├── package-lock.json       Versões resolvidas das dependências
├── render.yaml             Blueprint do serviço e disco no Render
└── README.md               Arquitetura, funcionamento e integração
```

### Responsabilidade de cada área

| Diretório | Responsabilidade | Como manter |
| --- | --- | --- |
| `skills/database` | Referências, categorias, gatilhos e aprofundamentos aprovados | Desenvolvedores alimentam e versionam; o motor apenas consulta |
| `skills/focus` | Ordem, obrigatoriedade e formato das perguntas de cada pesquisa | Preparar JSON conforme schema, registrar fonte e versão |
| `skills/survey` | Sínteses individuais cifradas e relatório coletivo | Gerado pelo serviço; somente `.gitkeep` entra no Git |
| `backend/src/survey` | Máquina de estados, interpretação e conclusão das pesquisas | Alterações de regras devem ser acompanhadas de verificação dos contratos |
| `backend/src/config` | Carregamento de ambiente e resolução de caminhos | Centralizar mudanças de localização em `paths.ts` |
| `backend/src/providers` | Comunicação com os modelos de IA | Preservar a interface `AIProvider` ao adicionar provedores |
| `backend/src/routes` | Endpoints da aplicação e do pareamento | Uma rota só fica ativa quando montada em `app.ts` |
| `backend/src/services` | Serviços, incluindo o pareamento dedicado | Serviços legados não são ativados apenas por estarem nesta pasta |
| `backend/src/middleware` | Segurança HTTP, CORS e rate limiting | Aplicar na montagem da API, sem substituir autorização de negócio |
| `backend/src/lib` | Integrações de infraestrutura, como Redis e Prisma | Não guardar segredos nem arquivos de resposta aqui |
| `backend/public` | Tela mínima de conexão com WhatsApp | Não colocar referências privadas, resultados ou credenciais nessa pasta |
| `backend/prisma` | Modelagem e migrações preexistentes | O motor atual de pesquisa não persiste suas sessões nesse banco |
| `packages/core` | Contratos reutilizáveis entre módulos | Compilar antes do backend com o comando de build da raiz |
| `.old` | Histórico de desenvolvimento e material desativado | Manter apenas localmente; não importar código nem carregar configuração dessa pasta |

### Onde colocar novos arquivos

Uma nova referência ocupacional pertence a `skills/database`; uma nova pesquisa pertence a `skills/focus`. Resultados de execução pertencem exclusivamente a `skills/survey`. Os nomes curtos `database`, `focus` e `survey` usados no restante deste documento se referem a esses subdiretórios dentro de `skills`.

Novas regras de condução ficam em `backend/src/survey`, adaptações de provedores em `backend/src/providers` e integrações de transporte em `backend/src/services` com as rotas necessárias em `backend/src/routes`. Os testes ficam junto ao módulo correspondente, como `engine.test.ts` e `paths.test.ts`; seus comandos são registrados em `backend/package.json`.

Não edite `dist` manualmente: ele é recriado por `npm run build`. Não versione `node_modules`, `.env`, credenciais de WhatsApp, conteúdo gerado em `skills/survey` ou `.old`. Para iniciar outro ambiente, utilize os arquivos versionados e `backend/.env.example`, sem depender dos arquivos locais arquivados.

## Fontes oficiais e significado de obrigatório

A [página oficial da NR-1 no MTE](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-1) reúne norma, guias e perguntas e respostas. A NR-1 não estabelece questionário único obrigatório. Perguntas frequentes sobre a norma não equivalem a itens de um instrumento de pesquisa validado.

Neste software, obrigatório significa `required: true` no roteiro aprovado. Não significa que a redação foi determinada pelo governo. Cada pergunta registra `source`; a equipe deve fornecer documento, versão e fundamento verificáveis. Nenhum exemplo deste repositório é apresentado como pergunta governamental, instrumento COPSOQ ou escala cientificamente validada.

As categorias cadastradas também não equivalem automaticamente a classes oficiais de risco. A integração com matriz de severidade/probabilidade, critérios profissionais e inventário do PGR ainda precisa ser especificada e validada. O motor atual produz indícios categorizados e médias de satisfação, sem transformar nota baixa automaticamente em classe legal de risco.

## Quem controla a conversa

1. O backend do Equilibra cria um ciclo e informa quantas participações são esperadas.
2. O motor congela uma cópia da pesquisa e das referências elegíveis desse ciclo e a persiste em snapshot cifrado.
3. São emitidos tokens aleatórios, um por convite. O serviço de mensageria do Equilibra mantém a relação telefone-token em ambiente separado.
4. Antes de coletar, o motor apresenta o aviso da pesquisa e exige `participar`.
5. O roteiro avança em ordem, exigindo o formato correto de cada pergunta obrigatória.
6. Respostas aceitas passam por regras explícitas e, quando há referências, classificação da IA em IDs permitidos.
7. Havendo indício alarmante compatível com a base, o motor abre até três aprofundamentos no tema e retorna ao roteiro.
8. A conclusão individual exige chegar ao final do roteiro; perguntas obrigatórias não podem ser puladas. Recusar ou pausar não conta como conclusão.
9. É gerada uma síntese individual cifrada, sem resposta integral, nome ou telefone.
10. Quando todas as participações esperadas terminarem, o motor publica resultado coletivo somente se houver pelo menos k participantes.

O total é calculado por estados de participações únicas concluídas, não pelo número de arquivos encontrados na pasta. Contar arquivos permitiria incluir duplicatas, arquivos antigos, incompletos ou maliciosos. Um arquivo individual é consequência de uma conclusão válida. O arquivo de departamento não conta como participante.

## Perguntas do roteiro e aprofundamentos

`focus` aceita perguntas obrigatórias e extras cadastradas pelo site. Uma pergunta extra com `required: false` pode ser pulada com `pular`; se a empresa exigir sua resposta, deve marcar `required: true`. Perguntas adicionais de pesquisa e aprofundamentos dinâmicos são mecanismos diferentes.

O modelo não escreve perguntas livres neste estágio. Ele identifica IDs de risco; o servidor seleciona redações previamente cadastradas em `database.risks[].followups`. Isso implementa aprofundamento condicionado sem permitir que o modelo invente conteúdo normativo. O limite de três é aplicado por tema durante toda a sessão, inclusive quando várias perguntas compartilham o tema. A resposta a um aprofundamento não abre uma cadeia de novos aprofundamentos. `pular` também funciona nos aprofundamentos.

Essa restrição é deliberada: perguntas geradas livremente por IA não permitem garantir ausência de distorção. Uma futura adaptação de linguagem precisa preservar significado, fonte, formato e limites, com revisão e testes de equivalência.

## Contrato de focus

Consulte `skills/focus/exemplo.json` e o schema executável em `backend/src/survey/schema.ts`. Campos desconhecidos são rejeitados.

| Campo | Uso |
| --- | --- |
| id, version | Identificação e versão da pesquisa |
| approved | Aprovação registrada pela equipe; exemplo usa false |
| methodology | Referência metodológica e limitações |
| privacyNotice | Aviso apresentado antes da coleta |
| questions[].id | ID único no roteiro |
| theme | Liga pergunta às referências do mesmo tema |
| text, source | Redação e origem verificável |
| required | Impede pular quando true |
| format | number ou text |
| higherIsBetter | Direção da escala; padrão true |

Na versão atual `number` é sempre 0 a 10. Exemplos aceitos: `7`, `nota 7`, `2,5`, `7; comentário`, `nota 8: complemento`. `Trabalho 8 horas`, `11`, `-1`, dois números ambíguos ou uma frase sem nota explícita são recusados. O motor repete a pergunta e explica o formato. Um texto composto exclusivamente por número não satisfaz uma pergunta de formato `text`.

Complementos são analisados no contexto da pergunta, mas não aparecem nos relatórios. Para números, a satisfação é a nota declarada ou `10 - nota` quando `higherIsBetter` é false. Para texto, satisfação é `null`: a IA não fabrica uma nota. As escalas precisam de âncoras claras na redação. A pertinência do relato é uma interpretação falível, não uma verificação de verdade.

## Contrato de database

Cada JSON contém `id`, `version`, `approved`, `source` (URL), `theme`, `context` e `risks`. Cada risco contém `id`, `label`, `alarmTerms` e até três `followups`. IDs de risco devem ser únicos na base carregada. Temas podem incluir saúde mental, condições físicas, integridade e outros definidos por profissionais; o programa não declara uma lista universal exigida pela norma.

Arquivos não aprovados são ignorados, exceto no modo de demonstração. Uma pesquisa não aprovada é recusada fora desse modo. Arquivo malformado interrompe a criação do ciclo. Não há crawler, scraping ou importação automática de PDF: desenvolvedores preparam referências estruturadas, revisam fidelidade e condições de uso e aprovam a versão.

O link oficial de `skills/database/exemplo.json` identifica a página normativa; não significa que a regra demonstrativa ou suas perguntas constem daquela página. Não promova esse arquivo para aprovado sem revisão efetiva. `approved` é um campo administrativo, não uma assinatura digital ou prova de validação.

## Interpretação da IA e limites

O prompt entrega as referências do tema e a resposta atual como dados. A IA só pode retornar `{"riskIds":[]}`. O schema rejeita campos extras e IDs fora da lista permitida. Não se aceita texto livre produzido pelo modelo em relatórios, instruções de tratamento, diagnóstico ou notas inferidas.

Regras por termos alarmantes fornecem um fallback conservador. Se o provedor falhar, devolver JSON inválido ou categoria não cadastrada, o sistema mantém apenas os indícios das regras e informa a indisponibilidade no registro. Não preenche lacunas com fatos inventados. Termos simples podem produzir falsos positivos e negativos, inclusive por negação ou contexto; o exemplo não é um detector clínico homologado.

A redação da síntese é um template controlado que apresenta quantidades e limitações, marcado como análise de IA e regras. Não é uma redação livre do LLM. Isso reduz vazamento e alucinação, mas não torna a classificação infalível. A classificação deve ser testada com exemplos anotados por profissionais antes de dados reais. A versão do provedor é registrada por nome; versionamento preciso de modelo, prompt e parâmetros em trilha assinada é uma evolução pendente.

## Arquivos survey e publicação

O relatório individual contém versão de schema, versão da pesquisa, metodologia, versões da base, nome do provedor, ressalva de análise automatizada, tabela por pergunta e síntese geral. Cada linha informa pergunta, tema, satisfação ou null, IDs de indício e estado da análise. Não contém fala bruta, telefone, nome ou token do convite.

Esse objeto é cifrado em AES-256-GCM com IV aleatório. O JSON no disco contém `encryption`, `iv`, `tag` e `ciphertext`. O nome usa SHA-256 do token aleatório. O token não é um telefone e não deve ser derivado dele. Isso é pseudonimização, não prova de anonimização irreversível.

O site/RH não recebe um endpoint de relatórios individuais. Entregar uma síntese por pessoa ao RH pode permitir reidentificação mesmo sem nome; por isso os arquivos individuais permanecem no domínio privado de processamento. A futura transferência servidor-servidor deve ser para um cofre técnico separado dos usuários do RH.

O resultado coletivo é `department.json`. Para cada pergunta numérica calcula a média somente quando ao menos k respostas numéricas válidas existirem; caso contrário retorna null. Categorias só aparecem se pelo menos k pessoas as apresentarem naquela pergunta. Não publica frequência exata de categoria rara. Ausência de categoria publicada não significa ausência de risco.

`SURVEY_MIN_GROUP` tem piso técnico 5 nesta implementação. Esse valor não é exigência fixa da LGPD nem garantia de anonimato. Supressão complementar, cruzamentos, comparações entre ciclos e ataques por grupos sobrepostos ainda não estão implementados. Não exponha múltiplos recortes em produção antes de implementar essas proteções.

O ciclo não fecha quando alguém recusa ou abandona. Não ajuste o denominador silenciosamente para produzir um relatório. Política de encerramento por prazo, desistências, elegibilidade e não resposta exige implementação explícita. Ciclos menores que k podem terminar, mas não publicam relatório coletivo.

## Executar em desenvolvimento

Requisitos: Node.js 20+, npm e um provedor compatível com os adaptadores existentes. Instale com `npm install`; compile com `npm run build`; verifique o motor com `npm test`.

Use `backend/.env.example` como referência. Copie para `backend/.env` ou para `.env` na raiz e preencha os segredos. O exemplo arquivado em `.old` não é utilizado. A precedência é: variáveis já definidas no processo, depois `backend/.env`, depois `.env` da raiz. Valores existentes não são sobrescritos e segredos não são impressos:

```dotenv
NODE_ENV=development
PORT=4000
SURVEY_ROOT=../skills
SURVEY_API_KEY=<segredo-aleatorio-com-pelo-menos-32-caracteres>
SURVEY_ENCRYPTION_KEY=<64-caracteres-hexadecimais-aleatorios>
SURVEY_MIN_GROUP=5
SURVEY_ALLOW_DEMO=true
AI_PROVIDER=groq
GROQ_API_KEY=<chave-do-provedor>
```

Gere segredos independentes com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Nunca versione as chaves. O comando gera um segredo, não modifica arquivos. Para iniciar: `npm run dev:backend`. Sem SURVEY_ROOT, o diretório de negócio é sempre `skills` na raiz do projeto. Caminhos relativos configurados são resolvidos em relação a `backend`, independentemente do diretório de execução. Um caminho absoluto também é aceito. Por compatibilidade, um SURVEY_ROOT antigo apontando para a raiz do projeto é redirecionado para seu subdiretório `skills` quando os diretórios de negócio não existem diretamente na raiz. Não é necessário mover pastas novamente.

Os mesmos caminhos funcionam no código TypeScript e no build `dist`. Após `npm run build`, inicie com `npm start -w backend` ou `node backend/dist/index.js` na raiz; dentro de `backend`, use `npm start`. O carregamento de ambiente e o acesso à base não dependem do diretório atual. Ao integrar diretamente, o argumento `root` de `SurveyEngine` deve apontar para a pasta que contém `database`, `focus` e `survey`, atualmente `skills`.

Para sandbox em Docker, execute `docker build -f backend/Dockerfile -t equilibra-api .` a partir da raiz e forneça os segredos por variáveis do container. O Dockerfile usa Node 22 e NODE_ENV=production, não executa migrações do banco legado e configura `/var/data/survey` como saída. Monte um volume persistente em `/var/data`, exponha a porta configurada e mantenha `/app/skills/database` e `/app/skills/focus` como referências somente leitura. O contexto exclui `.old`, `.env`, sessões WhatsApp e resultados. O pareamento está desabilitado nesse container por padrão. A publicação técnica continua destinada à homologação.

A chave da API autentica chamadas servidor-servidor e, excepcionalmente, o operador na tela local de pareamento. Nunca embuta seu valor no código JavaScript, aplicativo do colaborador, logs ou URL. Na tela local ela é digitada pelo operador, mantida transitoriamente no campo e enviada por cabeçalho, sem localStorage ou cookies. CORS não é autenticação. O segredo de cifragem precisa de armazenamento seguro e cópia de recuperação; perdê-lo torna os relatórios individuais ilegíveis. Rotação com identificação de chave e KMS ainda não está implementada.

## API e integração ao site Equilibra

Todas as rotas `/api/v1` e seu alias `/api` exigem `Authorization: Bearer <chave-do-projeto>`. Use `API_CLIENTS_JSON` para vários projetos ou `SURVEY_API_KEY` para o projeto único default. `GET /health`, `/ready` e `/openapi.json` são públicos e não retornam conteúdo pessoal.

Criar ciclo: `POST /api/v1/surveys` com `{"focusId":"exemplo","expectedParticipants":5}` e `Idempotency-Key` único por solicitação. A resposta contém `cycleId`, tokens dos convidados e aviso de privacidade. O backend do site deve armazenar os tokens em cofre e encaminhar convites pelo serviço de mensageria. Não repasse a lista ao RH.

Enviar resposta: `POST /api/surveys/<cycleId>/messages` com:

```json
{"participantToken":"<token-aleatorio>","messageId":"id-unico-da-mensagem","text":"participar"}
```

Encaminhe `reply` ao participante pelo mesmo canal. Envie cada nova mensagem com novo ID e preserve o ID e o conteúdo em redelivery. A repetição devolve a resposta anterior com `duplicate: true`, sem avançar a pesquisa, inclusive após reinício. Mesmo ID com outro texto retorna 409. Falhas não confirmadas podem ser repetidas com o mesmo ID. Uma fila durável e outbox no transporte ainda são necessários para controlar o envio efetivo ao WhatsApp.

Consultar resultado: `GET /api/surveys/<cycleId>/report` retorna `complete`, `published` e `report`. Enquanto incompleto ou abaixo de k, `report` é null. Não retorna lista de respondentes ou progresso por pessoa. O backend Equilibra deve vincular o ciclo à empresa e ao departamento no domínio de gestão.

Para incorporar por HTTP, use o cliente `backend/examples/api-client.mjs` ou outro cliente REST com o contrato OpenAPI. Para incorporar o código diretamente, mantenha os módulos `backend/src/survey` e `backend/src/api`, o contrato de provedor e Zod; instancie `SurveyEngine(root, provider, outputRoot)` por projeto e monte `surveyRouter(id => engineDoProjeto)` atrás da autenticação. Não compartilhe o mesmo diretório de saída entre projetos. O motor não recebe telefone, nome, CNPJ ou gestor como campos estruturados; os tokens são opacos e a chave determina o projeto autorizado. Texto livre ainda pode conter PII enviada espontaneamente, por isso os controles de minimização continuam necessários.

## Integração WhatsApp

O motor é independente do transporte. Os adaptadores antigos Meta/Baileys permanecem como código legado e não estão ligados ao novo app. Não utilize os endpoints antigos: eles não implementam o novo contrato nem suas restrições. O pareamento usa um serviço dedicado, sem ativar esses fluxos legados.

O serviço de mensageria do site deve validar assinatura do webhook oficial, deduplicar o ID recebido, resolver telefone no cofre e enviar apenas token, texto e messageId ao motor. A resposta textual do motor volta pelo adaptador. Número e identidade nunca devem ser concatenados no texto enviado à IA. Convites e mensagens fora da janela do WhatsApp dependem das políticas e templates vigentes da Meta. Disparos e coleta real pelo WhatsApp ainda não estão integrados ao novo motor.

### Tela local para conectar o WhatsApp

Para usar a tela local, configure `WHATSAPP_PAIRING_ENABLED=true` no ambiente de desenvolvimento e abra `http://localhost:4000/conectar-whatsapp.html` (ou a porta configurada em PORT). Digite uma chave de projeto válida e clique em Conectar. No celular, abra WhatsApp, Aparelhos conectados, Conectar um aparelho e leia o QR exibido. A tela atualiza o código e o estado automaticamente. Ao conectar, aparece WhatsApp conectado. Desconectar encerra o vínculo e remove as credenciais locais deste adaptador; não inicia novo pareamento automaticamente. Em produção o pareamento é desabilitado por padrão e continua restrito ao loopback mesmo se habilitado. O serviço de pareamento é único por processo, não uma sessão WhatsApp independente por projeto: mantenha-o apenas para testes locais.

A interface tem apenas o campo de chave, os botões de conexão/desconexão, status e QR. Nenhuma pesquisa, convite ou resposta automática é disparada. Mensagens não são encaminhadas ao motor nem registradas pelo serviço de pareamento. Não há leitura de histórico solicitada pelo adaptador. Baileys é uma conexão via protocolo WhatsApp Web, distinta da Cloud API oficial da Meta.

Endpoints: GET `/api/whatsapp/connection/status`, POST `/api/whatsapp/connection/connect` e POST `/api/whatsapp/connection/disconnect`. Exigem a mesma chave Bearer da API e acesso pelo computador local, sem proxy remoto. Requisições com Origin diferente da origem do servidor são bloqueadas. QR e estado são enviados com Cache-Control: no-store. O QR permite vincular a conta: mantenha a tela privada.

O serviço `backend/src/services/whatsapp-pairing.service.ts` salva as credenciais de vínculo sempre em `backend/wa_pairing_session`, independentemente do diretório de execução. Essa pasta é ignorada pelo Git, mas os arquivos do Baileys não são cifrados pela chave de relatórios. Restrinja suas permissões/ACL e use um número de teste. A sessão pode ser restaurada ao clicar Conectar após reinício; a aplicação não conecta sozinha ao iniciar. Falhas pedem nova tentativa manual, exceto o reinício de protocolo solicitado pelo WhatsApp imediatamente após a leitura do QR.

Antes de processar texto real, implemente mascaramento de dados pessoais, contrato e configuração de não treinamento/retenção do provedor e avaliação da transferência internacional. Atualmente a resposta textual atual pode ser enviada ao provedor configurado sem filtro completo de PII; é mais uma razão para aceitar somente dados fictícios nesta etapa.

## Privacidade, participação e exceções

O aviso deve explicar finalidade, controlador, operador, processadores, canal humano, retenção e direitos. `participar` registra o instante no snapshot cifrado junto à cópia versionada da pesquisa e seu aviso. Isso permite retomada, mas não substitui ledger jurídico imutável, trilha auditável ou definição da base legal adequada ao vínculo de emprego.

`ajuda` mostra comandos; `meus dados` mostra aviso e informações mínimas da sessão; `pausar` suspende; `retomar` restaura; `sair` ou `apagar` antes da conclusão removem linhas da memória e encerram a participação. Depois da conclusão, o comando orienta usar o canal de privacidade: remoção do arquivo cifrado e tratamento dos direitos ainda precisam de uma fila autenticada e auditável. Não há promessas falsas de apagamento completo.

A detecção demonstrativa de risco imediato suspende a coleta e orienta ajuda humana. Não implementa emergência, triagem, denúncia formal ou protocolo de Compliance. Não gera protocolo fictício. Uma mensagem fixa validada, atendimento humano, diferenciação de relato espontâneo, denúncia e consentimento específico precisam existir antes de qualquer conversa real.

As respostas brutas não são gravadas pelo motor nem incluídas em logs de erro. Ainda podem existir em trânsito, memória de processos/provedor e infraestrutura de mensageria; configure observabilidade para excluir payloads e restrinja acesso a dumps. O snapshot cifrado persiste notas, categorias, tokens e recibos, sem fala bruta. Não há TTL/expurgo automático implementado: arquivos e estado permanecem até tratamento operacional. Defina e implemente prazos e exclusão em backups antes da operação real.

## Desenvolvimento e testes

O código executável central está em `schema.ts` (contratos), `engine.ts` (estados, classificação e saída), `routes.ts` (API) e `app.ts` (montagem e proteção). Alterações de comportamento devem manter os limites no servidor, não apenas no prompt. Os testes utilizam provedor falso e dados fictícios, verificando consentimento, validação numérica, três aprofundamentos no tema, retorno ao roteiro, conclusão, cifragem, publicação após cinco conclusões, ausência de fala/token no agregado, recusa e deduplicação.

Há serialização por projeto dentro de um único processo. O snapshot cifrado recupera sessões e recibos após reinício; gravações usam arquivo temporário, sync e rename. Não há coordenação entre instâncias ou transação atômica multiarquivo. O snapshot confirma o estado da API; um arquivo auxiliar de resultado isolado não representa resposta confirmada. Os testes HTTP verificam duas chaves distintas, rejeição de acesso cruzado, retomada, replay após reinício, conflitos de idempotência e rejeição de chave de cifragem incorreta.

Para adicionar tema: preparar referência estruturada, revisar taxonomia/gatilhos/roteiros com profissionais, atribuir IDs e versão, adicionar perguntas no focus e testar sem dados reais. Para alterar escala, modifique schema, parser e média juntos; nunca mude apenas o prompt. Para trocar provedor, implemente a interface AIProvider e teste o contrato de saída estrito. Não permita upload do RH diretamente em database nem aprovação automática de conteúdo produzido pela IA.

## Próximas implementações necessárias para uso real

- Banco transacional para escala, filas/outbox duráveis e eventos de auditoria imutáveis; hoje há snapshots cifrados por projeto para uma única instância.
- Autorização de usuários e papéis dentro de cada projeto, cofre de identidade e integração segura com o site; chaves por projeto já isolam os ciclos na API.
- Mascaramento de PII e testes de vazamento/injeção, isolamento, restauração e expurgo.
- Direitos após conclusão, retenção por finalidade, operação de backups e incidentes.
- Metodologia validada, critérios de risco versionados, classificação testada contra profissionais e intervenções humanas.
- Protocolo de crise/denúncia homologado e transporte WhatsApp oficial validado.
- Privacidade contra grupos sobrepostos, supressão complementar e comparações longitudinais.
- Gestão de segredos, TLS, permissões/ACL no Windows, KMS e revisão de dependências.

As opções `mode` de arquivos ajudam em sistemas Unix, mas não garantem ACLs no Windows. Configure ACLs do volume explicitamente. NODE_ENV=production habilita a operação técnica em servidor e exige diretório persistente absoluto; não é certificação nem autorização para dados reais. A liberação para colaboradores reais exige resolver as pendências e validações jurídica, de SST, psicológica e operacional apropriadas ao contexto.
