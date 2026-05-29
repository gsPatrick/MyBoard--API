# Referência de variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|----------|-------------|---------|-----------|
| `NODE_ENV` | Não | `production` | Ambiente |
| `PORT` | Não | `4000` | Porta HTTP |
| `APP_API_PREFIX` | Não | `/api` | Prefixo das rotas |
| `APP_TIMEZONE` | Não | `America/Sao_Paulo` | Fuso horário |
| `DB_HOST` | Sim | — | Host PostgreSQL |
| `DB_PORT` | Sim | `5432` | Porta PostgreSQL |
| `DB_NAME` | Sim | `myboard` | Nome do banco |
| `DB_USER` | Sim | — | Usuário |
| `DB_PASSWORD` | Sim | — | Senha |
| `DB_MAINTENANCE_DATABASE` | Não | `postgres` | DB para CREATE DATABASE |
| `DB_LOGGING` | Não | `false` | Log SQL |
| `CREDENTIALS_ENCRYPTION_KEY` | Sim (prod) | — | Criptografia de secrets |
| `JWT_SECRET` | Sim (prod) | `change-me-in-production` | Assinatura dos tokens JWT |
| `JWT_EXPIRES_IN` | Não | `7d` | Expiração do access token |
| `JWT_RESET_EXPIRES_IN` | Não | `1h` | Expiração do token de reset |
| `APP_URL` | Não | `http://localhost:3000` | URL do frontend (links de e-mail) |
| `SMTP_HOST` | Não | — | Servidor SMTP (opcional) |
| `SMTP_PORT` | Não | `587` | Porta SMTP |
| `SMTP_SECURE` | Não | `false` | TLS direto (porta 465) |
| `SMTP_USER` | Não | — | Usuário SMTP |
| `SMTP_PASS` | Não | — | Senha SMTP |
| `SMTP_FROM` | Não | — | Remetente dos e-mails |
| `SEED_ADMIN_EMAIL` | Não | `patrickgsiqueira@hotmail.com` | Email do super admin |
| `SEED_ADMIN_PASSWORD` | Não | — | Senha do admin inicial |
| `SEED_ADMIN_NAME` | Não | `Patrick Gomes` | Nome do admin |
| `UPLOAD_DIR` | Não | `./uploads` | Pasta de uploads |
| `UPLOAD_PUBLIC_BASE_URL` | Não | — | URL pública dos arquivos |
| `UPLOAD_MAX_SIZE_MB` | Não | `25` | Tamanho máximo |
| `SOCKET_CORS_ORIGIN` | Não | `*` | CORS Socket.io |
| `SOCKET_PATH` | Não | `/socket.io` | Path Socket.io |

## Docker

```bash
docker compose up -d --build
```

O entrypoint roda automaticamente: `db:create` → `migrate` → `seed:admin` → `app.js`
