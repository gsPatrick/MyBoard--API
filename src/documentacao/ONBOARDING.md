# Onboarding — Deploy no Servidor

## Pré-requisitos

- Node.js 20+
- PostgreSQL 15+
- Pasta gravável para uploads

## Passos

```bash
cd backend
cp .env.example .env
# Configure DB_*, CREDENTIALS_ENCRYPTION_KEY, UPLOAD_DIR, APP_TIMEZONE
npm install
npm run db:create
npm run migrate
npm start
```

## Ordem das migrations

1. `clients`, `projects`, `project_details` (base)
2. `tags`, `users`, `media_files`
3. Alterações em `clients` e `projects`
4. `workspace_folders`, `agenda_events`, `notifications`
5. Seed de tags padrão

## Primeiro uso

```bash
# 1. Criar usuário (para notificações)
curl -X POST https://sua-api/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@dev.com","role":"admin"}'

# 2. Usar X-User-Id nas próximas requisições
curl -X POST https://sua-api/api/v1/clients \
  -H "Content-Type: application/json" \
  -H "X-User-Id: UUID-DO-USUARIO" \
  -d '{"name":"Acme","importance_level":"high","tag_ids":[]}'
```

## Verificação

- `GET /health` — status + timezone
- `GET /api/v1/ping` — versão v1
- Socket.io conecta em `/socket.io?userId=UUID`

## Estrutura de pastas da API

Ver [README.md](./README.md) e docs em `features/`.
