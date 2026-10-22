# Banco de dados Equilibra — modelagem e dicionário de dados

## 1. Escopo e fonte de verdade

Este documento descreve a implementação existente, não uma modelagem futura já implantada. Deve acompanhar a entrega final e ser atualizado em toda alteração de esquema, serialização, retenção ou integração. Leia também o [README](README.md) e o [manual da API](API.md).

Fontes de verdade no repositório:

| Arquivo | Responsabilidade |
| --- | --- |
| `backend/src/survey/postgres.ts` | DDL, transações, consultas, pool e concorrência do banco atual |
| `backend/src/survey/engine.ts` | Modelo lógico, snapshot, idempotência e geração dos resultados |
| `backend/src/survey/storage.ts` | Envelope de cifragem e escrita em arquivos |
| `backend/src/survey/schema.ts` | Validação de roteiros e conhecimento |
| `backend/src/api/clients.ts` | Identificação do projeto consumidor pela chave Bearer |
| `backend/src/config/env.ts` e `render.yaml` | Configuração e implantação |
| `backend/src/survey/postgres.test.ts` | Verificação automatizada da persistência PostgreSQL |
| `backend/prisma/schema.prisma` | Modelo legado, separado do armazenamento das pesquisas |

Há dois mecanismos alternativos para as pesquisas: `SURVEY_STORAGE=file` e `SURVEY_STORAGE=postgres`. Este manual prioriza PostgreSQL externo, usado pelo Blueprint Render Free. Alterar o mecanismo não copia dados automaticamente. A existência desta documentação e dos testes não comprova que um banco remoto já foi provisionado ou validado.

## 2. Organização e fronteiras dos dados

| Área | Conteúdo | Escrita e destino |
| --- | --- | --- |
| `skills/database/` | Referências e categorias de consulta em JSON | Desenvolvedores versionam; o chatbot apenas consulta. Não é o servidor PostgreSQL |
| `skills/focus/` | Instrumentos, perguntas, formatos e aviso de privacidade | Desenvolvedores versionam; o motor consulta ao criar o ciclo |
| `skills/survey/` | Saída privada padrão no modo file | Motor grava; ignorada pelo Git, salvo arquivos de manutenção como `.gitkeep` |
| PostgreSQL das pesquisas | Estado e resultados cifrados no modo postgres | Motor grava nas duas tabelas documentadas abaixo; sem cópia local de saída |
| Backend consumidor | Contas, permissões do site e eventual vínculo telefone–token | Responsabilidade separada; não há tabela de funcionário/telefone no motor |
| Banco Prisma legado | Antiga modelagem de usuários, bots e conversas | Não é usado pelo fluxo atual `/api/v1/surveys` |

O roteiro e o conhecimento são copiados para dentro do estado cifrado do ciclo, preservando as versões usadas naquela coleta. Atualizar os arquivos de referência não altera automaticamente ciclos já criados. Não cadastrar departamentos ou pessoas com nomes identificáveis nos IDs técnicos.

## 3. Modelagem conceitual e lógica

```text
Projeto consumidor (ID resolvido pela chave Bearer)
└── Estado do projeto
    ├── Recibos de criação de ciclos
    └── Ciclos de pesquisa (0..N)
        ├── Cópia do roteiro e do conhecimento
        ├── Participações por token opaco (1..N)
        │   ├── Progresso, aceite e comandos
        │   ├── Linhas de análise por pergunta respondida (0..N)
        │   └── Recibos de processamento de mensagens (0..N)
        └── Agregado coletivo (0..1)

Estado do projeto (1) ─── (0..N) Artefatos do projeto
                                  ├── Síntese individual cifrada
                                  └── Resultado coletivo cifrado
```

As entidades ciclo, participação e resposta são **objetos lógicos dentro de um snapshot cifrado**, não tabelas SQL normalizadas. Não há tabelas SQL `surveys`, `participants`, `questions` ou `answers` nesta implementação. O banco não consegue consultar uma nota ou um risco dentro do ciphertext por SQL.

Um projeto consumidor não é automaticamente uma empresa ou um departamento. A associação entre ciclo e departamento é responsabilidade do sistema consumidor; o motor não possui coluna `department_id`. Um projeto pode conter vários ciclos. Cada ciclo gera exatamente a quantidade de tokens solicitada em `expectedParticipants`.

## 4. Modelo físico atual

O adaptador executa este DDL com `CREATE TABLE IF NOT EXISTS` na inicialização do armazenamento. Os nomes não são qualificados por schema: a resolução usa o `search_path` da conexão. Configure um schema controlado e não permita que usuários não confiáveis criem objetos nesse caminho.

```sql
CREATE TABLE IF NOT EXISTS equilibra_state (
  project_id text PRIMARY KEY,
  ciphertext text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equilibra_artifacts (
  project_id text NOT NULL REFERENCES equilibra_state(project_id),
  cycle_id text NOT NULL,
  filename text NOT NULL,
  ciphertext text NOT NULL,
  PRIMARY KEY (project_id, cycle_id, filename)
);
```

Relação física: `equilibra_state.project_id` → `equilibra_artifacts.project_id`, cardinalidade 1 para 0..N. A FK tem o comportamento padrão, sem `ON DELETE CASCADE`. Não existe FK SQL para `cycle_id`, pois ciclos ficam dentro do snapshot. Excluir a linha de estado com artefatos vinculados é bloqueado pela integridade referencial; isso não constitui um fluxo de exclusão implementado pela aplicação.

Os índices existentes são os das chaves primárias. A PK composta dos artefatos atende buscas pelo prefixo `project_id`; não há índices adicionais, triggers, sequências, extensões ou tabelas de migração criados por este adaptador. Não há RLS implementada. O isolamento entre projetos é feito pela aplicação e por parâmetros `project_id` nas consultas, não por credenciais SQL individuais de cada projeto.

### 4.1. Dicionário de `equilibra_state`

| Coluna | Tipo SQL | Nulo/default | Chave e significado |
| --- | --- | --- | --- |
| `project_id` | `text` | Não; sem default | PK; ID estável da integração. Vem de `API_CLIENTS_JSON` ou é `default` com chave única |
| `ciphertext` | `text` | Não; sem default | Envelope JSON serializado contendo o snapshot cifrado; não é JSONB consultável |
| `version` | `integer` | Não; `1` | Versão de concorrência da linha; incrementada por atualização confirmada |
| `updated_at` | `timestamptz` | Não; `now()` | Instante da criação ou última atualização do estado, definido pelo SQL; não é trigger nem histórico de auditoria |

O formato dos IDs é validado na configuração: 1–64 caracteres alfanuméricos, `_` ou `-`; IDs também precisam ser únicos sem distinção de maiúsculas/minúsculas e não podem ser nomes reservados de sistema listados no código. O SQL usa `text` sem CHECK de formato/tamanho. Uma chave de autenticação não é armazenada nessa tabela. Mudar o ID da integração muda a partição acessada, sem migrar registros.

`version` da linha SQL não é a mesma coisa que `snapshot.version` ou `schemaVersion` dos relatórios. Não há CHECK SQL de positividade; a aplicação inicializa em 1 e incrementa. A primeira linha só é criada na primeira mutação confirmada; apenas iniciar a API não cria necessariamente uma linha por projeto.

### 4.2. Dicionário de `equilibra_artifacts`

| Coluna | Tipo SQL | Nulo/default | Chave e significado |
| --- | --- | --- | --- |
| `project_id` | `text` | Não; sem default | Parte da PK e FK para o estado do projeto |
| `cycle_id` | `text` | Não; sem default | Parte da PK; UUID gerado pela aplicação para o ciclo, armazenado como texto |
| `filename` | `text` | Não; sem default | Parte da PK; `<sha256-do-token>.json` para individual ou `department.json` para coletivo |
| `ciphertext` | `text` | Não; sem default | Envelope JSON serializado do relatório cifrado, inclusive o coletivo neste modo |

Não há coluna de criação, versão de relatório, status, nota ou contagem nessa tabela. Um UPSERT substitui o conteúdo do mesmo identificador composto; não mantém versões anteriores. Nome de arquivo aqui é um identificador lógico, não um arquivo servido publicamente. O hash do token não é prova de anonimização. O snapshot é a fonte de verdade para conclusão; não contar linhas de artefatos como participantes concluídos.

### 4.3. Envelope criptográfico

O campo SQL `ciphertext` contém uma string JSON com os campos abaixo. O campo interno de mesmo nome é o conteúdo cifrado propriamente dito.

| Campo interno | Tipo/formato | Significado |
| --- | --- | --- |
| `encryption` | String fixa `AES-256-GCM` | Algoritmo reconhecido pela aplicação |
| `iv` | Hexadecimal, 24 caracteres | IV aleatório de 12 bytes, novo a cada cifragem |
| `tag` | Hexadecimal, 32 caracteres | Tag de autenticação de 16 bytes |
| `ciphertext` | String Base64 | JSON cifrado em UTF-8 |

`SURVEY_ENCRYPTION_KEY` contém 32 bytes representados por 64 caracteres hexadecimais e fica fora do banco/Git. A mesma chave configurada no processo atende seus projetos; não há chave por tenant, identificador de chave no envelope, KMS ou rotação automática. Quem possui acesso ao banco e à chave consegue decifrar os registros. Metadados SQL, IDs, nomes, tamanhos e horários não são ocultados pela cifragem do payload. O código não configura AAD para vincular o envelope à PK.

## 5. Dicionário do snapshot decifrado

Todos os campos desta seção ficam **dentro da cifragem**, salvo indicação em contrário. Os tipos são da serialização da aplicação, não colunas SQL.

### 5.1. Raiz, ciclos e recibos

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `version` | Número inteiro, atualmente `1` | Versão do formato do snapshot |
| `creationReceipts` | Array de pares `[chave, recibo]` | Cache persistente das criações idempotentes por projeto |
| `cycles` | Array de objetos | Ciclos do projeto |
| `cycles[].id` | String UUID | ID do ciclo |
| `cycles[].focus` | Objeto `Focus` | Cópia do roteiro, versão, metodologia e aviso |
| `cycles[].knowledge` | Array de `Knowledge` | Cópia das referências aceitas na criação |
| `cycles[].expected` | Inteiro de 1 a 10.000 | Total esperado de participações |
| `cycles[].sessions` | Array de pares `[token, sessão]` | Participações por token aleatório de 32 bytes em hexadecimal |
| `cycles[].aggregate` | Objeto opcional | Relatório coletivo quando publicável; também há artefato correspondente |
| `recibo.hash` | String SHA-256 hexadecimal | Hash do conteúdo usado para detectar reutilização conflitante |
| `recibo.response` | Objeto | Resposta da operação para replay sem novo avanço |

No recibo de criação, o hash é calculado sobre `JSON.stringify({focusId,expected})` e a resposta inclui tokens dos convites. No recibo de mensagem, o hash é do texto recebido e o cache guarda a resposta do motor, não a fala original. Hashes são dados derivados: podem permitir testar hipóteses sobre entradas previsíveis; não tratá-los como anonimização irreversível. Não há expiração automática dos recibos.

### 5.2. Participação (`Session`)

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `introduced` | Booleano opcional | Indica apresentação inicial; ausente antes dela |
| `consentAt` | String ISO 8601 opcional | Instante do comando de aceite `participar`; o registro técnico não resolve sozinho a base legal da operação |
| `index` | Inteiro | Posição da próxima pergunta do roteiro, iniciando em zero |
| `rows` | Array de `Row` | Análises das perguntas respondidas |
| `counts` | Objeto tema → inteiro | Quantidade de aprofundamentos já programados por tema, no máximo três pelo motor |
| `pending` | Array de strings | Perguntas de aprofundamento pendentes, provenientes da base |
| `done` | Booleano | Participação concluída |
| `paused` | Booleano | Participação pausada por comando ou regra de segurança |
| `revoked` | Booleano | Coleta encerrada por `sair`/`apagar` antes de concluir |
| `messages` | Array de strings | IDs processados; Set em memória |
| `receipts` | Array de pares `[messageId, recibo]` | Respostas e hashes para replay; Map em memória |

Map e Set são convertidos para arrays ao salvar e reconstruídos ao carregar. O token é opaco, mas continua permitindo correlação de uma participação. O transporte deve manter telefone–token separado do banco das pesquisas. O comando de remoção anterior à conclusão limpa linhas e pendências, mas não elimina todos os recibos/metadados; não equivale a expurgo completo de banco e backups.

### 5.3. Linha de análise (`Row`)

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `questionId` | String | ID da pergunta do roteiro |
| `theme` | String | ID do tema |
| `satisfaction` | Número de 0 a 10 ou `null` | Nota declarada; se `higherIsBetter=false`, armazena `10 - nota`. Texto não recebe nota inferida |
| `riskIds` | Array de strings | IDs de indícios permitidos pela base do ciclo; não são diagnósticos ou classes legais automáticas |
| `analysisStatus` | String | Distingue análise por IA de fallback por regras explícitas |

Aprofundamentos atualizam `riskIds` da linha anterior; não criam nova linha nem nota. Pergunta opcional pulada não cria linha. Ausência de indício não comprova ausência de risco. Não há campo para relato bruto, nome, telefone, CPF, e-mail ou diagnóstico.

## 6. Dicionário das referências incorporadas

IDs dos objetos abaixo usam o padrão `^[a-zA-Z0-9_-]{1,80}$`. Os schemas Zod rejeitam propriedades extras. São entradas versionadas de arquivos; não tabelas SQL independentes.

| Objeto | Campos e regras |
| --- | --- |
| `Focus` | `id`: ID; `version`: string; `approved`: booleano; `methodology`: string; `privacyNotice`: string com pelo menos 20 caracteres; `questions`: 1–100 perguntas, IDs únicos e pelo menos uma obrigatória |
| `Focus.questions[]` | `id`, `theme`: IDs; `text`: string de 1–1.000 caracteres; `required`: booleano; `source`: string não vazia; `format`: `number` ou `text`; `higherIsBetter`: booleano, default `true` |
| `Knowledge` | `id`: ID; `version`: string; `approved`: booleano; `source`: URL; `theme`: ID; `context`: string de até 12.000 caracteres; `risks`: até 30 categorias |
| `Knowledge.risks[]` | `id`: ID; `label`: string de até 150 caracteres; `alarmTerms`: array de strings com pelo menos 2 caracteres cada; `followups`: até 3 strings de 1–600 caracteres |

Os IDs de risco precisam ser únicos no conjunto carregado para o ciclo, verificação feita no motor. Relações entre tema/pergunta/categoria são lógicas, sem FK SQL. A flag `approved` é um controle cadastrado pela equipe, não uma certificação emitida pelo governo. O modo demonstrativo permite entradas não aprovadas somente para dados fictícios.

## 7. Dicionário dos relatórios

| Campo | Tipo | Conteúdo |
| --- | --- | --- |
| `schemaVersion` | Inteiro, atualmente `1` | Versão do relatório |
| `focusVersion` | String | Versão do roteiro |
| `methodology` | String | Metodologia cadastrada |
| `knowledgeVersions` | Array `{id, version}` | Referências utilizadas |
| `riskCatalog` | Array `{id, label, theme, source}` | Catálogo de categorias da base, sem falas |
| `aiProvider` | String | Nome do provedor configurado; não guarda o identificador do modelo nem prova sucesso de cada classificação |
| `disclaimer` | String | Identifica análise de IA/regras e limita diagnóstico/classificação oficial |
| `table` | Array | Individual: linhas `Row`; coletivo: `questionId`, `theme`, `satisfaction`, `riskIds` |
| `generalAnalysis` | String | Síntese padronizada produzida pelo código; não é reprodução de relato nem parecer clínico |

O relatório individual é criado na conclusão de cada participação. O coletivo só é produzido quando todos os convidados esperados concluíram e o total atende `SURVEY_MIN_GROUP` (mínimo configurável de cinco). Cada média exige pelo menos k notas numéricas na pergunta; cada categoria exige pelo menos k participantes com esse indício. Itens suprimidos não indicam inexistência de risco. A API retorna `complete`, `published` e `report`; complete pode ser true sem publicação por insuficiência de grupo.

Em PostgreSQL, individual e coletivo são cifrados em `equilibra_artifacts`. Em file, individual é cifrado, mas `department.json` é JSON sem cifragem de aplicação e deve ficar em volume privado. A API atual não oferece endpoint de download individual; o agregado autorizado é devolvido por `/surveys/:id/report`. Ter um artefato não significa haver rota pública para ele.

## 8. Fluxo transacional, concorrência e recuperação

1. A inicialização prepara as tabelas e lê o estado de cada projeto configurado. Estado ausente significa projeto vazio, não erro de recuperação.
2. Antes de uma mutação, a fila local do projeto aguarda a operação anterior e recarrega o estado do PostgreSQL.
3. O motor processa a operação, mantém cópia anterior para rollback em memória e prepara snapshot/artefatos cifrados. A chamada ao modelo acontece antes da transação SQL.
4. Abre `BEGIN`. Estado novo usa INSERT com `ON CONFLICT DO NOTHING`; estado existente usa UPDATE condicionado a `project_id` e `version` previamente lida.
5. Sem linha retornada, lança HTTP 409 `STORAGE_CONFLICT`. Não sobrescreve atualização concorrente silenciosamente.
6. Grava artefatos por UPSERT e confirma `COMMIT`. Só então a operação pode ser confirmada ao consumidor. Em erro, tenta `ROLLBACK` e restaura a cópia em memória.
7. Na retomada, a mesma chave/ID e conteúdo recuperam o recibo persistido. Conteúdo diferente gera `IDEMPOTENCY_CONFLICT`. Leituras de relatório também aguardam a fila local e recarregam o estado.

Consultas usam parâmetros `$1`, `$2` etc. Não há lock ou fila distribuída nem retry automático de conflitos no adaptador. Mantenha uma instância nesta fase; o consumidor precisa tratar retentativas preservando IDs e conteúdo. Uma queda após COMMIT e antes da resposta pode deixar operação confirmada com resposta perdida, recuperável pelo replay. O controle de versão protege o estado, mas não elimina custo de chamadas ao modelo repetidas em tentativas concorrentes.

O pool usa até 3 conexões, timeout de conexão de 15 segundos, timeout de instrução de 20 segundos e ociosidade de 30 segundos. Hosts remotos usam TLS com validação de certificado; localhost é aceito sem TLS para desenvolvimento. O adaptador remove da URI `sslmode`, `sslcert`, `sslkey` e `sslrootcert` para impedir que sobrescrevam sua configuração TLS. Não desabilitar verificação para contornar falhas.

O estado inteiro do projeto é lido/regravado; não há paginação por ciclo. Muitos ciclos/recibos aumentam memória, tráfego e tempo de gravação. A versão SQL é `integer`, sem estratégia implementada para esgotamento do contador. São limites para evolução, não autorização para aumentar réplicas sem testes.

## 9. Tudo que é necessário para configurar o banco

### Infraestrutura e responsáveis

- Projeto PostgreSQL dedicado à homologação, por exemplo Neon; escolha de região e cotas registrada pela equipe, sem contratação automática de plano pago.
- Banco, schema controlado, usuário e senha privados; conectividade de saída do Render e TLS funcionando. Registre nomes de recursos e responsáveis, nunca senhas na documentação.
- Usuário proprietário para criação inicial ou administrador que aplique o DDL; usuário de execução com CONNECT ao banco, USAGE no schema e SELECT/INSERT/UPDATE nas duas tabelas. A configuração inicial automática requer permissão CREATE no schema quando as tabelas ainda não existem. O código não cria roles nem grants e não precisa de DELETE para o fluxo normal.
- Gerenciador de segredos/variáveis privadas e cópia recuperável da chave de cifragem fora do banco.
- Política definida de backup, retenção, recuperação, acesso administrativo, incidentes e controle de custos. Nenhum prazo legal ou capacidade contratada é presumido pelo código.

### Variáveis

| Variável | Necessidade |
| --- | --- |
| `SURVEY_STORAGE=postgres` | Seleciona este adaptador; default local é file |
| `SURVEY_DATABASE_URL` | URI privada `postgresql://USUARIO:SENHA@HOST/BANCO`; codificar caracteres especiais das credenciais. Não usar o exemplo literalmente |
| `SURVEY_ENCRYPTION_KEY` | Segredo aleatório independente, exatamente 64 caracteres hexadecimais; necessário para gravar e recuperar |
| `SURVEY_API_KEY` ou `API_CLIENTS_JSON` | Autenticação da integração e IDs de partição; chaves distintas de pelo menos 32 caracteres. JSON tem precedência |
| `SURVEY_ROOT` | Local das pastas de referências/roteiros; Blueprint usa `../skills` |
| `SURVEY_MIN_GROUP` | Inteiro >= 5; default 5. Não é coluna de banco |
| `SURVEY_ALLOW_DEMO` | `true` apenas para homologação com instrumentos demonstrativos e dados fictícios |
| Provedor de IA | Credencial/modelo e rede configurados conforme API.md; banco funcional não garante classificação pelo modelo |
| `NODE_ENV`, `NODE_VERSION`, CORS e proxy | Configuração de execução e segurança descrita em API.md; Blueprint usa produção e Node 22 |

`DATABASE_URL` é do Prisma legado e não substitui `SURVEY_DATABASE_URL`. `REDIS_URL` atende rate limiting, não guarda estado de pesquisa. Não é necessário `SURVEY_OUTPUT_DIR` no modo postgres. Credenciais de banco/cifragem/API não devem chegar ao navegador, arquivos de relatório, prints, logs ou commits.

### Preparação e aceite técnico

- [ ] Criar banco/schema/role e registrar responsável, ambiente, região, cotas e política de acesso.
- [ ] Configurar as variáveis privadas e garantir acesso às referências versionadas.
- [ ] Executar `npm ci --include=dev`, `npm run db:generate`, `npm run build` e `npm test` na raiz.
- [ ] Iniciar com `npm start`; validar `/ready` com 200. `/health` e página de status em diagnóstico não provam conexão funcional.
- [ ] Conferir as duas tabelas e constraints sem consultar/exportar payloads de participantes.
- [ ] Criar um ciclo fictício, responder, testar formato inválido, replay, conflito e isolamento entre projetos.
- [ ] Concluir pelo menos cinco participações fictícias e validar a publicação/supressão por pergunta.
- [ ] Reiniciar e retomar com os mesmos IDs/tokens; verificar ausência de resultados em disco efêmero.
- [ ] Testar backup/restauração e falha com chave errada em ambiente isolado.
- [ ] Registrar versão do código, evidências sem dados sensíveis e pendências antes da entrega final.

`npm run db:generate` gera o cliente Prisma necessário à compilação legada: não cria estas tabelas nem migra o banco. Não executar `db:push` ou `db:migrate` supondo que implantem o modelo das pesquisas; esses comandos apontam para o schema Prisma legado. O adaptador atual não usa Prisma Migrate.

## 10. Backup, retenção e mudanças de esquema

Backup deve capturar as duas tabelas de forma consistente e preservar versões compatíveis do código. Guarde a chave de cifragem separadamente, com acesso restrito e procedimento de recuperação. O backup do banco sem a chave não permite restaurar o conteúdo; a chave sozinha também não recupera registros perdidos. Preserve IDs de projeto e registre os identificadores de versões de software e referências da entrega.

Restaure primeiro em banco isolado, configure a chave original por canal privado, valide `/ready`, replay e um ciclo conhecido fictício. Nunca testar restauração sobrescrevendo o banco em uso. Defina e ensaie metas operacionais de perda máxima aceitável (RPO) e tempo de recuperação (RTO); o projeto não fornece garantia desses tempos nem programa backups automaticamente.

Não existem expurgo por prazo, exclusão completa de ciclo/participação, remoção coordenada de backups, trilha administrativa imutável ou rotação de cifragem implementados. O comando `apagar` não substitui esse processo. Antes de dados reais, projetar exclusão consistente de estado, recibos, artefatos, agregados e cópias de segurança, com análise dos responsáveis. Não fornecer SQL avulso de DELETE como se resolvesse direitos do titular.

`CREATE TABLE IF NOT EXISTS` não modifica tabelas antigas e não valida se colunas/constraints existentes são compatíveis. Mudanças futuras precisam de migração SQL versionada, revisão, backup, ensaio e plano de compatibilidade/rollback. Não há migração automática file → postgres, postgres → file nem recriptografia por troca de chave. Trocar a variável de armazenamento ou a chave não migra o conteúdo.

## 11. Privacidade e limitações documentadas

O banco não guarda texto bruto de respostas no modelo de pesquisa, mas o motor recebe esse texto e pode enviá-lo ao provedor de IA antes de descartá-lo. Não há mascaramento completo antes desse envio. Revisar contratos, configuração de logs do transporte, processadores e minimização antes de usar com pessoas reais. IPs/logs da infraestrutura e vínculos mantidos pelo consumidor também precisam de governança separada.

Tokens, hashes, recibos, metadados e eventual vínculo externo significam pseudonimização, não anonimato absoluto. Cifragem e grupos mínimos reduzem exposição, mas não garantem conformidade LGPD nem impedem toda reidentificação por grupos sobrepostos. Não conceder acesso ao banco ou à chave de cifragem ao RH para consultar participantes individuais. A API autentica projetos; o sistema consumidor precisa implementar usuários e permissões do próprio site.

Esta entrega permanece de homologação com dados fictícios até resolver as pendências metodológicas, de direitos, retenção, atendimento humano e segurança descritas no README/API.md. Documentar limitações não equivale a implementá-las.

## 12. Schema Prisma legado — inventário separado

O arquivo `backend/prisma/schema.prisma` define os modelos abaixo usando `DATABASE_URL`. Eles não fazem parte das duas tabelas do motor atual. Este é um inventário do schema de código, não confirmação de que todas essas tabelas existam no banco remoto. Tipos nesta seção são **tipos Prisma**; o DDL real depende das migrações aplicadas.

```text
Tenant 1 ── N Bot 1 ── N Conversation 1 ── N Message
Tenant 0..1 ── N User 0..1 ── N Conversation
```

Nas relações opcionais, um User pode não ter Tenant e uma Conversation pode não ter User. Os arrays de relação do Prisma não são colunas físicas adicionais.

| Modelo | Campo | Tipo / regra | Finalidade |
| --- | --- | --- | --- |
| `Tenant` | `id` | String, PK, UUID default | Identificador |
| `Tenant` | `name` | String obrigatória | Nome cadastrado |
| `Tenant` | `slug` | String obrigatória, unique | Identificador legível |
| `Tenant` | `plan` | String, default `free` | Plano cadastrado |
| `Tenant` | `createdAt` | DateTime, default now | Criação |
| `Tenant` | `updatedAt` | DateTime, @updatedAt | Atualização pelo Prisma |
| `Tenant` | `users`, `bots` | User[], Bot[] | Relações, não colunas |
| `User` | `id` | String, PK, UUID default | Identificador |
| `User` | `email` | String obrigatória, unique | Credencial identificável legada |
| `User` | `passwordHash` | String obrigatória | Hash de senha; não reutilizar para participantes |
| `User` | `tenantId` | String opcional, FK | Tenant; onDelete SetNull |
| `User` | `role` | UserRole, default MEMBER | Enum OWNER, ADMIN ou MEMBER |
| `User` | `createdAt` | DateTime, default now | Criação |
| `User` | `updatedAt` | DateTime, @updatedAt | Atualização |
| `User` | `tenant`, `conversations` | Tenant?, Conversation[] | Relações |
| `Bot` | `id` | String, PK, UUID default | Identificador |
| `Bot` | `tenantId` | String obrigatória, FK, índice | Tenant; onDelete Cascade |
| `Bot` | `name` | String obrigatória | Nome |
| `Bot` | `skillKey` | String obrigatória | Chave de skill legada |
| `Bot` | `metadata` | Json opcional | Metadados livres |
| `Bot` | `createdAt` | DateTime, default now | Criação |
| `Bot` | `updatedAt` | DateTime, @updatedAt | Atualização |
| `Bot` | `tenant`, `conversations` | Tenant, Conversation[] | Relações |
| `Conversation` | `id` | String, PK, UUID default | Identificador |
| `Conversation` | `botId` | String obrigatória, FK, índice | Bot; onDelete Cascade |
| `Conversation` | `userId` | String opcional, FK, índice | User; onDelete SetNull |
| `Conversation` | `title` | String opcional | Título |
| `Conversation` | `createdAt` | DateTime, default now | Criação |
| `Conversation` | `updatedAt` | DateTime, @updatedAt | Atualização |
| `Conversation` | `bot`, `user`, `messages` | Bot, User?, Message[] | Relações |
| `Message` | `id` | String, PK, UUID default | Identificador |
| `Message` | `conversationId` | String obrigatória, FK, índice | Conversation; onDelete Cascade |
| `Message` | `role` | String obrigatória | Papel da mensagem |
| `Message` | `content` | String obrigatória | Conteúdo bruto no modelo legado; não usado para persistir respostas da pesquisa |
| `Message` | `createdAt` | DateTime, default now | Criação |
| `Message` | `conversation` | Conversation | Relação |

Não ligar automaticamente `User` ou `Message` às participações anônimas/pseudônimas. O legado admite identificação e conteúdo bruto; ativá-lo exige revisão específica. Os IDs `Tenant.id` e `equilibra_state.project_id` não possuem FK, equivalência ou sincronização implementadas.

## 13. Checklist obrigatório da documentação final

- [ ] README com arquitetura de pastas e limites do produto atualizado.
- [ ] API.md com ambiente, autenticação, contratos, erros e integração atualizado.
- [ ] DATABASE.md com modelagem física/lógica, dicionários e distinção do legado atualizado.
- [ ] Migrações e versões de payload documentadas para cada alteração efetiva.
- [ ] Inventário de recursos por ambiente e responsáveis registrado sem credenciais.
- [ ] Evidências de teste local e remoto separadas; não apresentar teste PGlite como teste de conexão Neon.
- [ ] Procedimentos de backup, recuperação, retenção, incidentes e acessos aprovados pelos responsáveis.
- [ ] Pendências não implementadas explicitadas; nenhum item considerado concluído só por estar documentado.

Os testes atuais exercitam DDL/transações em PGlite, recuperação, replay, isolamento entre projetos, conflito de escrita, artefatos cifrados e ausência de saída local no modo postgres. Eles não verificam a rede/TLS real do Neon, a política do provedor ou um plano de recuperação operacional. Essas validações exigem o ambiente configurado e devem constar das evidências finais.
