# MyBoard API

API de gerenciamento de projetos para desenvolvedores.

## Deploy com Docker (recomendado)

```bash
cp .env.example .env
# edite .env se necessário
docker compose up -d --build
```

No primeiro start o container:
1. Verifica/cria o banco `myboard`
2. Roda todas as migrations
3. Cria o usuário admin (se não existir)
4. Sobe a API na porta `4000`

## Deploy manual

```bash
cp .env.example .env
npm ci --omit=dev
npm run db:create
npm run migrate
npm run seed:admin
npm start
```

## Endpoints

- Health: `GET /health`
- API: `GET /api/v1/ping`
- Docs: `src/documentacao/`

## Repositório

https://github.com/gsPatrick/MyBoard--API.git
