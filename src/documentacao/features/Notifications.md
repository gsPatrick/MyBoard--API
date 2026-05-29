# Feature: Notifications (Tempo Real)

Base REST: `/api/v1/notifications`  
WebSocket: **Socket.io** em `/socket.io`

## REST

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar (header `X-User-Id`) |
| GET | `/unread-count` | Contagem não lidas |
| PATCH | `/:id/read` | Marcar como lida |
| PATCH | `/read-all` | Marcar todas |
| PATCH | `/:id/hide` | Ocultar |

Query: `unread=true`, `include_hidden=true`, paginação `page`/`limit`.

## Socket.io (cliente)

```javascript
import { io } from "socket.io-client";

const socket = io("https://sua-api.com", {
  path: "/socket.io",
  query: { userId: "uuid-do-usuario" },
});

socket.on("notification", (data) => {
  console.log("Nova notificação:", data);
});

socket.emit("subscribe", {
  userId: "uuid",
  projectId: "uuid",
  clientId: "uuid",
});
```

## Eventos emitidos

| event_type | Quando |
|------------|--------|
| `client.created` | Novo cliente |
| `project.created` | Novo projeto |
| `project.moved` | Projeto movido de pasta |
| `folder.created` | Nova pasta |
| `media.uploaded` | Upload concluído |
| `agenda.created` | Novo evento na agenda |

## Header temporário

Até implementar JWT, use `X-User-Id: <uuid>` nas requisições que disparam notificações.

Crie um usuário via `POST /api/v1/users` antes de testar.
