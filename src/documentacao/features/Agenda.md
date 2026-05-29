# Feature: Agenda

Base: `/api/v1/agenda`

Todos os horários são interpretados e exibidos em **`America/Sao_Paulo`** (configurável via `APP_TIMEZONE`).

Internamente o banco armazena **UTC**. A API retorna:

```json
{
  "starts_at": "2026-06-15T17:30:00.000Z",
  "starts_at_display": {
    "utc": "2026-06-15T17:30:00.000Z",
    "local": "2026-06-15T14:30:00.000-03:00",
    "localFormatted": "15/06/2026 14:30",
    "timezone": "America/Sao_Paulo"
  }
}
```

## Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar eventos |
| POST | `/` | Criar evento |
| GET | `/:id` | Detalhe |
| PATCH | `/:id` | Atualizar |
| DELETE | `/:id` | Remover |

## Query params (listagem)

- `from`, `to` — intervalo (ISO local SP)
- `client_id`, `project_id`
- `status` — `scheduled`, `completed`, `cancelled`
- `include_hidden=true`

## Criar evento

```json
{
  "title": "Reunião de kickoff",
  "description": "Alinhar escopo MVP",
  "starts_at": "2026-06-15T14:30:00",
  "ends_at": "2026-06-15T15:30:00",
  "timezone": "America/Sao_Paulo",
  "all_day": false,
  "client_id": "uuid",
  "project_id": "uuid",
  "reminder_minutes_before": 30
}
```

Envie `starts_at`/`ends_at` como horário **local de São Paulo** (sem offset ou com offset -03:00).
