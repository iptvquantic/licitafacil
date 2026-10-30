# LicitaFácil

SaaS para equipes de compras e licitação: importe o catálogo do fornecedor (PDF com texto, PDF escaneado ou foto), a IA lê página por página, cadastra o fornecedor e organiza os produtos; depois encontre produtos por medida, norma ou código, indo direto ao contato de quem vende.

## Como funciona

| Parte | Onde roda | O que faz |
|---|---|---|
| Site (`frontend/public`) | Vercel | HTML/CSS/JS sem build. O **importador roda no navegador** (`js/importador.js` + `js/leitor.js`): transforma cada página em imagem para a IA ler (ou usa o texto do PDF/OCR com pdf.js e tesseract.js, em `vendor/`), mostra a conferência e só então salva. O arquivo nunca é guardado. |
| API (`backend/src`) | Vercel (função `/api`, mesmo domínio do site) e Render (reserva) | Node.js + Express. Lê cada página com a IA gratuita do OpenRouter (modelos com visão escolhidos sozinhos), reconhece texto já organizado (Prompt Mestre, JSON ou tabela) sem gastar IA, junta os dados do fornecedor, grava produtos e trechos e faz a busca técnica. O site testa `/api/health` no próprio domínio e, se não responder, usa o Render. |
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

`git push` na `main` publica sozinho: Vercel (site + API em `frontend/api/index.js`) e Render (API reserva). As variáveis da API (lista em `backend/.env.example`) ficam no painel da Vercel (Settings → Environment Variables) e no do Render. O GitHub roda os testes a cada push e consulta a API uma vez por dia para o Supabase não pausar. O dono do sistema é definido por `ADMIN_EMAILS` e vê o **Painel do dono** (clientes, confirmação de pagamentos, link de nova senha, saúde do sistema e backup).

## Rotas principais da API

- `POST /api/auth/cadastro`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/plano/solicitar`
- `GET|POST /api/fornecedores`, `GET|PUT|DELETE /api/fornecedores/:id`, `GET /api/fornecedores/:id/produtos`
- `GET /api/extracao/capacidades`, `POST /api/extracao/pagina` (1 página lida pela IA), `POST /api/extracao/estruturar-bloco`, `POST /api/extracao/analisar` (sem IA), `POST /api/extracao/fornecedor`, `POST /api/extracao/importar`
- `POST /api/extracao/texto/:fornecedorId` (texto colado), `POST /api/extracao/catalogo/:fornecedorId` (PDF lido no servidor, sem guardar)
- `POST /api/busca`, `POST /api/busca/responder`, `GET /api/busca/stats`
- `/api/admin/*` (somente `ADMIN_EMAILS`)
- `GET /api/health` (consulta o banco e informa a configuração; a Action diária do GitHub mantém o Supabase ativo)

Testes: veja `testes/README.md` (leitor, API, leitura com IA simulada, navegador ponta a ponta, acessibilidade).
