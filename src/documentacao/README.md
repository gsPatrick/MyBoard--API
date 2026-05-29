# Documentação da API — Patrick Colaborativo

Sistema de gerenciamento de projetos para desenvolvedores.

## Índice

| Documento | Descrição |
|-----------|-----------|
| [ONBOARDING.md](./ONBOARDING.md) | Deploy no servidor, migrar DB |
| [ENV_REFERENCE.md](./ENV_REFERENCE.md) | Variáveis de ambiente |
| [features/Clients.md](./features/Clients.md) | Clientes, tags, visibilidade |
| [features/Projects.md](./features/Projects.md) | Projetos como arquivos |
| [features/ProjectDetails.md](./features/ProjectDetails.md) | Detalhes flexíveis |
| [features/Workspace.md](./features/Workspace.md) | Pastas e árvore de arquivos |
| [features/Media.md](./features/Media.md) | Upload de imagens e PDFs |
| [features/Agenda.md](./features/Agenda.md) | Agenda (America/Sao_Paulo) |
| [features/Notifications.md](./features/Notifications.md) | Notificações + Socket.io |

## Modelo mental — Workspace

```
📁 Cliente Acme (opcional: workspace por cliente)
  📁 Backend
    📁 APIs
      📄 portal-dev        ← Project (arquivo)
      📄 auth-service      ← Project (arquivo)
  📁 Frontend
    📄 dashboard-snowui    ← Project (arquivo)
📄 projeto-soltos-raiz     ← Project sem pasta (folder_id = null)
```

- **Pastas** (`workspace_folders`) — aninhamento infinito
- **Projetos** — arquivos dentro das pastas (`folder_id`)
- **Detalhes** — conteúdo flexível dentro de cada projeto

## Domínios

```
Tag ←→ Client
Tag ←→ Project
Client (1) ──< Project (N) ──< ProjectDetail (N)
WorkspaceFolder (tree) ──< Project (N)
User (1) ──< Notification (N)
AgendaEvent → Client, Project, User
MediaFile → Client | Project | User | ...
```

## Prefixo

`/api/v1/...` — Health: `GET /health`, `GET /api/v1/ping`

## Tempo real

Socket.io em `/socket.io` — evento `notification` por usuário (`user:{userId}`).

Header temporário (até auth): `X-User-Id: <uuid>`
