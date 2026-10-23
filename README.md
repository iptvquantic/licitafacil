# LicitaFácil

SaaS para equipes de compras e licitação: cadastre fornecedores, leia os catálogos deles (PDF com texto, PDF escaneado ou foto) e encontre produtos por medida, norma ou código, indo direto ao contato de quem vende.

## Como funciona

| Parte | Onde roda | O que faz |
|---|---|---|
| Site (`frontend/public`) | Vercel | HTML/CSS/JS sem build. O **leitor de catálogos roda no navegador**: pdf.js lê PDFs com texto e tesseract.js faz OCR de escaneados e fotos (arquivos em `vendor/`). O arquivo nunca é enviado; só o texto. |
| API (`backend/src`) | Render | Node.js + Express. Organiza o texto em produtos (Prompt Mestre, JSON ou tabela), indexa para a busca técnica e, se o texto vier sem formato, pede à IA gratuita (OpenRouter) para organizar. |
| Banco | Supabase (PostgreSQL) | Tabelas `usuarios`, `fornecedores`, `catalogos`, `chunks`, `produtos`, `pagamentos`. As migrações rodam sozinhas ao iniciar a API (só aditivas) e ligam o RLS. |

Autenticação: JWT no `localStorage` + `Authorization: Bearer` (front e API em domínios diferentes).

## Rodar localmente

```bash
cd backend
cp .env.example .env   # preencha DATABASE_URL e JWT_SECRET
npm install
npm run dev            # API em http://localhost:3000
# em outro terminal
cd frontend && npx serve public -p 8080   # site em http://localhost:8080 (usa a API local)
```

## Publicar

`git push` na `main` publica sozinho: Vercel (site) e Render (API). As variáveis da API ficam no painel do Render (lista em `backend/.env.example`). O dono do sistema é definido por `ADMIN_EMAILS` e vê o **Painel do dono** (clientes, confirmação de pagamentos, link de nova senha, saúde do sistema e backup).

## Rotas principais da API

- `POST /api/auth/cadastro`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/plano/solicitar`
- `GET|POST /api/fornecedores`, `GET|PUT|DELETE /api/fornecedores/:id`, `GET /api/fornecedores/:id/produtos`
- `POST /api/extracao/texto/:fornecedorId` (texto lido no navegador ou colado), `POST /api/extracao/catalogo/:fornecedorId` (PDF lido no servidor, sem guardar)
- `POST /api/busca`, `POST /api/busca/responder`, `GET /api/busca/stats`
- `/api/admin/*` (somente `ADMIN_EMAILS`)
- `GET /api/health` (consulta o banco; mantém o Supabase ativo com o monitor de 5 em 5 minutos)
