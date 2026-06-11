# LicitaFácil v2.0 🚀

> SaaS de Gestão de Fornecedores com IA — 100% cloud, zero instalação local.

---

## 📋 Visão Geral

O **LicitaFácil** permite que equipes de compras e licitação:
- Cadastrem fornecedores e façam upload de catálogos PDF
- Busquem produtos/serviços com IA semântica híbrida
- Perguntem à IA sobre o conteúdo dos catálogos
- Gerenciem tudo por conta (multi-tenant, cada usuário vê só os seus dados)

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vercel)          Backend (Railway / Render)   │
│  HTML + CSS + JS vanilla    Node.js + Express            │
│  licitafacil.vercel.app  →  licitafacil-api.railway.app  │
│                                       │                  │
│                             Supabase (PostgreSQL)        │
│                             Cloudflare R2 (PDFs)         │
│                             OpenRouter (IA)              │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Deploy em 4 passos

### Passo 1 — Supabase (banco de dados)

1. Acesse [supabase.com](https://supabase.com) → **New project**
2. Anote a **Connection string** (URI do PostgreSQL)
3. No painel do Supabase, vá em **SQL Editor** e rode:
   ```sql
   -- Cole o conteúdo do arquivo backend/scripts/setup-db.js (a string SQL dentro)
   ```
   Ou suba o backend e rode `npm run setup` após configurar o DATABASE_URL.

### Passo 2 — Cloudflare R2 (storage de PDFs)

1. Acesse [cloudflare.com](https://cloudflare.com) → **R2 Object Storage**
2. Crie um bucket chamado `licitafacil-catalogos`
3. Nas configurações do bucket, habilite **Public access** (ou use signed URLs)
4. Crie um **API Token** com permissão de leitura/escrita no R2
5. Anote: Account ID, Access Key ID, Secret Access Key, Public URL

### Passo 3 — Backend no Railway

1. Acesse [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Selecione o repositório → pasta `backend`
3. Nas variáveis de ambiente, preencha (Settings → Variables):

```env
NODE_ENV=production
DATABASE_URL=postgresql://...   (do Supabase)
JWT_SECRET=gere-32-chars-aleatorios
OPENROUTER_API_KEY=SUA_CHAVE_OPENROUTER_AQUI
R2_ACCOUNT_ID=seu-account-id
R2_ACCESS_KEY_ID=sua-access-key
R2_SECRET_ACCESS_KEY=sua-secret-key
R2_BUCKET=licitafacil-catalogos
R2_PUBLIC_URL=https://seu-bucket.r2.dev
FRONTEND_URL=https://licitafacil.vercel.app
MAX_FILE_SIZE_MB=50
TRIAL_DAYS=15
```

4. Deploy automático ao fazer push no GitHub
5. Anote a URL pública (ex: `https://licitafacil-api.railway.app`)

> **Alternativa: Render.com**
> - New Web Service → conecte o repo → Root Directory: `backend`
> - Build Command: `npm install && npm run setup`
> - Start Command: `npm start`

### Passo 4 — Frontend no Vercel

1. Acesse [vercel.com](https://vercel.com) → **New Project** → importe o repositório
2. **Root Directory:** `frontend`
3. **Framework Preset:** Other (sem build)
4. **Output Directory:** `public`
5. Clique em Deploy

6. **IMPORTANTE:** Edite o arquivo `frontend/public/js/utils.js` e substitua a URL da API:
   ```javascript
   // Linha ~5 — substitua pela URL real do Railway/Render:
   : 'https://licitafacil-api.railway.app';
   ```
   Depois faça push — Vercel redeploy automático.

---

## 🔑 Variáveis de Ambiente

| Variável | Descrição | Onde obter |
|---|---|---|
| `DATABASE_URL` | URI PostgreSQL | Supabase → Settings → Database |
| `JWT_SECRET` | Chave secreta para JWT | `openssl rand -base64 32` |
| `OPENROUTER_API_KEY` | Chave da IA | [openrouter.ai](https://openrouter.ai) |
| `R2_ACCOUNT_ID` | ID da conta Cloudflare | Cloudflare → R2 |
| `R2_ACCESS_KEY_ID` | Access Key do R2 | Cloudflare → R2 → API Tokens |
| `R2_SECRET_ACCESS_KEY` | Secret Key do R2 | Cloudflare → R2 → API Tokens |
| `R2_BUCKET` | Nome do bucket | `licitafacil-catalogos` |
| `R2_PUBLIC_URL` | URL pública do bucket | Ex: `https://pub-xxx.r2.dev` |
| `FRONTEND_URL` | URL do Vercel | Ex: `https://licitafacil.vercel.app` |

---

## 👤 Gerenciar usuários

### Criar conta de teste
Acesse a URL e clique em "Criar conta grátis" — 15 dias de trial automático.

### Ativar plano manualmente
Via API (exemplo com curl):
```bash
curl -X POST https://licitafacil-api.railway.app/api/auth/ativar-plano \
  -H "Content-Type: application/json" \
  -d '{"email": "usuario@email.com", "plano": "mensal"}'
```

Ou o próprio usuário acessa **Configurações → Ativar Plano** após o pagamento no PagSeguro.

### Planos disponíveis
| Plano | Valor | Duração | Link PagSeguro |
|---|---|---|---|
| `mensal` | R$ 97/mês | 30 dias | https://pag.ae/81RuUMgB6 |
| `trimestral` | R$ 77/mês | 90 dias | https://pag.ae/81RuVe3jn |
| `anual` | R$ 57/mês | 365 dias | https://pag.ae/81RuVvkg6 |

---

## 🧪 Testar localmente

```bash
# 1. Clone o repositório
git clone https://github.com/SEU_USUARIO/licitafacil.git
cd licitafacil

# 2. Backend
cd backend
cp .env.example .env
# Edite .env com suas credenciais
npm install
npm run setup   # cria as tabelas
npm run dev     # roda em localhost:3000

# 3. Frontend (em outro terminal)
cd frontend
# Abra public/index.html com Live Server, ou:
npx serve public -p 5173
# Acesse http://localhost:5173
```

---

## 📁 Estrutura do projeto

```
licitafacil/
├── backend/
│   ├── src/
│   │   ├── server.js           ← ponto de entrada
│   │   ├── routes/
│   │   │   ├── auth.js         ← autenticação
│   │   │   ├── fornecedores.js ← CRUD + upload PDF
│   │   │   └── busca.js        ← busca + IA
│   │   ├── services/
│   │   │   ├── ai.service.js      ← OpenRouter
│   │   │   ├── busca.service.js   ← TF-IDF híbrida
│   │   │   ├── pdf.service.js     ← OCR + chunking
│   │   │   └── storage.service.js ← Cloudflare R2
│   │   ├── middleware/
│   │   │   └── auth.js         ← JWT middleware
│   │   └── utils/
│   │       ├── db.js           ← PostgreSQL pool
│   │       └── logger.js       ← Winston
│   ├── scripts/
│   │   └── setup-db.js         ← criar tabelas
│   ├── .env.example
│   ├── package.json
│   ├── railway.toml            ← config Railway
│   └── render.yaml             ← config Render
│
└── frontend/
    ├── public/
    │   ├── index.html          ← app principal (protegido)
    │   ├── login.html
    │   ├── cadastro.html
    │   ├── planos.html
    │   ├── recuperar.html
    │   ├── resetar.html
    │   ├── css/
    │   │   └── app.css         ← design system completo
    │   └── js/
    │       └── utils.js        ← utilitários + API calls
    ├── vercel.json             ← config Vercel
    └── package.json
```

---

## 🔌 API Reference

### Autenticação
```
POST /api/auth/cadastro      → cria conta + trial 15 dias
POST /api/auth/login         → retorna JWT em cookie
POST /api/auth/logout        → limpa cookie
GET  /api/auth/me            → dados do usuário logado
POST /api/auth/recuperar     → solicita reset de senha
POST /api/auth/resetar       → aplica nova senha via token
POST /api/auth/ativar-plano  → ativa plano pago
PUT  /api/auth/perfil        → atualiza nome/senha
```

### Fornecedores (requer login)
```
GET    /api/fornecedores              → lista paginada
POST   /api/fornecedores              → criar + PDF opcional
GET    /api/fornecedores/:id          → detalhes + catálogos
PUT    /api/fornecedores/:id          → atualizar
DELETE /api/fornecedores/:id          → soft delete
POST   /api/fornecedores/:id/catalogo → upload PDF
GET    /api/fornecedores/:id/catalogo/:cid/status → status
POST   /api/fornecedores/:id/catalogo/:cid/reprocessar
DELETE /api/fornecedores/:id/catalogo/:cid
```

### Busca e IA (requer login)
```
POST /api/busca           → busca híbrida TF-IDF
POST /api/busca/responder → pergunta à IA via OpenRouter
GET  /api/busca/stats     → estatísticas do usuário
```

### Health check (público)
```
GET /api/health → {"status":"ok","version":"2.0.0",...}
```

---

## 🛡️ Segurança

- JWT em cookie `httpOnly + Secure + SameSite=Lax`
- Senhas com bcrypt (12 rounds)
- Rate limiting: 200 req/15min geral, 20 req/15min no auth
- Helmet.js para headers de segurança
- Multi-tenant: cada query filtra por `usuario_id`
- Soft delete (dados nunca apagados permanentemente)
- Variáveis sensíveis nunca no código

---

## 🤖 Como a IA funciona

1. **Upload PDF** → extração de texto (pdf-parse → fallback)
2. **Chunking** → divide em blocos de 500 palavras com sobreposição de 50
3. **Embedding** → TF-IDF + bigramas para cada chunk
4. **Busca híbrida** → Score = 0.6 × keywords + 0.4 × cosine similarity
5. **Resposta IA** → top 5 chunks enviados para OpenRouter (Mistral 7B)

---

## 📦 Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | HTML5 + CSS3 + JS vanilla |
| Backend | Node.js 18+ + Express 4 |
| Banco | PostgreSQL (Supabase) |
| Auth | JWT + bcryptjs |
| Storage | Cloudflare R2 (S3-compatible) |
| IA | OpenRouter → Mistral 7B Instruct |
| Busca | TF-IDF + bigramas (implementação própria) |
| Deploy | Vercel (frontend) + Railway (backend) |

---

## 📞 Suporte

- Email: suporte@licitafacil.com.br
- Planos: [licitafacil.vercel.app/planos.html](https://licitafacil.vercel.app/planos.html)
