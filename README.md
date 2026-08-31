<div align="center">

# 🤖 MODEL — Headless AI Chatbot Platform

**A powerful, SaaS-ready, Headless AI Chatbot Framework trainable entirely via JSON skills.**  
*Zero UI lockdown, dynamic DOM scanner, multi-provider LLM support, native Web Grounding & deterministic guardrails.*

[![GitHub Repo](https://img.shields.io/badge/GitHub-TiagoFG--DEV%2FChatBot--Model-181717?style=for-the-badge&logo=github)](https://github.com/TiagoFG-DEV/ChatBot-Model)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express.js-Backend-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

<br/>

[✨ Funcionalidades](#-principais-funcionalidades) •
[🏗️ Arquitetura](#️-arquitetura-do-sistema) •
[🚀 Como Começar](#-como-começar-passo-a-passo) •
[🧠 Treinamento via JSON](#-como-treinar-o-chatbot-via-json) •
[🔌 Integração Headless](#-integração-headless-no-seu-site) •
[🎨 Exemplos Prontos](#-exemplos-visuais-incluídos) •
[📬 Contato](#-autor--contato)

---

</div>

## 🌟 O Que é o MODEL?

O **MODEL** é uma plataforma e framework de Chatbots inteligentes desenhado para máxima flexibilidade e desacoplamento. 

Ao contrário dos widgets convencionais que obrigam o uso de `<iframe>` ou temas visuais rígidos, o **MODEL adota o paradigma Headless**:
1. **Você define o design:** Crie seu chat com HTML/CSS puro, Tailwind, Bootstrap ou qualquer outro framework.
2. **O MODEL dá a vida:** Um script leve (`widget.js`) escaneia os atributos `data-saas-*` no seu DOM e conecta a lógica de streaming SSE em tempo real.
3. **Você treina em segundos:** Crie ou modifique personas, regras de domínio, limites, temas permitidos e bloqueados usando apenas um arquivo declarativo **`.skill.json`**.

---

## ✨ Principais Funcionalidades

| Recurso | Descrição |
| :--- | :--- |
| 🧩 **100% Headless (DOM Scanner)** | Sem iframes, sem estilos forçados. O chatbot adapta-se transparentemente ao design de qualquer página web. |
| 📄 **Treinamento Declarativo via JSON** | Defina personas, tom de voz, tópicos permitidos/bloqueados, limites de tokens e temperatura em arquivos `.skill.json`. |
| 🌐 **Multi-Provider LLM & Web Grounding** | Suporte nativo para **Google Gemini** (com Google Search ativo para pesquisa em tempo real), **OpenAI** (GPT-4o), **Groq** (Llama 3.1 ultra-rápido) e **Ollama** (modelos locais). |
| 🛡️ **DomainGate & Proteção Anti-Jailbreak** | Validação determinística de domínio antes de chamar a IA, bloqueando injeções de prompt, tópicos proibidos e ataques. |
| ⚡ **Streaming em Tempo Real (SSE)** | Respostas transmitidas token a token com latência mínima para o usuário final. |
| 🏢 **SaaS Multi-Tenant Ready** | Modelagem robusta no PostgreSQL com Prisma ORM (Tenants, Bots, Usuários, Conversas, Mensagens e Autenticação JWT). |
| 📦 **Monorepo Modular em TypeScript** | Pacote determinístico `@model/core` compartilhado com schemas Zod, orquestrador no backend e scripts de cliente. |

---

## 🏗️ Arquitetura do Sistema

O projeto é estruturado em um **Monorepo** moderno:

```text
ChatBot-Model/
├── backend/                  # Servidor Express, streaming SSE, providers de IA e Prisma ORM
│   ├── public/widget.js      # Script Headless injetável no frontend do cliente
│   ├── src/
│   │   ├── config/           # Validação rigorosa de variáveis de ambiente com Zod
│   │   ├── providers/        # Adapters de IA (Gemini com Web Search, OpenAI, Groq, Ollama)
│   │   ├── routes/           # Rotas de Auth, Chat Streaming, Skills e Widget Info
│   │   └── services/         # SkillLoader, PromptBuilder, ChatService e AuthService
│   └── prisma/schema.prisma  # Schema multi-tenant do PostgreSQL
├── packages/
│   └── core/                 # Core determinístico compartilhado (Schema Zod da Skill e DomainGate)
├── skills/                   # Conhecimento declarativo dos bots (*.skill.json)
└── docs/                     # Documentação de arquitetura, setup do banco e clientes de exemplo
    ├── cliente_culinaria_example/   # Exemplo: Blog gastronômico
    ├── cliente_mecanica_example/    # Exemplo: Terminal industrial brutalista
    └── cliente_site_exemple/        # Exemplo: Comunidade estilo Discord/Neon
```

### Fluxo de Execução (Sequence Diagram)

```mermaid
sequenceDiagram
  autonumber
  actor User as Usuário
  participant DOM as Site do Cliente (HTML/CSS)
  participant Widget as widget.js (Headless Scanner)
  participant API as Backend (Express + DomainGate)
  participant LLM as LLM Provider (Gemini / OpenAI / Groq / Ollama)
  participant Search as Google Search (Web Grounding)

  User->>DOM: Acessa página com data-saas-*
  DOM->>Widget: Carrega <script src="widget.js" data-skill="skill-name">
  Widget->>API: GET /api/widget/info?skillKey=skill-name
  API-->>Widget: Metadados da Skill (Nome, Fallback, etc.)
  
  User->>DOM: Digita dúvida e clica em Enviar
  Widget->>API: POST /api/widget/chat/stream (SSE)
  
  Note over API: DomainGate valida tópicos permitidos,<br/>bloqueados e injeções de prompt
  
  alt Violação de Regras / Fora de Domínio
    API-->>Widget: Mensagem de Fallback amigável
  else Mensagem Válida
    API->>LLM: Prompt Sintetizado + Histórico de Mensagens
    opt Informação requer busca web
      LLM->>Search: Consulta tempo real no Google
      Search-->>LLM: Resultados e referências
    end
    LLM-->>API: Stream de Tokens
    API-->>Widget: Server-Sent Events (SSE)
    Widget->>DOM: Renderiza tokens no template do cliente
  end
```

---

## 🧠 Como Treinar o Chatbot via JSON

Para criar um novo especialista ou alterar a inteligência de um bot existente, basta adicionar ou editar um arquivo `.skill.json` dentro da pasta `skills/`:

```json
{
  "id": "educational-robotics",
  "version": "1.0.0",
  "name": "Especialista em Robótica Educacional",
  "description": "Apoia educadores e estudantes em projetos com Arduino, sensores e programação embarcada.",
  "role": "Você é um especialista prático em robótica educacional. Ajuda a montar circuitos e depurar código.",
  "identity": {
    "display_name": "RoboEdu",
    "locale": "pt-BR",
    "avatar_hint": "kit de montagem, bancada escolar"
  },
  "personality": {
    "curiosity": "alta",
    "patience": "alta",
    "humor": "leve e situacional"
  },
  "tone": {
    "style": "direto, colaborativo, com exemplos práticos",
    "formality": "low"
  },
  "allowed_topics": [
    "Arduino",
    "ESP32",
    "sensores",
    "motores DC",
    "eletrônica básica",
    "C/C++ para Arduino"
  ],
  "blocked_topics": [
    "política",
    "medicina",
    "investimentos",
    "armas",
    "segurança de TI ofensiva"
  ],
  "keywords": [
    "arduino",
    "sensor",
    "ponte h",
    "i2c",
    "pwm"
  ],
  "response_rules": [
    "Se faltar informação essencial (placa, tensão), pergunte primeiro.",
    "Priorize segurança elétrica e polaridade.",
    "Mantenha trechos de código mínimos e bem comentados."
  ],
  "search_rules": {
    "enabled": true,
    "allowed_domains": ["arduino.cc", "docs.espressif.com"],
    "max_results": 5
  },
  "limits": {
    "max_tokens": 900,
    "temperature": 0.35
  },
  "fallback_message": "Isso não faz parte da minha área de robótica educacional — posso ajudar com Arduino, sensores e programação!"
}
```

---

## 🔌 Integração Headless no seu Site

Integre em **qualquer página web** em 3 passos simples:

### 1. Inclua o Script
```html
<script src="http://localhost:4000/widget.js" data-skill="educational-robotics"></script>
```

### 2. Adicione os Marcadores `data-saas-*`
```html
<div data-saas-container class="meu-chat-box">
  <!-- Área de Mensagens -->
  <div data-saas-messages class="historico-mensagens">
    
    <!-- Template para Mensagem do Usuário (oculto por padrão) -->
    <div data-saas-template-user style="display:none" class="msg-user">
      <div data-saas-content></div>
    </div>

    <!-- Template para Mensagem da IA (oculto por padrão) -->
    <div data-saas-template-ai style="display:none" class="msg-ai">
      <div data-saas-content></div>
    </div>

  </div>

  <!-- Campo de Entrada e Envio -->
  <div class="chat-input-row">
    <input type="text" data-saas-input placeholder="Digite sua dúvida..." />
    <button data-saas-send>Enviar</button>
  </div>
</div>
```

---

## 🎨 Exemplos Visuais Incluídos

Na pasta `docs/` você encontrará 3 implementações completas com designs radicalmente diferentes usando a mesma API:

| Exemplo | Estilo Visual | Persona & Skill |
| :--- | :--- | :--- |
| **RoboKids** | Discord / Dark / Neon | 🤖 `educational-robotics.skill.json` |
| **Mão na Massa** | Blog Gourmet / Aconchegante | 🍳 `culinary.skill.json` |
| **IronWorks** | Terminal Industrial Brutalista | ⚙️ `industrial-mechanics.skill.json` |

---

## 🚀 Como Começar (Passo a Passo)

### Pré-requisitos
- **Node.js** `>= 20.0.0`
- **PostgreSQL** ou **Docker** (para subir o banco de dados)
- Chave de API de IA (ex: **Google Gemini API Key**, OpenAI ou Groq) ou Ollama local.

### 1. Clonar o Repositório
```bash
git clone https://github.com/TiagoFG-DEV/ChatBot-Model.git
cd ChatBot-Model
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar as Variáveis de Ambiente
Copie o arquivo de exemplo no backend:
```bash
cp docs/.env.example backend/.env
```

Edite o `backend/.env` com as suas credenciais:
```env
PORT=4000
DATABASE_URL=postgresql://model:model@localhost:5432/model?schema=public
JWT_SECRET=sua-chave-secreta-super-segura-minimo-16-chars
SKILLS_DIR=../skills

# Provedor Ativo (exemplo com Google Gemini e busca na web nativa)
AI_PROVIDER=gemini
GEMINI_API_KEY=sua_gemini_api_key_aqui
GEMINI_CHAT_MODEL=gemini-1.5-flash
```

### 4. Inicializar o Banco de Dados (PostgreSQL + Prisma)
Se você utiliza Docker:
```bash
# Sobe o container PostgreSQL
docker compose -f docs/docker-compose.yml up -d

# Roda as migrações do Prisma
npm run db:push
```

### 5. Iniciar o Backend
```bash
npm run dev:backend
```
> O backend estará rodando em `http://localhost:4000` e o widget servido em `http://localhost:4000/widget.js`.

---

## 🛠️ Scripts Disponíveis

Na raiz do monorepo:

| Comando | Descrição |
| :--- | :--- |
| `npm run dev:backend` | Inicia o servidor backend em modo de desenvolvimento com hot-reload (`tsx watch`). |
| `npm run build` | Compila o core compartilhado (`@model/core`) e o backend em JavaScript para produção. |
| `npm run db:generate` | Gera o cliente do Prisma com os modelos atualizados. |
| `npm run db:push` | Sincroniza o schema do Prisma diretamente com o banco de dados. |
| `npm run db:studio` | Abre o painel visual Prisma Studio para visualizar e editar os dados. |

---

## 🗺️ Roadmap de Evolução

- [x] Arquitetura Headless com DOM Scanner (`widget.js`)
- [x] Treinamento de habilidades via arquivos `.skill.json`
- [x] Web Grounding nativo com Google Gemini Search
- [x] Streaming de respostas em tempo real via Server-Sent Events (SSE)
- [x] Validação determinística de tópicos e anti-jailbreak (DomainGate)
- [ ] Painel Web Administrativo para gerenciar skills visualmente
- [ ] Pipeline de Embeddings RAG com busca vetorial por Tenant
- [ ] Suporte a envio de anexos e áudio/voz

---

## 📬 Autor & Contato

Desenvolvido por **Tiago Gregorio (TiagoFG-DEV)**.

- **GitHub:** [@TiagoFG-DEV](https://github.com/TiagoFG-DEV)
- **Repositório:** [https://github.com/TiagoFG-DEV/ChatBot-Model](https://github.com/TiagoFG-DEV/ChatBot-Model)
- **E-mail:** [tiagop05gregorio@gmail.com](mailto:tiagop05gregorio@gmail.com)

---

<div align="center">
  <sub>Construído com foco em flexibilidade, desempenho e arquitetura limpa. ⭐ Se este projeto foi útil para você, considere deixar uma estrela no repositório!</sub>
</div>
