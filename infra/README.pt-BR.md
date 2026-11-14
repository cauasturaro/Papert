# Infraestrutura

[English](README.md) · **Português**

Tudo o que é preciso para rodar o Papert localmente, além das definições das stacks AWS.

| Caminho | Conteúdo |
| --- | --- |
| `shared/` | Templates CloudFormation de filas, armazenamento e tabela de sessões, e a stack Serverless compartilhada |
| `postgres/` | Criação de schemas e roles, e as checagens de isolamento |
| `floci/` | Provisionamento da instância RDS emulada |
| `runner/` | Imagem dos runners locais de fila, que fazem o papel dos gatilhos Lambda |
| `ingress/` | Configuração do Nginx na frente do Web |
| `langfuse/` | Stack do Langfuse auto-hospedado |
| `ingestion/` | Ferramenta de redrive da dead-letter queue |
| `tests/` | Contratos offline sobre os templates e os arquivos Compose |

## Stack local

Requisitos: Docker Engine com Compose v2, Python 3 e OpenSSL. Reserve pelo menos 8 GB de
memória para o Docker.

| Comando | Resultado |
| --- | --- |
| `make up` | Cria o banco e os recursos AWS emulados |
| `make up-all` | Adiciona Core, Web, Seymour, os runners de fila e o Langfuse |
| `make demo` | A mesma stack com o modelo fake determinístico do Seymour, sem chave de API |
| `make down-all` | Para as stacks e mantém os volumes |

Abra http://localhost:3000 depois da subida e registre uma conta. O Langfuse roda em
http://localhost:3003; as credenciais de administrador geradas ficam em `.env.langfuse`.

## Credenciais

`make up` e `make langfuse-env` geram as credenciais. Os arquivos de exemplo são referência,
não arquivos para copiar. Mantenha os arquivos gerados com modo 0600.

- Adicione `OPENAI_API_KEY` ao `.env` antes de rodar os workers de fila.
- O setup rejeita credenciais em branco em um arquivo existente e nunca as rotaciona. Restaure
  as credenciais que pertencem aos volumes existentes.
- Somente em uma instalação nova, remova o arquivo de ambiente copiado e rode o setup de novo.
- Nunca remova um volume populado para consertar um template em branco.
- `make auth-env` e `make e2e-env` geram o `EDGE_PROXY_SECRET`, usado só no servidor, sem
  substituir credenciais existentes.

## Rede

Somente o ingress Nginx publica a porta do Web. Ele substitui os cabeçalhos de encaminhamento
escritos pelo cliente pelo endereço real da conexão, então o Next só é alcançável dentro da
rede do Compose. O Core continua publicado no loopback para depuração. A stack de testes
end-to-end publica o próprio ingress em `127.0.0.1:3100`.

## Operação

| Comando | Finalidade |
| --- | --- |
| `make up-apps` | Constrói as imagens de migração, roda as migrações do Core e depois as do Seymour, e sobe as aplicações. Reiniciar uma API não migra |
| `make smoke-apps` | Exige respostas saudáveis de banco das duas APIs |
| `make check-isolation` | Verifica que cada role de banco não tem acesso ao schema do outro serviço |
| `make smoke-queue` | Verifica a identidade das mensagens após um redrive em filas descartáveis. Precisa de boto3 no host |
| `make ingestion-redrive` | Reprocessa a dead-letter queue da ingestão depois que a causa da falha foi corrigida |
| `make check-serverless` | Roda os contratos offline dos templates e o lint do CloudFormation |

`make check-serverless` precisa antes de `python -m pip install -r infra/requirements-checks.txt`.
Ele não prova que um deploy na nuvem funciona.

Remover volumes é um reset destrutivo, não um desligamento normal.

## AWS

As stacks nunca foram implantadas. Elas provisionam as filas, o S3, o DynamoDB e as Lambdas e
APIs das aplicações, e deixam PostgreSQL, rede, hospedagem do Web e entrega de alertas por
conta de quem opera.

- [AWS deployment](../docs/deployment.md) (em inglês): pré-requisitos, ordem de release,
  confiança na borda e migrações.
- [Operations](../docs/operations.md) (em inglês): limites, monitoramento, retenção,
  recuperação e desmontagem.
