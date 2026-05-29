# Feature: Media (Uploads)

Base: `/api/v1/media`

## Tipos permitidos

JPEG, PNG, WebP, GIF, SVG, PDF, DOC/DOCX, XLS/XLSX, TXT, Markdown, ZIP.

Tamanho máximo: `UPLOAD_MAX_SIZE_MB` (default 25 MB).

## Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/upload` | Enviar arquivo (multipart) |
| GET | `/entity/:entityType/:entityId` | Listar mídias de uma entidade |
| GET | `/:id` | Metadados |
| GET | `/:id/download` | Download |
| DELETE | `/:id` | Remover |

## Upload (multipart/form-data)

| Campo | Descrição |
|-------|-----------|
| `file` | Arquivo (obrigatório) |
| `entity_type` | `client`, `project`, `user`, `project_detail`, `agenda_event`, `folder` |
| `entity_id` | UUID da entidade |
| `kind` | `avatar`, `cover`, `attachment`, `thumbnail` |

### Exemplos

- **Avatar do cliente:** `entity_type=client`, `kind=avatar`
- **Capa do projeto:** `entity_type=project`, `kind=cover`
- **Anexo no projeto:** `entity_type=project`, `kind=attachment`

Arquivos ficam em `UPLOAD_DIR` (default `./uploads`) e são servidos em `/uploads/...`.

Header: `X-User-Id` para registrar quem fez upload e disparar notificação.
