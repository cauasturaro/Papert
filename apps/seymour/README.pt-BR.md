# Seymour

[English](README.md) · **Português**

O tutor de IA do Papert: FastAPI, LangGraph e a API da OpenAI, com tracing no Langfuse. O
Seymour propõe. Ele nunca grava a progressão de quem estuda e não consegue ler o schema do
Core.

Os jobs chegam pela fila de chat. O worker reivindica cada um no Core sob um lease com fencing
e publica progresso e resultados na fila de resultados
([ADR 0002](../../docs/adr/0002-async-execution-pipeline.md)).

## Fluxos

| Módulo | O que faz |
| --- | --- |
| `tutor/` | Loop LangGraph entre o modelo e ferramentas somente leitura (`read_code`, `read_structure`, `read_criteria`, `read_test_evidence`, `search_sources`). Termina com uma resposta, ou falha explicitamente quando o orçamento de tokens ou o prazo acaba |
| `evaluation/` | Mapeia os arquivos e depois os avalia em no máximo duas chamadas ao modelo. Devolve um resultado por critério, que o Core valida ([ADR 0001](../../docs/adr/0001-core-owns-approval-and-progression.md)) |
| `roadmap/` | Rascunha um roadmap a partir do objetivo de quem estuda |
| `recommendation/` | Similaridade de embeddings sobre o catálogo da comunidade |
| `retrieval/` | Busca no pgvector restrita às fontes que o Core ainda reporta como prontas ([ADR 0005](../../docs/adr/0005-upload-ingestion-and-scoped-retrieval.md)) |
| `shared/` | Porta do modelo, política de fallback limitada, versões de prompt por hash de conteúdo e o tracer do Langfuse ([ADR 0006](../../docs/adr/0006-ai-reliability-feedback-and-evals.md)) |

## Desenvolvimento

Para rodar a stack inteira, veja o [README do projeto](../../README.pt-BR.md#início-rápido).

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m ruff check .
.venv/bin/pyright
.venv/bin/python -m pytest -m unit
```

Os testes unitários ficam ao lado do código em `src/`. Os de integração (`-m integration`)
ficam em `tests/` e precisam de `SEYMOUR_TEST_DATABASE_URL` apontando para um banco com
pgvector e as migrações Alembic aplicadas.

## Evals

```sh
.venv/bin/python -m evals.ci --offline    # grátis: checagens de datasets e avaliadores
.venv/bin/python -m evals.ci              # pago: pequeno subconjunto de tutor e pedagogia
```

Todas as outras suítes em `evals/` fazem chamadas **pagas** ao modelo e saem com código 1
quando não atingem os limiares. O gasto é limitado por `EVAL_SPEND_CAP_USD` (0.25 por padrão).

| Suíte | Mede |
| --- | --- |
| `evals.run_evaluation` | Veredictos de avaliação contra tentativas rotuladas; `evals.compare` bloqueia um candidato que regride |
| `evals.run_tutor` | Modos do tutor, ferramentas e prompts adversariais |
| `evals.run_pedagogy` | Se o tutor entrega a solução sob pressão |
| `evals.run_memory`, `evals.run_judge`, `evals.run_generation`, `evals.run_recommendation` | Memória, o juiz de feedback, geração de roadmaps e recomendações |

Limiares e critérios estão no [guia de testes](../../docs/testing.md#ai-quality-gates) (em
inglês).
