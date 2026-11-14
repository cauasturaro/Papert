# Ingestion

[English](README.md) · **Português**

O worker que processa os documentos enviados como fontes de um workspace: uma Lambda em
Python, executada localmente como o serviço `ingestion-runner`.

Quem estuda envia arquivos PDF, DOC, DOCX e Markdown direto para o S3 depois que o Core os
registra. Para cada evento do S3, este worker:

1. pergunta ao Core se aquela versão exata do objeto pode ser processada;
2. confere se o conteúdo corresponde ao formato declarado;
3. extrai o texto com a sua localização (página, intervalo de linhas, ou parágrafo e título);
4. divide o texto em trechos sobrepostos que nunca atravessam uma página de PDF;
5. gera embeddings com a OpenAI;
6. substitui os vetores do documento no PostgreSQL com pgvector, em uma única transação com
   lock.

Arquivos escaneados, criptografados ou corrompidos falham com um código de erro estável em vez
de produzir texto inventado. Eventos duplicados ou fora de ordem são ignorados com os
sequencers do S3 e tombstones. Design:
[ADR 0005](../../docs/adr/0005-upload-ingestion-and-scoped-retrieval.md).

## Desenvolvimento

Para rodar a stack inteira, veja o [README do projeto](../../README.pt-BR.md#início-rápido).

```sh
python -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -m unit
```

Os testes unitários ficam ao lado do código em `src/`. Os testes do armazenamento de vetores
em `tests/` usam `-m integration` e precisam de `INGESTION_TEST_DATABASE_URL`, uma conexão
como `seymour_user` a um banco com pgvector e as migrações Alembic do Seymour aplicadas.

## Manutenção

Execute a partir da raiz do repositório:

| Comando | Finalidade |
| --- | --- |
| `make ingestion-redrive` | Devolve à fila as mensagens que foram para a dead-letter queue |
| `make ingestion-reindex` | Extrai novamente todas as fontes já concluídas |

Trocar o modelo de embeddings ou o pipeline de extração exige uma janela de manutenção. O
procedimento e o tratamento de registros de fila com falha estão no
[guia de operação](../../docs/operations.md) (em inglês).
