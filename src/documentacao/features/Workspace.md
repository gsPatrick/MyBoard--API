# Feature: Workspace (Pastas)

Metáfora de **explorador de arquivos**: pastas contêm subpastas e projetos (arquivos).

Base: `/api/v1/folders`

## Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/tree` | Árvore completa + arquivos na raiz |
| GET | `/` | Listar pastas (filtros) |
| POST | `/` | Criar pasta |
| GET | `/:id/contents` | Conteúdo da pasta (subpastas + projetos) |
| PATCH | `/:id` | Atualizar / mover pasta |
| DELETE | `/:id` | Remover (só se vazia) |
| POST | `/move-project/:projectId` | Mover projeto para pasta |

## Query params

- `client_id` — workspace do cliente ou global se omitido
- `parent_id` — filtrar filhos de uma pasta (`null` = raiz)
- `include_hidden=true` — incluir ocultos
- `include_inactive=true` — incluir inativos

## Criar pasta

```json
{
  "name": "Backend",
  "parent_id": null,
  "client_id": "uuid-opcional",
  "color": "#8b5cf6",
  "icon": "folder",
  "sort_order": 0,
  "is_hidden": false,
  "is_active": true
}
```

## Mover projeto

```json
POST /api/v1/folders/move-project/:projectId
{ "folder_id": "uuid-da-pasta" }
```

`folder_id: null` move para a raiz.

## Resposta `/tree`

```json
{
  "tree": [{ "id": "...", "name": "Backend", "itemType": "folder", "children": [], "files": [] }],
  "rootFiles": [{ "id": "...", "name": "Projeto X", "itemType": "file" }]
}
```
