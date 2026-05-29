# Feature: Project Details

Base: `/api/v1/projects/:projectId/details`

Estrutura flexível para armazenar qualquer informação do projeto.

## Categorias

| Categoria | Uso típico |
|-----------|------------|
| `github` | Repositórios, branches, webhooks |
| `credentials` | Senhas, API keys, tokens |
| `scope` | Escopo, requisitos, entregáveis |
| `deployment` | Servidores, CI/CD, URLs de deploy |
| `environment` | Variáveis de ambiente |
| `documentation` | Links de docs, wikis |
| `links` | Figma, Notion, Slack |
| `notes` | Anotações livres |
| `custom` | Qualquer outro dado |

## Tipos de valor (`value_type`)

| Tipo | Descrição |
|------|-----------|
| `text` | Texto simples |
| `markdown` | Texto longo formatado |
| `url` | URL |
| `json` | Objeto estruturado (GitHub repo, config) |
| `secret` | Valor sensível (criptografado no banco) |

## Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Listar detalhes |
| POST | `/` | Criar detalhe |
| GET | `/:detailId` | Buscar um detalhe |
| PATCH/PUT | `/:detailId` | Atualizar |
| DELETE | `/:detailId` | Remover |

## Query params

- `category` — filtrar por categoria
- `grouped=true` — retorna `{ github: [...], scope: [...] }`
- `revealSecrets=true` — revela valores secretos (usar com cuidado; auth futuro)

## Exemplos

### GitHub (JSON)

```json
{
  "category": "github",
  "key": "main_repo",
  "label": "Repositório principal",
  "value_type": "json",
  "value": {
    "url": "https://github.com/org/repo",
    "branch": "main",
    "defaultBranch": "main"
  }
}
```

### Credencial (secret)

```json
{
  "category": "credentials",
  "key": "aws_access_key",
  "label": "AWS Access Key",
  "value_type": "secret",
  "value": "AKIA..."
}
```

### Escopo (markdown)

```json
{
  "category": "scope",
  "key": "phase_1",
  "label": "Fase 1 — MVP",
  "value_type": "markdown",
  "value": "## Entregas\n1. Auth\n2. Dashboard\n3. API REST"
}
```

## Regras

- `key` é única por projeto (normalizada para snake_case)
- Secrets são criptografados com `CREDENTIALS_ENCRYPTION_KEY`
- Na listagem padrão, secrets aparecem como `********`
- `metadata` (JSONB) aceita campos extras livres por item
