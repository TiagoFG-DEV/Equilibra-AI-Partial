# PostgreSQL + Prisma — organizar e fazer funcionar

Este guia alinha **Postgres**, **variáveis de ambiente**, **migrações Prisma** e **arranque** do MODEL.

---

## 1. O que fica onde (organização)

| Peça | Onde está | Função |
|------|-----------|--------|
| Modelo de dados | `backend/prisma/schema.prisma` | Tabelas: Tenant, User, Bot, Conversation, Message |
| Migrações SQL | `backend/prisma/migrations/` | Histórico de alterações à base (versionado) |
| Cliente Prisma | gerado em `node_modules/.prisma` | Acesso tipado à base no código |
| Uso no código | `backend/src/lib/prisma.ts` + serviços/rotas | Auth, conversas, mensagens |
| URL da base | `.env` → `DATABASE_URL` | Ligação ao Postgres |

Regra prática: **nunca** commits o `.env`; usa `.env.example` como modelo.

---

## 2. Subir o PostgreSQL

### Opção A — Docker (recomendado para desenvolvimento)

Na raiz do projeto:

```powershell
docker compose up -d postgres
```

Isto cria utilizador `model`, palavra-passe `model`, base `model`, porta **5432** (como no `docker-compose.yml`).

A `DATABASE_URL` local típica fica:

```text
postgresql://model:model@localhost:5432/model?schema=public
```

### Opção B — Postgres instalado no Windows

1. Cria uma base (ex.: `model`) e um utilizador com permissões nessa base.
2. Copia a connection string para `DATABASE_URL` no `.env` (formato `postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public`).

---

## 3. Configurar o `.env`

1. Garante que existe `DATABASE_URL` (obrigatória para o backend arrancar).
2. Mantém `JWT_SECRET` com **pelo menos 16 caracteres**.
3. `REDIS_URL` é **opcional**; vazio = rate limit em memória no processo Node.
4. `SKILLS_DIR=../skills` assume que corres o backend a partir da pasta `backend/`; se correres da raiz com outro cwd, ajusta o caminho ou usa caminho absoluto.

---

## 4. Instalar dependências e Prisma

Na **raiz** do monorepo:

```powershell
npm install
```

Gerar o cliente Prisma (sempre que mudares o `schema.prisma` ou após clone):

```powershell
npm run db:generate
```

---

## 5. Aplicar migrações (criar tabelas)

Com o **Postgres a correr** e `DATABASE_URL` correta:

**Desenvolvimento** (cria/atualiza migrações interativamente quando mudas o schema):

```powershell
npm run db:migrate -w backend
```

Na **primeira vez**, o Prisma aplica a migração existente em `backend/prisma/migrations/` e cria as tabelas.

**Produção / CI** (só aplica migrações já commitadas, sem prompts):

```powershell
cd backend
npx prisma migrate deploy
```

O `Dockerfile` do backend usa `prisma migrate deploy` no arranque do contentor.

---

## 6. Arrancar a aplicação (Modo SaaS)

Terminal 1 — **Backend (SaaS Core)**:
```powershell
npm run dev:backend
```
O backend ficará disponível em `http://localhost:4000`. Ele servirá o script `widget.js` e processará as skills.

Terminal 2 — **Exemplos (Clientes)**:
Você pode rodar qualquer um dos sites modelo para testar a versatilidade:
- **Robótica**: `cd cliente_site_exemple && npm start` (Porta 3000)
- **Culinária**: `cd cliente_culinaria_example && npm start` (Porta 3001)
- **Mecânica**: `cd cliente_mecanica_example && npm start` (Porta 3002)

---

## 7. Redis (Opcional)

- **Sem Redis:** Deixe `REDIS_URL` vazio no `.env`.
- **Com Redis:** `docker compose up -d redis` e configure `REDIS_URL=redis://localhost:6379`.

---

## 8. Ferramentas e Inspeção

```powershell
npm run db:studio -w backend
```
Abre o Prisma Studio para ver os Tenants e Conversas persistidos.

---

## 9. Tudo de uma vez (Checklist)

1. `docker compose up -d postgres`
2. `.env` (backend) configurado com `DATABASE_URL` e Chaves de IA.
3. `npm install` na raiz.
4. `npm run db:generate`.
5. `npm run db:migrate -w backend`.
6. `npm run dev:backend`.
7. Escolha um exemplo e rode `npm start` dentro da pasta dele.

O sistema agora está pronto para operar como um **SaaS Headless**, onde o mesmo backend atende múltiplos nichos com identidades visuais 100% customizadas.
