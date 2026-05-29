#!/bin/sh
set -e

echo "==> Preparando banco de dados..."
node scripts/create-database.js

echo "==> Executando migrations..."
npx sequelize-cli db:migrate

echo "==> Criando usuário admin (se não existir)..."
node scripts/seed-admin.js

echo "==> Iniciando API..."
exec node app.js
