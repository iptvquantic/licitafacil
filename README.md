# LicitaFácil

SaaS para equipes de compras e licitação: importe o catálogo do fornecedor (PDF com texto, PDF escaneado ou foto), a IA lê página por página, cadastra o fornecedor e organiza os produtos; depois encontre produtos por medida, norma ou código, indo direto ao contato de quem vende.

## Como funciona

| Parte | Onde roda | O que faz |
|---|---|---|
| Site (`frontend/public`) | Vercel | HTML/CSS/JS sem build. O **importador roda no navegador** (`js/importador.js` + `js/leitor.js`): transforma cada página em imagem para a IA ler (ou usa o texto do PDF/OCR com pdf.js e tesseract.js, em `vendor/`), mostra a conferência e só então salva. O arquivo nunca é guardado. |
| API (`backend/src`) | Vercel (função `/api`, mesmo domínio do site, até 300 s por chamada) e Render (reserva) | Node.js + Express. Lê cada página com IA em streaming: **Google Gemini** primeiro (se houver `GEMINI_API_KEY`, chave grátis do Google AI Studio) e os modelos gratuitos do OpenRouter de reserva (escolhidos sozinhos). Tabelas vêm em formato compacto (colunas + linhas) e cada linha vira um produto; resposta cortada é aproveitada e o resto é pedido de novo. Reconhece texto já organizado (Prompt Mestre, JSON ou tabela) sem gastar IA, junta os dados do fornecedor, grava produtos e trechos e faz a busca técnica. O site testa `/api/health` no próprio domínio e, se não responder, usa o Render. |
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
- `POST /api/fornecedores/:id/produtos` (produto cadastrado à mão), `PUT|DELETE /api/fornecedores/:id/produtos/:pid` (corrigir ou excluir qualquer produto)
- `GET /api/extracao/capacidades`, `POST /api/extracao/pagina` (1 página lida pela IA), `POST /api/extracao/estruturar-bloco`, `POST /api/extracao/analisar` (sem IA), `POST /api/extracao/fornecedor`, `POST /api/extracao/importar`
- `POST /api/extracao/texto/:fornecedorId` (texto colado), `POST /api/extracao/catalogo/:fornecedorId` (PDF lido no servidor, sem guardar)
- `POST /api/busca`, `POST /api/busca/responder`, `GET /api/busca/stats`
- `/api/admin/*` (somente `ADMIN_EMAILS`)
- `GET /api/health` (consulta o banco e informa a configuração; a Action diária do GitHub mantém o Supabase ativo)

Testes: veja `testes/README.md` (leitor, API, leitura com IA simulada, Gemini simulado, navegador ponta a ponta, acessibilidade).

## IA da leitura de catálogos

| Variável (Vercel → Settings → Environment Variables) | Para quê |
|---|---|
| `GEMINI_API_KEY` | Recomendada. Chave grátis em aistudio.google.com → **Get API key**. Lê tabelas com mais precisão e sem a fila dos modelos gratuitos. Opcional: `GEMINI_MODELOS` (padrão `gemini-flash-lite-latest,gemini-flash-latest,gemini-2.5-flash-lite`). |
| `OPENROUTER_API_KEY` | Reserva (modelos `:free`, 50 leituras/dia; 1.000/dia com US$ 10 de créditos). |
| `IA_PRAZO_EXTRACAO_MS`, `IA_PARADO_MS`, `IA_PRIMEIRO_MS`, `IA_TENTATIVAS` | Ajuste fino (padrões: 270 s por página na Vercel, 60 s parada, 120 s até o 1º sinal, 5 modelos). |
