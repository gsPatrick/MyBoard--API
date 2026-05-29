# Feature: Clients

Base: `/api/v1/clients`

## Campos de visibilidade e importância

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `importance_level` | enum | `normal`, `important`, `high`, `critical`, `vip` |
| `is_hidden` | boolean | Ocultar da listagem padrão |
| `is_active` | boolean | Ativar/desativar sem excluir |
| `status` | enum | `active`, `inactive` (negócio) |
| `tag_ids` | uuid[] | Tags vinculadas (create/update) |
| `avatar_media_id` | uuid | Foto via upload |

## Query params

- `include_hidden=true` — mostrar ocultos
- `include_inactive=true` — mostrar inativos
- `importance_level` — filtrar grau
- `search`, `status`, `page`, `limit`

## Payload exemplo

```json
{
  "name": "Acme Corp",
  "email": "contato@acme.com",
  "importance_level": "vip",
  "is_hidden": false,
  "is_active": true,
  "tag_ids": ["uuid-tag-vip"]
}
```

Ver também: [Tags via GET /api/v1/tags](../features/Workspace.md)
