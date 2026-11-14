# Core

[English](README.md) · **Português**

O sistema de registro do Papert: uma API NestJS com Prisma e PostgreSQL (schema `core`). É
dona de contas, roadmaps, workspaces, tentativas, aprovação, admissão de execuções e cotas.
Nunca chama um modelo.

## Módulos

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | Senhas com Argon2id, cookies de sessão JWE, limites de tentativas de login ([ADR 0003](../../docs/adr/0003-authentication-jwe-sessions.md)) |
| `study` | Roadmaps, workspaces, arquivos com autosave e checagem de revisão, tentativas, roadmaps de vitrine |
| `analysis` | Filtro de sintaxe em processo, executado antes de qualquer análise ser admitida |
| `executions` | Admissão, cotas, leases com fencing, validação de resultados, streaming de snapshots ([ADR 0001](../../docs/adr/0001-core-owns-approval-and-progression.md), [ADR 0002](../../docs/adr/0002-async-execution-pipeline.md)) |
| `sources` | Registro de uploads, controle da ingestão, links do visualizador de citações ([ADR 0005](../../docs/adr/0005-upload-ingestion-and-scoped-retrieval.md)) |
| `memory` | Conversas com o tutor, resumos de sessão e memória durável controlada por quem estuda |
| `community` | Catálogo de roadmaps publicados, busca, votos e favoritos |
| `engagement` | Sequências de estudo e conquistas de roadmap |
| `feedback` | Avaliações de respostas e relatos de alucinação, enviados ao Langfuse |
| `health` | Prova de prontidão: `GET /health` responde 503 quando o banco está inacessível |

## Estrutura

```
src/
  main.ts              ponto de entrada do servidor HTTP (contêineres)
  lambda.ts            ponto de entrada HTTP atrás do API Gateway
  lambda-context.ts    contexto Nest compartilhado pelos handlers Lambda sem HTTP
  http.ts              proteções HTTP compartilhadas pelos dois pontos de entrada
  app.module.ts        raiz de composição
  common/              primitivas de domínio, validação e adaptadores de banco e HTTP compartilhados
  <módulo>/
    domain/            regras e tipos de valor; ports/ declara o que o módulo precisa
    application/       casos de uso, contratos de entrada e mapeamento de respostas
    infrastructure/    controllers, adaptadores Prisma e AWS, lambda-handlers.ts, local-worker.ts
    <módulo>.module.ts ligação das dependências
```

As dependências apontam para dentro: `infrastructure/` → `application/` → `domain/`
([ADR 0004](../../docs/adr/0004-hexagonal-boundaries-and-accepted-exceptions.md)).
`src/architecture.spec.ts` quebra o build quando um import cruza essas fronteiras.

Toda função implantada é declarada em `serverless.yml`. As funções de controle chamadas pelos
workers não têm rota HTTP; localmente, os runners `local-worker.ts` chegam a elas por uma
ponte restrita ao loopback.

## Desenvolvimento

Para rodar a stack inteira, veja o [README do projeto](../../README.pt-BR.md#início-rápido).

```sh
npm ci
npm test            # testes unitários (Vitest)
npm run lint
npm run test:e2e    # HTTP + PostgreSQL; precisa de um banco migrado e de AUTH_TEST_DATABASE_URL
```

Mais no [guia de testes](../../docs/testing.md) (em inglês).
