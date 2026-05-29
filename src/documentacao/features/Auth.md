# Auth & SaaS — MyBoard API

## Visão geral

MyBoard é um **SaaS multi-tenant**. Cada organização (tenant) tem seus próprios clientes, projetos, pastas, tags e usuários.

| Papel | Descrição |
|-------|-----------|
| `super_admin` | Dono da plataforma. `tenant_id = null`. Acesso global via painel admin. |
| `admin` | Administra a organização (usuários + dados). |
| `developer` | CRUD de clientes, projetos, pastas, agenda, uploads. |
| `viewer` | Somente leitura. |

## Endpoints públicos

Prefixo: `/api/v1/auth`

### Cadastro (cria tenant + admin)

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "name": "Patrick Gomes",
  "email": "patrick@empresa.com",
  "password": "senha123",
  "company_name": "Minha Empresa"
}
```

Resposta: `{ token, user, tenant }` — JWT válido por 7 dias (configurável).

Tags padrão (VIP, Urgente, etc.) são criadas automaticamente para o tenant.

### Login

```http
POST /api/v1/auth/login

{
  "email": "patrick@empresa.com",
  "password": "senha123"
}
```

Se o e-mail existir em **mais de uma organização**, a API retorna `409 TENANT_SELECTION_REQUIRED` com a lista de slugs. Nesse caso:

```json
{
  "email": "patrick@empresa.com",
  "password": "senha123",
  "tenant_slug": "minha-empresa"
}
```

### Esqueci a senha

```http
POST /api/v1/auth/forgot-password

{ "email": "patrick@empresa.com" }
```

Sempre retorna mensagem genérica (não revela se o e-mail existe).  
Com SMTP configurado, envia e-mail com link. Sem SMTP, o token aparece no log do servidor.

### Redefinir senha

```http
POST /api/v1/auth/reset-password

{
  "token": "<token do e-mail>",
  "password": "novaSenha123"
}
```

### Perfil autenticado

```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

### Alterar senha (logado)

```http
POST /api/v1/auth/change-password
Authorization: Bearer <token>

{
  "current_password": "senha123",
  "new_password": "novaSenha456"
}
```

## Autenticação nas demais rotas

Todas as rotas de dados exigem:

```http
Authorization: Bearer <token>
```

### Super admin operando em um tenant

```http
X-Tenant-Id: <uuid-do-tenant>
```

Ou query `?tenant_id=<uuid>` / body `tenant_id` em writes.

## Admin da plataforma

Prefixo: `/api/v1/admin` — apenas `super_admin`.

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/tenants` | Listar organizações |
| GET | `/tenants/:id` | Estatísticas do tenant |
| PATCH | `/tenants/:id` | Ativar/desativar, plano, nome |

## Super admin inicial

Criado automaticamente no deploy (`seed:admin`):

- E-mail: `SEED_ADMIN_EMAIL` (padrão `patrickgsiqueira@hotmail.com`)
- Senha: `SEED_ADMIN_PASSWORD` (padrão `patrick123`)
- Role: `super_admin`

## Planos

Campo `plan` em `tenants` reservado para billing futuro. Por enquanto é `null`.
