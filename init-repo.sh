#!/bin/bash
# ============================================================
# LicitaFácil — Script de setup do repositório GitHub
# Execute: chmod +x init-repo.sh && ./init-repo.sh
# ============================================================

set -e

echo ""
echo "════════════════════════════════════════════"
echo "  LicitaFácil — Inicializar repositório"
echo "════════════════════════════════════════════"
echo ""

# Solicitar dados
read -p "Seu usuário do GitHub: " GITHUB_USER
read -p "Nome do repositório (ex: licitafacil): " REPO_NAME
REPO_NAME=${REPO_NAME:-licitafacil}

echo ""
echo "📦 Iniciando git..."
git init
git add .
git commit -m "feat: LicitaFácil v2.0 - SaaS completo com IA"

echo ""
echo "🌐 Criando repositório no GitHub..."
echo "   (você pode fazer isso manualmente em github.com/new)"
echo "   Repositório: $GITHUB_USER/$REPO_NAME"
echo ""

# Tentar criar via GitHub CLI se disponível
if command -v gh &> /dev/null; then
  gh repo create "$REPO_NAME" --public --source=. --push
  echo "✅ Repositório criado e código enviado via GitHub CLI!"
else
  echo "GitHub CLI não encontrado. Configure manualmente:"
  echo ""
  echo "  1. Acesse github.com/new"
  echo "  2. Nome: $REPO_NAME"
  echo "  3. Deixe em branco (sem README, sem .gitignore)"
  echo "  4. Clique em 'Create repository'"
  echo "  5. Execute os comandos abaixo:"
  echo ""
  echo "  git remote add origin https://github.com/$GITHUB_USER/$REPO_NAME.git"
  echo "  git branch -M main"
  echo "  git push -u origin main"
fi

echo ""
echo "════════════════════════════════════════════"
echo "  Próximos passos:"
echo "════════════════════════════════════════════"
echo ""
echo "1. SUPABASE (banco de dados):"
echo "   → supabase.com → New project"
echo "   → Copie a connection string PostgreSQL"
echo ""
echo "2. CLOUDFLARE R2 (storage PDFs):"
echo "   → cloudflare.com → R2 → Create bucket: licitafacil-catalogos"
echo "   → Crie API Token com acesso ao R2"
echo ""
echo "3. RAILWAY (backend):"
echo "   → railway.app → New Project → GitHub repo → pasta: backend"
echo "   → Adicione as variáveis de ambiente do .env.example"
echo ""
echo "4. VERCEL (frontend):"
echo "   → vercel.com → New Project → GitHub repo → pasta: frontend"
echo "   → Root Directory: frontend"
echo "   → Output Directory: public"
echo ""
echo "5. ATUALIZAR URL da API:"
echo "   → Edite frontend/public/js/utils.js"
echo "   → Substitua a URL do Railway na linha ~5"
echo "   → git add . && git commit -m 'config: URL da API' && git push"
echo ""
echo "✅ Pronto! Sistema no ar em minutos."
echo ""
