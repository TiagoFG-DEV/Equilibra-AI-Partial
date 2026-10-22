# API Equilibra — manual de instalação, publicação e integração

Este é o manual operacional da implementação atual. A arquitetura e as regras do produto estão no [README](README.md); o contrato de máquina está em `/openapi.json`, gerado por `backend/src/api/openapi.ts`. Os exemplos abaixo usam dados fictícios e a pesquisa `exemplo` do repositório.

## Atualização de implantação: Render Free + banco externo

O Blueprint atual usa Render Free com PostgreSQL externo. As instruções de arquivos/volume neste manual se aplicam à alternativa `SURVEY_STORAGE=file`. Para manter o servidor gratuito, siga esta configuração em vez de anexar disco:

1. Crie/conecte uma conta Neon e um projeto no plano gratuito, revisando as cotas. Não é necessário comprar um plano para os testes. Obtenha uma conexão PostgreSQL privada no painel do projeto.
2. No serviço Render já existente, abra Environment e configure `SURVEY_STORAGE=postgres` e `SURVEY_DATABASE_URL` com essa conexão. Não cole a conexão no chat, no GitHub ou na página de status.
3. Defina `SURVEY_API_KEY` com pelo menos 32 caracteres aleatórios e `SURVEY_ENCRYPTION_KEY` com outra chave hexadecimal de 64 caracteres. As chaves locais geradas ficam no `backend/.env`, ignorado pelo Git; o Render precisa recebê-las separadamente. `API_CLIENTS_JSON` deve ficar ausente/vazio se optar pela chave única.
4. Use `NODE_VERSION=22`, `NODE_ENV=production`, `SURVEY_ROOT=../skills`, `SURVEY_ALLOW_DEMO=true`, `SURVEY_MIN_GROUP=5`, `WHATSAPP_PAIRING_ENABLED=false` e `TRUST_PROXY_HOPS=1`.
5. Preserve a chave real do provedor e ajuste `GROQ_CHAT_MODEL=qwen/qwen3.8-27b`, modelo disponível e testado na configuração atual. Configure `CORS_ORIGINS` com as origens autorizadas.
6. Mantenha a raiz do serviço na raiz do repositório, build `npm ci --include=dev && npm run db:generate && npm run build` e start `npm start`. O health check de hospedagem pode usar `/health`; monitore `/ready` para saber se a API realmente está pronta.
7. Salve as variáveis e faça o deploy. Abra `/`: a página exibe as pendências sem revelar segredos. API não pronta permanece bloqueada e o servidor tenta inicializar novamente a cada 30 segundos.
8. O serviço cria as tabelas próprias `equilibra_state` e `equilibra_artifacts` com CREATE TABLE IF NOT EXISTS; a conexão precisa ter permissão de criação. Não executa migração das tabelas legadas. Se a política do banco exigir criação manual, use as definições `setupSql` de `backend/src/survey/postgres.ts` por um administrador antes de iniciar.
9. Teste criar, responder e concluir um ciclo fictício; reinicie o serviço e consulte o mesmo ciclo com a mesma chave. Confirme replay/idempotência e que nenhuma cópia dos resultados foi gravada em disco efêmero.

| Nova variável | Comportamento |
| --- | --- |
| `SURVEY_STORAGE=file` | Default local: snapshots/resultados em arquivos; produção exige volume persistente |
| `SURVEY_STORAGE=postgres` | Estado e artefatos cifrados no banco; não exige SURVEY_OUTPUT_DIR |
| `SURVEY_DATABASE_URL` | Obrigatória no modo postgres; URI postgres/postgresql do provedor, com senha privada |

As consultas usam parâmetros e TLS com verificação de certificado em servidores remotos. A URI pode incluir sslmode do provedor, mas o adaptador conserva verificação estrita. Não desabilite SSL para corrigir um erro. Um PostgreSQL em localhost é aceito sem TLS para desenvolvimento. O banco legado indicado por DATABASE_URL não é automaticamente reutilizado; configure explicitamente SURVEY_DATABASE_URL.

O PostgreSQL confirma snapshot e relatórios em uma transação. O estado é recarregado antes das operações e uma versão evita sobrescrever alterações concorrentes. Mesmo assim, mantenha uma instância até validar carga e topologia. A migração automática de snapshots antigos de arquivo para banco não está implementada; não troque o modo de uma operação com dados reais sem um plano de migração.

No modo postgres, relatórios coletivos também ficam cifrados na tabela de artefatos, embora a API devolva o agregado autorizado em JSON. Retenção e backup devem cobrir as duas tabelas e a chave de cifragem, mantida separada. Não há plano pago contratado automaticamente pelo código. O [Neon Free possui cotas](https://neon.com/docs/introduction/plans), e manter o Render desperto não substitui persistência.

## 1. O que é necessário e o que já funciona

A API recebe respostas por HTTP, apresenta o agente de IA, controla aceite e roteiro, valida formatos, limita aprofundamentos e gera sínteses individuais cifradas e resultado coletivo. O consumidor pode ser um backend Node.js, Python, Java, PHP, uma rota de servidor na Vercel ou outro cliente HTTPS.

O servidor não envia mensagens WhatsApp sozinho. O pareamento local não está integrado ao novo motor e não ativa coleta ou disparos. O módulo de pesquisa não usa as rotas antigas Meta/Baileys. Configurar tokens da Meta não modifica esse comportamento.

| Para quê | O que é necessário |
| --- | --- |
| Testar o código sem modelo real | Git, Node.js 22 recomendado, npm e `npm test`; os testes usam provedor falso |
| Rodar a API localmente | Dependências, tipos Prisma gerados, segredos da API e cifragem, base/roteiro e diretório gravável |
| Obter classificação pelo modelo | Provedor de IA acessível, credencial quando exigida e modelo disponível nessa conta |
| Publicar no Render | Conta Render conectada ao GitHub, serviço Free com PostgreSQL externo (ou pago com disco no modo file), variáveis preenchidas e uma instância |
| Usar em outro sistema | Backend consumidor com URL/chave privadas, controle dos seus usuários, tokens e IDs de mensagens |
| Coletar por WhatsApp real | Implementar transporte, validação de webhook, vínculo de identidade separado, fila e envio de respostas |
| Operar com colaboradores reais | Resolver as pendências metodológicas, de privacidade, atendimento humano e operação descritas na seção 16 |

Publicar com `NODE_ENV=production` configura a execução técnica no servidor. Não certifica conformidade ou libera automaticamente o uso de dados pessoais reais. Esta entrega é destinada à homologação com dados fictícios.

## 2. Checklist completo de preparação

### Na máquina de desenvolvimento

- [V] Instalar Git, Node.js 22 e npm compatível.
- [V] Clonar o repositório e entrar na sua raiz.
- [V] Instalar também dependências de desenvolvimento para compilar TypeScript.
- [V] Gerar os tipos Prisma; não é necessário subir PostgreSQL para o motor atual.
- [V] Criar `backend/.env` a partir do exemplo, preservando configurações locais existentes.
- [ ] Gerar um segredo de autenticação e outra chave de cifragem, independentes.
- [V] Configurar o provedor de IA e confirmar a disponibilidade do modelo na conta.
- [ ] Definir `SURVEY_ALLOW_DEMO=true` para executar a pesquisa demonstrativa não aprovada.
- [ ] Garantir acesso de leitura a `skills/database` e `skills/focus`, e escrita à saída.
- [ ] Compilar, executar testes e iniciar a API.
- [ ] Verificar `/health`, `/ready` e o contrato OpenAPI.

### Na hospedagem

- [V] Enviar o código ao GitHub sem `.old`, `.env`, credenciais ou resultados.
- [V] Criar o serviço na raiz do repositório, com os comandos do Blueprint.
- [ ] Configurar PostgreSQL externo com `SURVEY_STORAGE=postgres` e `SURVEY_DATABASE_URL`; somente a alternativa file exige disco e `SURVEY_OUTPUT_DIR`.
- [V] Preencher todos os segredos e campos solicitados no Render.
- [ ] Manter somente uma instância/processo para esse volume.
- [ ] Configurar CORS, proxy, HTTPS, health check e limites de requisição.
- [ ] Testar uma pesquisa fictícia e sua retomada após reinício.
- [ ] Planejar backup/restauração e guardar a chave de cifragem fora do volume.

### No projeto consumidor

- [ ] Guardar URL e chave exclusivamente no backend.
- [ ] Escolher uma definição de pesquisa existente em `skills/focus`.
- [ ] Criar um ciclo com `Idempotency-Key` persistida.
- [ ] Guardar `cycleId` e tokens dos convites em domínio privado.
- [ ] Enviar a apresentação antes de encaminhar o aceite e as respostas.
- [ ] Preservar IDs e conteúdo de mensagens nas retentativas.
- [ ] Tratar `optional`, `started`, `finished`, `suspended` e `duplicate`.
- [ ] Consultar o resultado coletivo e respeitar `published=false`.
- [ ] Implementar autenticação/permissões do próprio site; a chave da API não é credencial de colaborador.

## 3. Organização e arquivos de referência

```text
API.md                              Este manual
README.md                           Arquitetura e regras de negócio
render.yaml                         Render Free com PostgreSQL externo
backend/.env.example                Referência de configuração
backend/src/api/                    Autenticação, erros, OpenAPI, testes HTTP
backend/src/config/paths.ts         Caminhos independentes do diretório de execução
backend/src/survey/                  Motor, contratos, introdução e armazenamento
backend/examples/api-client.mjs     Cliente JavaScript reutilizável
skills/database/                    Conhecimento e categorias de consulta
skills/focus/                       Roteiros de pesquisa em JSON
skills/survey/<projectId>/          Saída local padrão por projeto, ignorada pelo Git
.old/                               Arquivo local, fora do Git e Docker
```

No Render, código e referências continuam no deploy; em modo postgres, estado e saída ficam cifrados nas tabelas do banco, particionados por projeto. No modo file alternativo, configure saída em volume persistente, por exemplo `/var/data/survey/<projectId>`. `.old` não é necessária para executar a API.

## 4. Instalação e execução local

Execute na raiz do repositório:

```bash
git clone https://github.com/TiagoFG-DEV/Equilibra-AI-Partial.git
cd Equilibra-AI-Partial
npm ci --include=dev
npm run db:generate
```

Se o repositório já estiver clonado, não repita o clone: entre na pasta existente. `db:generate` gera os tipos do cliente Prisma usados pelos módulos legados; não cria banco, não executa migrações e não conecta ao PostgreSQL.

Crie `backend/.env` copiando `backend/.env.example` pelo editor. Não sobrescreva um `.env` já configurado. O carregamento segue esta prioridade: ambiente do processo → `backend/.env` → `.env` da raiz. Variáveis existentes não são sobrescritas.

Gere **dois segredos diferentes**, executando o comando duas vezes:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use o primeiro como `SURVEY_API_KEY` e o segundo como `SURVEY_ENCRYPTION_KEY`. Trate ambos como segredos. Não copie os valores de testes ou de exemplos como credenciais reais.

Configuração local mínima para a demonstração com Groq:

```dotenv
NODE_ENV=development
PORT=4000
SURVEY_ROOT=../skills
SURVEY_API_KEY=<primeiro-segredo-gerado>
SURVEY_ENCRYPTION_KEY=<segundo-segredo-hexadecimal-gerado>
SURVEY_MIN_GROUP=5
SURVEY_ALLOW_DEMO=true
AI_PROVIDER=groq
GROQ_API_KEY=<credencial-real-do-provedor>
GROQ_CHAT_MODEL=<modelo-disponivel-na-sua-conta>
CORS_ORIGINS=http://localhost:3000
WHATSAPP_PAIRING_ENABLED=false
TRUST_PROXY_HOPS=0
```

Substitua os placeholders. Deixe `API_CLIENTS_JSON` vazio quando usar somente `SURVEY_API_KEY`. Sem saída configurada, o desenvolvimento grava em `skills/survey/<projectId>`. O exemplo copiado contém outras variáveis legadas que não são necessárias ao fluxo HTTP novo.

Depois de configurar:

```bash
npm test
npm run build
npm start
```

Para editar com recarga automática, use `npm run dev:backend` em vez de `npm start`. O comando start usa o build: após editar TypeScript, compile novamente se não estiver usando o modo dev.

Confira no navegador ou cliente HTTP:

- `http://localhost:4000/health`: processo respondendo.
- `http://localhost:4000/ready`: estado carregado e diretório de saída acessível.
- `http://localhost:4000/openapi.json`: contrato OpenAPI.

Esses caminhos são da raiz do servidor, não de `/api/v1`. Os testes automatizados não precisam de uma chave de provedor real e não provam que sua conta de IA está configurada. Uma resposta HTTP 200 também pode usar fallback de classificação quando o provedor falha.

## 5. Referência completa de variáveis

### Serviço, acesso e armazenamento

| Variável | Necessidade, formato e efeito |
| --- | --- |
| `NODE_ENV` | `development`, `test` ou `production`; padrão `development` |
| `PORT` | Inteiro de 1 a 65535; padrão 4000; no Render use o valor injetado pela plataforma |
| `SURVEY_API_KEY` | Segredo com pelo menos 32 caracteres para o projeto único `default`; alternativa a `API_CLIENTS_JSON` |
| `API_CLIENTS_JSON` | Objeto JSON de IDs de projetos para segredos distintos; se preenchido, tem precedência sobre a chave única |
| `SURVEY_ENCRYPTION_KEY` | Obrigatória; exatamente 64 caracteres hexadecimais, equivalentes a 32 bytes |
| `SURVEY_ROOT` | Pasta que contém `database`, `focus` e `survey`; padrão `skills` da raiz; caminho relativo é resolvido a partir de `backend` |
| `SURVEY_OUTPUT_DIR` | Somente modo file: sobrescreve saída; produção exige caminho absoluto em volume persistente |
| `SURVEY_STORAGE` | `file` (padrão local) ou `postgres` (Blueprint Render Free) |
| `SURVEY_DATABASE_URL` | Conexão privada PostgreSQL obrigatória no modo postgres, com TLS validado em hosts remotos |
| `SURVEY_MIN_GROUP` | Inteiro com piso 5; padrão 5; abaixo disso o motor recusa inicialização |
| `SURVEY_ALLOW_DEMO` | Somente o texto `true` habilita os exemplos não aprovados; não permite usar dados reais |
| `CORS_ORIGINS` | Origens exatas, separadas por vírgula, sem caminhos; padrão inclui localhost 5173, localhost 3000 e 127.0.0.1:5500 |
| `TRUST_PROXY_HOPS` | Inteiro de 0 a 5; padrão 0; Blueprint usa 1; revisar se mudar a topologia de proxies |
| `RATE_LIMIT_WINDOW_MS` | Janela do limitador em milissegundos; padrão 60000; usar valor positivo |
| `RATE_LIMIT_MAX` | Limite de requisições por IP na janela; padrão 100; usar inteiro positivo |
| `REDIS_URL` | Opcional; Redis para rate limiting. Não armazena sessões nem substitui PostgreSQL/disco |
| `WHATSAPP_PAIRING_ENABLED` | `true` ou `false`; sem configuração, habilitado fora de produção. O exemplo e o Blueprint usam false |
| `NODE_VERSION` | Configuração de build do Render; Blueprint usa 22. Não é o seletor de provedor nem de API |

Sem `SURVEY_ROOT`, os caminhos não dependem do diretório em que o comando foi iniciado. Um valor antigo que aponte para a raiz do projeto é redirecionado ao seu `skills` quando necessário. O caminho absoluto de saída por si só não cria um disco persistente: a hospedagem precisa anexar o volume.

### Provedor de inteligência artificial

Configure somente o conjunto usado por `AI_PROVIDER`. Nomes de modelos do exemplo/código são defaults técnicos, não garantia de disponibilidade atual na conta. Confirme o modelo no provedor escolhido.

| AI_PROVIDER | Variáveis | Padrões de URL/modelo no código |
| --- | --- | --- |
| `groq` (padrão) | `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_CHAT_MODEL` | `https://api.groq.com/openai/v1`, `qwen/qwen3.8-27b` |
| `openai` | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_CHAT_MODEL` | `https://api.openai.com/v1`, `gpt-4o-mini` |
| `gemini` | `GEMINI_API_KEY`, `GEMINI_CHAT_MODEL` | Modelo `gemini-1.5-flash`; endpoint definido no adaptador |
| `ollama` | `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL` | `http://localhost:11434/v1`, `llama3.2` |
| `custom` | `CUSTOM_API_KEY`, `CUSTOM_BASE_URL`, `CUSTOM_CHAT_MODEL` | `http://localhost:8000/v1`, `custom-model-rh`; API compatível com chat completions |

`ACTIVE_AI_PROVIDER` é derivado pelo código; não é necessário defini-lo. `localhost` no Render significa o próprio serviço Render, não sua máquina. Ollama/custom hospedados fora dele precisam de endpoint acessível e proteção adequada. Não publique um servidor local sem autenticação para viabilizar o teste.

Chat e chamadas compatíveis têm timeout de 15 segundos. A classificação rejeita saída fora do schema e mantém fallback por regras; isso não é prova de que o modelo interpretou corretamente. Não há pesquisa autônoma na internet no adaptador Gemini atual.

### Variáveis legadas ou de transporte ainda não ligadas ao motor novo

| Variável | Situação atual |
| --- | --- |
| `DATABASE_URL` | Modelagem Prisma legada; não é necessária para persistir pesquisas nesta API |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Fluxos JWT legados; não autenticam `/api/v1`, que usa Bearer de projeto. JWT_SECRET, se definido, deve ter ao menos 16 caracteres |
| `SKILLS_DIR` | Loader declarativo legado; não substitui SURVEY_ROOT nem cadastra pesquisas na API |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador Meta usado no serviço legado, não ativa transporte no app atual |
| `WHATSAPP_ACCESS_TOKEN` | Token de envio Meta legado; não confundir com a chave da API Equilibra |
| `WHATSAPP_VERIFY_TOKEN` | Verificação de webhook legado; não habilita endpoint público na aplicação nova |
| `WHATSAPP_API_VERSION` | Versão Graph do adaptador legado; padrão no código é `v20.0`, a revisar antes de integrar o transporte |

## 6. Chaves por projeto, usuários e permissões

Cada projeto consumidor recebe um segredo diferente. Exemplo estrutural, com placeholders:

```dotenv
API_CLIENTS_JSON={"equilibra":"<segredo-aleatorio-1-com-32-ou-mais-caracteres>","integracao-rh":"<segredo-aleatorio-2-com-32-ou-mais-caracteres>"}
```

IDs aceitam letras, números, hífen e sublinhado, até 64 caracteres. Não cadastre IDs que diferem apenas por maiúsculas/minúsculas ou nomes reservados do sistema, como CON e NUL. Segredos não podem ser repetidos. JSON inválido ou nenhuma chave válida impedem a inicialização.

O ID do projeto não é enviado no corpo: é resolvido pelo Bearer. Uma chave não acessa ciclos e tokens de outro projeto. A falha é 404, sem revelar se o recurso existe em outra partição. A mesma chave autoriza o backend a operar todo o seu projeto; não implementa papéis do RH ou permissões de pessoas.

Ao migrar da chave única para múltiplos projetos, preserve o ID `default` para continuar acessando os dados antigos. Trocar `default` por outro nome não migra arquivos. Para girar uma chave de autenticação, mantenha o ID e altere o segredo, atualizando os consumidores. Não altere a chave de cifragem sem um procedimento de migração dos dados.

Não use `NEXT_PUBLIC_`, `VITE_` ou outro prefixo público para segredos. O navegador chama o backend do seu site; esse backend autentica o usuário e faz a chamada à Equilibra. Não entregue a lista de tokens de convidados ao RH.

## 7. Publicação no Render

O Blueprint seleciona Render Free sem disco e usa PostgreSQL externo. Revise cotas e região no Render e no Neon. O processo pode suspender por inatividade; a persistência fica no banco. A alternativa file exige disco pago: arquivos no filesystem efêmero não são preservados. Fontes: [discos do Render](https://render.com/docs/disks) e [limitações do plano gratuito](https://render.com/docs/free).

1. Garanta que a versão desejada esteja no GitHub. `.old` e segredos devem permanecer fora do commit.
2. Entre em `https://dashboard.render.com/`, escolha New → Blueprint e conecte o repositório/branch.
3. Mantenha a raiz do serviço na raiz do repositório. O arquivo `render.yaml` define o backend sem mover sua arquitetura.
4. Revise Node 22, uma instância, plano Free sem disco e health check `/health`. Configure monitor funcional separado em `/ready`.
5. Confirme o build `npm ci --include=dev && npm run db:generate && npm run build` e o start `npm start`. O compilador é dependência de desenvolvimento, por isso `--include=dev` é necessário no build.
6. Preencha `SURVEY_DATABASE_URL`, `SURVEY_ENCRYPTION_KEY`, `GROQ_API_KEY` e `CORS_ORIGINS`. Confira `GROQ_CHAT_MODEL=qwen/qwen3.8-27b` ou outro modelo confirmado na sua conta. Gere a chave de cifragem como na seção 4.
7. O Render gera `SURVEY_API_KEY` para a primeira integração `default`. Copie-a do painel para o ambiente privado do consumidor. Nunca cole esse valor no repositório.
8. Preserve `SURVEY_STORAGE=postgres`, `SURVEY_ROOT=../skills`, `SURVEY_ALLOW_DEMO=true`, `SURVEY_MIN_GROUP=5`, `WHATSAPP_PAIRING_ENABLED=false` e `TRUST_PROXY_HOPS=1`, salvo mudança revisada. Não precisa de SURVEY_OUTPUT_DIR nesse modo.
9. Aguarde o build e o deploy. O processo deve registrar a porta, sem exibir segredos. Não fixe a porta manualmente: o Render fornece PORT.
10. Teste `/health`, `/ready` e `/openapi.json` no domínio HTTPS informado.
11. Faça uma pesquisa fictícia, reinicie o serviço e confirme a continuidade com os mesmos tokens e IDs.
12. Configure backups, retenção e alertas de falha de inicialização, erros de escrita, falta de espaço e excesso de requisições.

Se não houver site consumidor ainda, uma origem local como `http://localhost:3000` permite iniciar os testes. Chamadas servidor-servidor sem Origin são aceitas. Uma origem autorizada não dispensa Bearer.

Para o serviço manual existente, atualize Settings e Environment com essa configuração, sem criar outro serviço. Um push não aplica automaticamente as variáveis do Blueprint. Mantenha uma instância/processo; o PostgreSQL rejeita versões concorrentes desatualizadas com 409 STORAGE_CONFLICT, mas não substitui uma fila distribuída. Redis de rate limiting não coordena mutações das pesquisas.

O [formato de Blueprint está documentado pelo Render](https://render.com/docs/blueprint-spec). Não é necessário usar o Dockerfile para esse deploy nativo Node. Não há serviço Render criado automaticamente por executar testes, push ou `npm start` na sua máquina.

## 8. Uso com um site hospedado na Vercel

A arquitetura suportada é: site/backend consumidor na Vercel → API Equilibra no Render → provedor de IA e PostgreSQL privado (ou disco no modo file). Cadastre no ambiente **privado** do projeto Vercel:

```dotenv
EQUILIBRA_API_URL=https://SEU-SERVICO.onrender.com
EQUILIBRA_API_KEY=<chave-do-projeto-consumidor>
```

`EQUILIBRA_API_URL` não deve incluir `/api/v1` se usar o cliente JavaScript fornecido, que acrescenta esse prefixo. Atualize o deploy do consumidor após mudar variáveis. Sua rota de servidor deve validar usuários e payloads antes de chamar a Equilibra.

Esta API não tem handler nem configuração de deploy direto em Vercel Functions. O armazenamento PostgreSQL já existe, mas entrypoint, fila e conexões usam ciclo de processo contínuo. Hospedagem como função exige adaptar/testar esse ciclo e a coordenação entre invocações; não basta exportar o Express ou usar `/tmp`. Consulte o [runtime Node.js da Vercel](https://vercel.com/docs/functions/runtimes/node-js).

## 9. Referência HTTP completa

Base local: `http://localhost:4000/api/v1`. Base remota: `https://SEU-SERVICO.onrender.com/api/v1`. O alias `/api` existe para compatibilidade, mas requer os mesmos campos/cabeçalhos da versão atual, inclusive Idempotency-Key na criação.

Em chamadas autenticadas:

```http
Authorization: Bearer <chave-privada-do-projeto>
Content-Type: application/json
```

Campos extras nos corpos são rejeitados. O limite global do corpo é 32 KB. Não envie arquivos, áudio, imagens ou histórico completo em `text`; esta versão recebe uma mensagem textual por chamada.

### GET /health

Público. Resposta 200:

```json
{"ok":true,"apiVersion":"1","dataUse":"sandbox"}
```

Indica processo respondendo, não sucesso do provedor de IA, da Meta ou da metodologia.

### GET /ready

Público. Retorna `{"ready":true}` com 200 após inicializar os estados. Durante inicialização ou falha de configuração retorna 503 com `{"ready":false}`. O entrypoint abre a porta em modo diagnóstico, bloqueia pesquisas e tenta inicializar novamente a cada 30 segundos. A página `/` e `/status.json` mostram indicadores sem segredos. `/health` com 200 nesse modo não significa que a API está pronta.

### GET /openapi.json

Público. Retorna OpenAPI 3.0.3. No Postman/Insomnia, importe por URL, ajuste a base para o servidor desejado e configure Bearer privado. A referência pública não contém credenciais ou resultados.

### POST /api/v1/surveys

Autenticado. Cabeçalho adicional obrigatório: `Idempotency-Key`, entre 1 e 80 caracteres com letras, números, hífen ou sublinhado.

```json
{"focusId":"exemplo","expectedParticipants":5}
```

| Campo | Regra |
| --- | --- |
| `focusId` | Nome do JSON em skills/focus, sem extensão; 1 a 80 caracteres do conjunto permitido |
| `expectedParticipants` | Inteiro entre 1 e 10000; número de convites/participações esperadas |

Resposta 201, com valores abaixo meramente ilustrativos:

```json
{
  "cycleId":"<uuid-retornado>",
  "participantTokens":["<token-1>","<token-2>","<token-3>","<token-4>","<token-5>"],
  "privacyNotice":"<aviso-da-pesquisa>",
  "openingMessage":"<apresentacao-fixa-mais-aviso-e-opcoes>",
  "demo":true
}
```

Cada token real tem 64 caracteres hexadecimais e é opaco; nunca o derive de telefone ou nome. A mesma chave de criação e o mesmo corpo devolvem o ciclo anterior. A mesma chave com corpo diferente retorna 409. Use uma chave nova apenas quando quiser uma nova pesquisa.

Não existe importação, upload ou edição de focus por esse endpoint. A definição deve estar no servidor antes de criar o ciclo. O motor congela uma cópia do roteiro/base no estado do ciclo, evitando que alterações posteriores mudem uma pesquisa em andamento.

### POST /api/v1/surveys/:id/start

Autenticado. Corpo:

```json
{"participantToken":"<token-real-retornado-na-criacao>"}
```

Resposta 200: `{"started":true,"reply":"<apresentacao-do-agente>"}`. A integração deve enviar `reply` como primeiro contato e só depois encaminhar as respostas do participante.

O método não envia mensagem por conta própria e não registra confirmação de entrega. Chamadas repetidas antes do aceite podem retornar a mesma abertura; o transporte deve impedir convites duplicados. Se já houver aceite, pausa, recusa ou conclusão, retorna `{"started":false}`. Nesse caso não há `reply` para enviar como novo convite.

### POST /api/v1/surveys/:id/messages

Autenticado. Corpo:

```json
{"participantToken":"<token-real>","messageId":"id-original-da-mensagem","text":"participar"}
```

`messageId` aceita o mesmo conjunto alfanumérico/hífen/sublinhado, de 1 a 80 caracteres. `text` é string de até 4000 caracteres. Se o canal externo usa IDs fora desse conjunto, gere uma representação estável e sem colisões no adaptador e preserve o mapeamento nas retentativas.

Respostas 200 podem conter:

| Campo | Como tratar |
| --- | --- |
| `reply` | Texto para o canal do participante |
| `optional: true` | Aprofundamento; não substituir o roteiro no cliente |
| `finished: true` | Participação individual concluída |
| `suspended: true` | Interrupção de segurança; demanda protocolo humano adequado |
| `duplicate: true` | Resposta já processada, devolvida novamente; evitar novo envio pelo transporte se já entregue |
| `consentAt`, `answered` | Informações mínimas quando o participante usa meus dados |

Esses campos não aparecem obrigatoriamente juntos. Não exija `finished: false` em toda mensagem: a ausência de true não significa conclusão. Trate estados com base nos campos efetivamente presentes.

Se a integração não chamou `/start`, o primeiro texto comum, inclusive `participar`, recebe a apresentação e não pula o aviso. Depois dela o aceite explícito inicia as perguntas. Os comandos de privacidade continuam disponíveis desde o primeiro contato.

### GET /api/v1/surveys/:id/report

Autenticado, sem corpo. Durante coleta:

```json
{"complete":false,"published":false,"report":null}
```

Todas as participações esperadas precisam concluir. Ao atingir esse estado, `complete` passa a true. O relatório só é publicado se houver grupo mínimo; por isso `complete:true` e `published:false` também é uma combinação válida.

Quando publicado, `report.table` contém linhas como:

```json
{"questionId":"carga","theme":"demandas","satisfaction":8,"riskIds":[]}
```

O número acima é ilustrativo. Não acrescente nomes, tokens ou falas à tabela. `satisfaction` é média das notas declaradas normalizadas pela direção da escala, ou null quando não houver base numérica suficiente. Texto livre não recebe nota inventada. `riskIds` contém apenas categorias com contagem mínima de respondentes; lista vazia não prova ausência de risco.

O relatório inclui também `schemaVersion`, `focusVersion`, `methodology`, `knowledgeVersions`, `riskCatalog`, `aiProvider`, `disclaimer` e `generalAnalysis`. O catálogo lista categorias de referência disponíveis, não apenas riscos observados. `aiProvider` é o nome do adaptador; não é um comprovante de que todas as classificações usaram o LLM com sucesso nem um registro completo do modelo/prompt.

Não há endpoint para baixar relatórios individuais, listar pessoas, modificar respostas, encerrar à força um ciclo ou publicar resultados abaixo de k. Os arquivos privados não devem ser servidos por diretório estático.

## 10. Exemplo executável em PowerShell

Use uma sessão privada na máquina de desenvolvimento. Disponibilize a chave por variável de ambiente `EQUILIBRA_API_KEY` sem colocá-la em arquivo versionado. O exemplo usa apenas dados fictícios e deve ser executado após configurar e iniciar o servidor.

```powershell
$base = 'http://localhost:4000'
$apiKey = $env:EQUILIBRA_API_KEY
if (-not $apiKey) { throw 'Configure EQUILIBRA_API_KEY no ambiente privado desta sessão.' }
$headers = @{ Authorization = "Bearer $apiKey" }
$createHeaders = @{
  Authorization = "Bearer $apiKey"
  'Idempotency-Key' = 'teste-ficticio-operacoes-001'
}
$creationBody = @{ focusId = 'exemplo'; expectedParticipants = 5 } | ConvertTo-Json
$cycle = Invoke-RestMethod -Method Post -Uri "$base/api/v1/surveys" `
  -Headers $createHeaders -ContentType 'application/json' -Body $creationBody
$cycleId = $cycle.cycleId
$participant = $cycle.participantTokens[0]

$startBody = @{ participantToken = $participant } | ConvertTo-Json
$invitation = Invoke-RestMethod -Method Post -Uri "$base/api/v1/surveys/$cycleId/start" `
  -Headers $headers -ContentType 'application/json' -Body $startBody
# Em uma integração real, o adaptador envia invitation.reply ao participante.

$acceptBody = @{
  participantToken = $participant
  messageId = 'aceite-original-001'
  text = 'participar'
} | ConvertTo-Json
$answer = Invoke-RestMethod -Method Post -Uri "$base/api/v1/surveys/$cycleId/messages" `
  -Headers $headers -ContentType 'application/json' -Body $acceptBody
$answer.reply

$result = Invoke-RestMethod -Uri "$base/api/v1/surveys/$cycleId/report" -Headers $headers
$result.published
```

O resultado ainda não estará publicado: somente uma das cinco participações foi iniciada, e nenhuma foi concluída. Continue enviando as respostas reais de teste às perguntas retornadas, cada mensagem com seu ID próprio. Conclua os cinco tokens da demonstração e consulte o relatório novamente. Não escreva um script para inventar respostas de colaboradores reais.

Na demonstração atual: a primeira pergunta exige número, a segunda texto e a terceira é extra pulável. Se houver aprofundamento, responda por escrito ou envie `pular`. O cliente deve seguir `reply` e os flags, não presumir que toda pesquisa futura terá essas três perguntas.

## 11. Cliente JavaScript e outros backends

Copie `backend/examples/api-client.mjs` para o backend consumidor. Ele não depende de npm externo e usa fetch com timeout de 30 segundos.

```js
import { EquilibraClient } from './api-client.mjs';
const api = new EquilibraClient(process.env.EQUILIBRA_API_URL, process.env.EQUILIBRA_API_KEY);
// Persista a chave da operação no consumidor antes de tentar criar.
const cycle = await api.createSurvey('exemplo', 5, 'teste-ficticio-operacoes-001');
const token = cycle.participantTokens[0];
const invitation = await api.start(cycle.cycleId, token);
// Seu transporte envia invitation.reply. O trecho abaixo representa um aceite recebido.
const next = await api.message(cycle.cycleId, token, 'aceite-original-001', 'participar');
const collective = await api.report(cycle.cycleId);
```

O cliente lança erro com `status`, `code` e `requestId` em respostas HTTP de erro. Não faz retentativas automáticas. Em outros idiomas, reproduza os métodos, cabeçalhos e JSON da seção 9; não há dependência do cliente JavaScript para usar a API.

## 12. Idempotência, concorrência e falhas

| Operação | Identificador estável | Resultado da repetição |
| --- | --- | --- |
| Criar pesquisa | Idempotency-Key por projeto | Mesmo ciclo/tokens com o mesmo corpo; 409 se o corpo mudar |
| Processar mensagem | messageId por participante | Resposta anterior com duplicate=true para o mesmo texto; 409 se mudar |
| Iniciar abertura | Ciclo/token | Mesma abertura antes do aceite; não comprova entrega nem bloqueia repetição de envio |
| Consultar relatório | Ciclo e chave do projeto | Leitura do estado confirmado |

Em timeout ou queda de conexão, não é possível deduzir se a operação foi confirmada. Repita com o mesmo identificador e o mesmo conteúdo. Gerar novo ID para uma retentativa pode processar a mensagem como nova resposta e avançar a pesquisa indevidamente.

O motor serializa mutações por projeto no processo e só confirma depois da gravação do snapshot. Não há lock distribuído. Uma chamada pode aguardar outras operações do mesmo projeto, especialmente se houver latência de IA. Ajuste carga e use fila de transporte; não mantenha um webhook externo esperando o modelo para devolver seu ACK.

Arquivos auxiliares de resultado e snapshot não formam uma transação multiarquivo. Uma queda pode deixar arquivo auxiliar órfão; a API considera o snapshot confirmado, não o número de arquivos. Retentativas usam nomes determinísticos de resultado. Não manipule ou conte arquivos para forçar conclusão.

## 13. Comandos e regras da conversa

| Mensagem | Efeito |
| --- | --- |
| `participar` | Aceite após a apresentação, antes de começar o roteiro |
| `ajuda` | Comandos e orientações de minimização |
| `meus dados` | Aviso e informações mínimas da sessão |
| `pausar` | Suspende a coleta atual |
| `retomar` | Retoma sessão pausada quando não revogada |
| `sair` ou `apagar` | Antes da conclusão, remove linhas da sessão e encerra participação; depois dela, orienta o canal de privacidade |
| `pular` | Somente pergunta extra não obrigatória ou aprofundamento |

A recusa não pode ser revertida simplesmente com `retomar`. Pausa, recusa ou abandono não contam como pesquisa respondida; um ciclo pode permanecer incompleto indefinidamente. Agendamento, data de fechamento, substituição de convidados e cancelamento administrativo ainda não têm endpoints.

Perguntas numéricas aceitam de 0 a 10, inclusive decimal com ponto ou vírgula. Para complementar use separador explícito: `8; comentário`. Números incidentais como `trabalho 8 horas` não são nota. Perguntas textuais recusam entrada vazia e texto composto apenas por número. Erro de formato não avança a pergunta.

Há no máximo três aprofundamentos por tema em toda a sessão. O servidor usa perguntas cadastradas na base; o modelo não escreve perguntas livres. Todas as obrigatórias devem ser respondidas para conclusão. A detecção demonstrativa de risco imediato suspende a conversa; não substitui protocolo humano de crise ou denúncia.

## 14. Preparar novas pesquisas e referências

Não há endpoint de upload de pesquisa, perguntas oficiais ou base de conhecimento. Essa administração é feita no repositório por desenvolvedores, com revisão apropriada antes do deploy.

1. Adicione referências estruturadas em `skills/database`, com origem verificável e versão.
2. Defina tema e IDs únicos de categorias; descreva gatilhos e até três redações de aprofundamento por categoria.
3. Adicione um JSON em `skills/focus`, usando o nome desejado como focusId da criação.
4. Defina versão, metodologia, aviso de privacidade e perguntas com source, theme, required e format.
5. Revise legalidade, pertinência, metodologia e fidelidade das fontes. Não chame pergunta da equipe de pergunta governamental.
6. Valide com os schemas de `backend/src/survey/schema.ts` e teste a criação/conversa em ambiente fictício.
7. Marque `approved` somente após aprovação efetiva. `SURVEY_ALLOW_DEMO=true` é exceção de demonstração, não aprovação.
8. Faça commit/deploy dos arquivos revisados e crie um ciclo novo para usar a versão nova.

O contrato focus permite 1 a 100 perguntas, com IDs únicos e pelo menos uma obrigatória. Cada pergunta tem id, theme, text (1 a 1000 caracteres), required (booleano), source (texto não vazio), format (`number` ou `text`) e higherIsBetter (booleano, padrão true). PrivacyNotice precisa ter ao menos 20 caracteres. Version e methodology são textos do responsável pela definição; o software não valida se representam instrumento científico.

Uma referência database contém id, version, approved, source (URL), theme, context (até 12000 caracteres) e risks (até 30). Cada risco tem id, label (até 150 caracteres), alarmTerms (termos com pelo menos 2 caracteres) e followups (até 3, de 1 a 600 caracteres). Campos extras são rejeitados. IDs de categoria devem ser únicos entre as referências carregadas.

A NR-1 não fornece um questionário universal único. Os arquivos `exemplo.json` são de demonstração e não valem como instrumento validado ou classificação legal de risco. As fontes normativas e limitações estão contextualizadas no README.

## 15. Persistência, backup, atualização e diagnóstico

### O que é gravado

No modo postgres, `equilibra_state` guarda o snapshot cifrado e sua versão por projeto; `equilibra_artifacts` guarda artefatos cifrados por projeto/ciclo/nome. Ambos são confirmados juntos em transação com controle de versão. Não há cópia local dos resultados. No modo file, o layout é:

```text
<SURVEY_OUTPUT_DIR>/<projectId>/
  .state.enc.json              Estado cifrado e recibos de operações
  <cycleId>/
    <sha256-do-token>.json     Síntese individual cifrada
    department.json           Resultado coletivo sem relato bruto
```

Sem SURVEY_OUTPUT_DIR em desenvolvimento, a base de saída é `skills/survey`. A chave AES-256-GCM fica no ambiente, não dentro desses arquivos. O estado guarda tokens opacos, notas, indícios, cópia do aviso, versão da pesquisa e instante de aceite; não guarda o texto bruto da resposta. A existência de tokens/mensageria significa pseudonimização, não anonimato irreversível.

Não apague `.state.enc.json`, não substitua a chave para tentar corrigir uma falha e não remova apenas um relatório para atender um pedido de exclusão: podem existir referências no snapshot e backups. O fluxo completo de direitos após conclusão ainda precisa ser implementado.

### Backup e restauração

Em postgres, faça backup consistente das duas tabelas pelo provedor ou ferramenta PostgreSQL e restaure em banco isolado com a mesma chave de cifragem e IDs de projeto. Valide `/ready`, continuidade e replay antes de adotar o procedimento. Nunca copie a chave junto ao backup. Os passos de volume abaixo se aplicam somente ao modo file:

1. Defina quem tem acesso ao volume e à chave, mantendo-os separados.
2. Faça cópia/snapshot do volume privado completo. Para uma cópia consistente dos arquivos, interrompa entradas e finalize o processo de forma controlada antes da cópia; snapshots online podem refletir a janela entre arquivos auxiliares e estado.
3. Não publique backups nem os coloque no GitHub.
4. Para restaurar, use um serviço isolado, uma instância e os arquivos no mesmo layout por projeto.
5. Configure a mesma chave de cifragem e os mesmos IDs de projeto. Use credenciais de acesso privadas de teste e dados adequados ao ambiente.
6. Inicialize, verifique /ready e retome uma operação conhecida para validar os recibos.
7. Documente o teste e só então decida o procedimento operacional de recuperação.

O servidor recusa estado que não consegue decifrar; não limpa os dados automaticamente para iniciar vazio. Rotação de cifragem com reprocessamento dos arquivos não está implementada. Versões anteriores que guardavam sessões apenas em memória não têm estado recuperável; arquivos isolados não são importados para recriar ciclos.

### Atualização

Reveja mudanças no contrato e no formato de estado antes de atualizar. O alias `/api` não elimina a exigência atual de Idempotency-Key. Mantenha backup e a chave, faça build/testes e publique uma versão por vez. Reinícios/desligamentos atendem SIGTERM/SIGINT, com limite de 25 segundos para concluir o fechamento. Operações sem confirmação devem ser repetidas pelo consumidor com os mesmos IDs.

### Erros e solução de problemas

Erros HTTP usam `{"error":{"code":"...","message":"...","requestId":"..."}}`, com X-Request-Id no cabeçalho. Rejeições da hospedagem/proxy antes de chegar à aplicação podem usar outro formato.

| Sintoma/código | Verificação e ação |
| --- | --- |
| Página em diagnóstico / 503 CONFIGURATION_REQUIRED | Configurar Bearer de 32+ caracteres, cifragem hexadecimal de 64 e conexão de banco; conferir JSON de clientes, piso k e pareamento; redeploy após mudar ambiente |
| Falha de recuperação | Conferir volume, IDs de projeto e chave original; não descartar o arquivo cifrado |
| Build sem tsc/tipos | Instalar com --include=dev, executar db:generate e manter raiz no repositório |
| Porta ocupada localmente | Usar porta livre ou encerrar o processo que você iniciou; atualizar a base do cliente |
| 400 INVALID_REQUEST | Conferir campos, tipos, formato do token/ID e JSON; schemas não aceitam campos extras |
| 400 IDEMPOTENCY_KEY_REQUIRED | Enviar Idempotency-Key válido no POST de criação |
| 401 UNAUTHORIZED | Conferir Bearer, projeto e precedência de API_CLIENTS_JSON; reiniciar/redeploy após mudar ambiente |
| 403 ORIGIN_NOT_ALLOWED | Cadastrar a origem exata; não desabilitar autenticação para resolver CORS |
| 404 NOT_FOUND | Conferir URL, cycleId e chave do projeto; não há listagem pública de ciclos |
| 409 IDEMPOTENCY_CONFLICT | Não reutilizar ID/chave com novo conteúdo; retry preserva o conteúdo original |
| 413 PAYLOAD_TOO_LARGE | Reduzir JSON para até 32 KB; text tem teto adicional de 4000 caracteres |
| 422 INVALID_SURVEY | Conferir focusId, arquivo presente no deploy e caminhos da base |
| 422 UNAPPROVED_SURVEY | Usar instrumento aprovado ou, só para fictícios, habilitar modo demo |
| 422 INVALID_KNOWLEDGE | Remover duplicidade de IDs de categorias na base revisada |
| 429 RATE_LIMITED | Respeitar Retry-After, controlar fila e revisar configuração de IP/proxy |
| 500 INTERNAL_ERROR | Verificar escrita, espaço, disponibilidade e configuração; usar requestId, sem logar corpo/segredos |
| 503 NOT_READY | Aguardar recuperação; investigar inicialização se persistir |
| Respostas funcionam mas IA não parece atuar | Pode haver fallback; conferir credencial/modelo/rede do provedor em teste controlado, sem registrar fala pessoal |
| Estado desaparece no redeploy | Conferir mesmo banco/IDs/chave em postgres; no modo file, SURVEY_OUTPUT_DIR deve ficar no disco anexado |
| Pesquisa não publica | Todas as participações esperadas precisam concluir e atingir k; recusa/pausa não contam |
| Média null ou riskIds vazio | Pode haver resposta textual, amostra insuficiente, supressão ou ausência de indício; não inferir ausência de risco |
| QR não aparece no Render | Pareamento está desligado e protegido por loopback; não é endpoint remoto de operação |

Arquivos locais que falhem na validação de schema também precisam de revisão do desenvolvedor; nem todo problema de base é uma falha do cliente HTTP. Nunca cole `.env`, chave, token ou relato em issue pública para diagnosticar um erro.

## 16. O que falta para operar com pessoas reais e WhatsApp

### Transporte e site

- Implementar envio de convites e respostas no canal escolhido, com mensagens/templates e regras do provedor vigentes.
- Validar assinatura do webhook, controlar duplicidade e confirmar recebimento rapidamente.
- Enfileirar o trabalho e usar outbox para reenvio sem disparos duplicados.
- Manter vínculo telefone-token em cofre separado; o motor recebe somente token e mensagem.
- Implementar usuários, papéis e autorização do site consumidor, sem expor sínteses individuais ao RH.
- Implementar atendimento humano e fluxos separados de denúncia, crise e pedidos formais, sem protocolos fictícios.

### Dados e metodologia

- Validar as perguntas, escalas, categorias e regras com os responsáveis apropriados, sem atribuir autoria governamental indevida.
- Definir aviso, base de tratamento, processadores, prazos e canal de direitos aplicáveis à operação.
- Implementar minimização/mascaramento de texto pessoal antes do provedor, retenção/expurgo e direitos após conclusão.
- Revisar contratos, retenção, treinamento e localização dos processadores; não presumir que a chave de API resolve esses pontos.
- Implementar proteção contra grupos sobrepostos, supressão complementar e comparações que permitam reidentificação.
- Validar qualidade da classificação com dados de teste anotados; auditar versões e limitações.
- Testar acesso indevido, vazamento, restauração, tratamento de incidentes e capacidade real de atendimento humano.

### Operação e escala

- Configurar backups, segredos, TLS, permissões de volume, alertas e limites de custo.
- Definir critérios de fechamento/desistência e agenda de pesquisas, que hoje não têm implementação administrativa.
- Medir carga e tamanho dos snapshots. O estado de cada projeto é carregado em memória e regravado por mutação.
- Para escala horizontal, evoluir snapshots para registros incrementais e coordenação distribuída; o PostgreSQL atual rejeita conflitos, mas não implementa fila distribuída. Não aumentar réplicas sobre o mesmo disco em modo file.

Esses itens são lacunas da implementação atual ou decisões necessárias à operação, não instruções para afirmar conformidade garantida. O checklist das seções anteriores permite instalar, publicar e integrar a API de homologação; não elimina essas pendências de uso real.
