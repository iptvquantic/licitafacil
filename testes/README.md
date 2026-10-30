# Testes do LicitaFácil

| Teste | Comando | Precisa de |
|---|---|---|
| Leitor de catálogos (parser) | `node testes/leitor.test.js` | nada |
| API completa (51 verificações: cadastro, leitor, busca, segurança, planos, painel) | `node testes/api.test.js` | API rodando em `BASE` (padrão `http://localhost:3000`) com `ADMIN_EMAILS=admin@teste.com` e `DATABASE_URL` de um Postgres de teste |
| Leitura com IA (51 verificações: página por imagem, resposta cortada + continuação, falha da IA = `ok:false`, PDF já organizado sem gastar cota, fornecedor achado no catálogo, importação, busca no plural) | `node testes/ia.test.js` | API com a IA simulada: `node testes/mock-openrouter.js` (porta 4010) e a API com `OPENROUTER_BASE_URL=http://localhost:4010 OPENROUTER_API_KEY=chave-teste` |
| Navegador ponta a ponta (35 passos: importar catálogo primeiro, PDF do Prompt Mestre sem IA, OCR, IA de imagem e de texto, página cheia, conferência, busca "cabos", painel, celular) | `npm run arquivos && npm run e2e` (nesta pasta) | site em `SITE` (padrão `http://localhost:8080`) e a API com a IA simulada (como acima) |
| Acessibilidade (axe, WCAG AA; telas principais + importar + conferência, nos temas escuro, claro e Matrix) | `npm run acessibilidade` | o mesmo do teste de navegador |
| Sistema fora do ar (aviso na posição certa; 4 páginas × 3 larguras × 3 temas) | `npm run fora-do-ar` | só o site em `SITE` (a API é simulada como fora do ar) |

A IA simulada (`mock-openrouter.js`) tem atalhos para os testes: `POST /__reiniciar` recomeça a cota do dia e `POST /__demora?ms=N` deixa as respostas lentas (para ver a tela de progresso).

Nunca rode os testes contra o banco de produção: eles criam contas e dados de teste.
O GitHub roda os testes do leitor, da API e da leitura com IA a cada `git push` na `main` (`.github/workflows/testes.yml`).
