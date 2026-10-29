# Testes do LicitaFácil

| Teste | Comando | Precisa de |
|---|---|---|
| Leitor de catálogos (parser) | `node testes/leitor.test.js` | nada |
| API completa (51 verificações: cadastro, leitor, busca, segurança, planos, painel) | `node testes/api.test.js` | API rodando em `BASE` (padrão `http://localhost:3000`) com `ADMIN_EMAILS=admin@teste.com` e `DATABASE_URL` de um Postgres de teste |
| Navegador ponta a ponta (28 passos: PDF, OCR, colar, busca, IA, painel, celular) | `npm run arquivos && npm run e2e` (nesta pasta) | site em `SITE` (padrão `http://localhost:8080`), API local com IA simulada (`node mock-openrouter.js` + `OPENROUTER_BASE_URL=http://localhost:4010 OPENROUTER_API_KEY=chave-teste`) |
| Acessibilidade (axe, WCAG AA) | `npm run acessibilidade` | o mesmo do teste de navegador |

Nunca rode os testes contra o banco de produção: eles criam contas e dados de teste.
O GitHub roda o teste do leitor e o da API a cada `git push` (`.github/workflows/testes.yml`).
