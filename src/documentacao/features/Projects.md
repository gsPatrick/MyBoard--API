# Feature: Projects

Base: `/api/v1/projects`

Projetos funcionam como **arquivos** dentro de pastas (`folder_id`).

## Status do projeto

| Valor API | Label |
|-----------|--------|
| `draft` | Rascunho |
| `in_progress` | Em andamento |
| `completed` | Concluído |
| `cancelled` | Cancelado |
| `paused` | Pausado |

Default ao criar: **`in_progress`**.

Aliases legados (aceitos na API): `active` → `in_progress`, `archived` → `completed`.

## Prazo (deadline)

| Campo | Descrição |
|-------|-----------|
| `has_deadline` | `false` = sem prazo (default) |
| `due_date` | Obrigatório **somente** se `has_deadline: true` |

### Sem prazo

```json
{
  "name": "Projeto contínuo",
  "client_id": "uuid",
  "has_deadline": false
}
```

### Com prazo

```json
{
  "name": "MVP Cliente X",
  "client_id": "uuid",
  "has_deadline": true,
  "due_date": "2026-08-15",
  "status": "in_progress"
}
```

Para remover prazo depois: `PATCH` com `{ "has_deadline": false }` — limpa `due_date` automaticamente.

## Query params

- `status` — `in_progress`, `completed`, `cancelled`, etc.
- `has_deadline=true|false` — filtrar com/sem prazo
- `folder_id`, `include_hidden`, `include_inactive`, `importance_level`, `client_id`

## Outros campos

| Campo | Descrição |
|-------|-----------|
| `folder_id` | Pasta (null = raiz) |
| `importance_level` | `normal` → `vip` |
| `is_hidden` / `is_active` | Ocultar / ativar-desativar |
| `icon`, `color`, `cover_media_id`, `tag_ids` | UI e tags |

Ver [Workspace.md](./Workspace.md) para pastas.
