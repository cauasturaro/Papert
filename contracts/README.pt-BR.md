# Contratos de mensagens compartilhados

[English](README.md) · **Português**

Exemplos de todas as mensagens que atravessam uma fronteira entre serviços. A suíte Vitest do
Core e as suítes `pytest -m unit` do Seymour e do Ingestion carregam os exemplos direto deste
diretório, então produtores e consumidores são testados contra os mesmos arquivos. Não é
preciso nenhuma cópia gerada nem serviço de rede.

| Diretório | Produtor → consumidor | Fronteira exercitada |
| --- | --- | --- |
| `execution-job` | Core → Seymour | `SqsExecutionQueue.publish`, `decode_execution`, `ExecutionEnvelope` HTTP |
| `worker-event` | Seymour → Core | `encode_result`, `workerEvent` em Zod (progress, failed, completed e os cinco campos opcionais de resultado) |
| `execution-claim` | Seymour ↔ Core | `RpcControl.claim`, `workerControl`, `PrismaExecutionLifecycle.claim`; orçamentos de transporte/tutor/análise/geração/recomendação e respostas de ocupado/terminal |
| `execution-active` | Seymour ↔ Core | `RpcControl.active`, `workerControl` |
| `execution-failed` | Seymour ↔ Core | `RpcControl.failed`, `workerControl` |
| `execution-sources` | Seymour ↔ Core | `RpcControl.live_sources`, `workerControl` |
| `ingestion-begin` | Ingestion ↔ Core | `begin_request`, `document_answer`, `controlSchema`, `PrismaSourceRepository.begin` |
| `ingestion-complete` | Ingestion ↔ Core | `complete_request`, `completion_answer`, `controlSchema`, `PrismaSourceRepository.complete` |
| `ingestion-fail` | Ingestion ↔ Core | `fail_request`, `completion_answer`, `controlSchema`, `PrismaSourceRepository.fail` |
| `ingestion-removal` | Ingestion ↔ Core | `removal_request`, `removed_answer`, `controlSchema`, `SourceService.control` |
| `ingestion-reindex` | Ingestion ↔ Core | `reindex_request`, `document_answer`, `controlSchema`, `PrismaSourceRepository.reindex` |
| `ingestion-s3` | AWS S3/SQS → Ingestion | `decode_record`: notificações de criação, remoção, ignoradas e de teste do S3 |
| `ingestion-reindex-event` | CLI de manutenção do Ingestion/SQS → Ingestion | `reindex.main`, `decode_record` |

## Formato dos fixtures

Cada `fixtures.json` contém casos nomeados `valid` e `invalid`. Identificadores e valores são
sintéticos; são exemplos canônicos, não valores padrão.

- Mensagens usam `payload`.
- Casos de RPC pareiam `request` com `response`.
- Os payloads de eventos de ingestão são registros SQS, incluindo em `body` a mensagem do S3
  ou de quem opera codificada em JSON; `decoded` fixa a interpretação semântica.

Os testes de produtor chamam o construtor real e comparam a saída completa com o exemplo. Os
testes de consumidor chamam o parser real e verificam os campos decodificados. Os construtores
do Core que dependem de banco rodam com dublês de banco em memória, sem substituir o código
que monta a mensagem. S3 e SQS são produtores externos e não são chamados pelos testes
unitários.

## Política de rejeição

Todo caso inválido nomeia, em `rejection`, o `service` que deve rejeitá-lo e a classe da
exceção. A política de fronteira é explícita:

- O Core rejeita campos desconhecidos em RPCs e eventos.
- O Seymour rejeita campos desconhecidos em jobs.
- O Ingestion rejeita envelopes malformados de SQS, S3 e de quem opera.

Os adaptadores de resposta RPC e os serializadores de resultado em Python não validam por
conta própria entradas de schema não confiáveis, e estes testes não fingem que eles rejeitam
casos que só o serviço receptor valida. Os corpos opcionais de resultado dos workers
permanecem opacos aqui; os contratos de domínio de cada um validam o conteúdo.

## Alterando um contrato

Para adicionar um campo:

1. Amplie os consumidores para aceitar o novo campo. Consumidores estritos precisam aceitar um
   campo aditivo explicitamente antes que qualquer produtor o envie.
2. Adicione os exemplos compartilhados.
3. Atualize os produtores e todos os testes de consumidor e produtor em conjunto.

Para renomear um campo:

1. Adicione o campo substituto.
2. Migre produtores e consumidores, mantendo exemplos das duas formas suportadas.
3. Esvazie as mensagens antigas em fila e em processamento.
4. Remova o campo antigo.

Nunca atualize fixtures apenas para silenciar um serviço que está falhando: todo serviço que
toca a mensagem alterada precisa passar nos seus testes antes de a mudança ser entregue.
