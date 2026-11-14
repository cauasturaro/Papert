# AWS deployment

The AWS definitions are validated statically and have never been deployed. This guide states
what the checked-in stacks cover, what an operator has to provide, and the order to release in.

## Boundary

The checked-in stacks provision the queues, S3, DynamoDB and the application Lambdas and APIs.
They do **not** provision PostgreSQL, networking, Web hosting, DNS and TLS, an alert
destination or Langfuse hosting. The local Floci database provisioner is not a cloud database
setup.

## Parity with the local stack

Local resource names are unsuffixed for the emulator. Cloud stacks use stage-qualified names
and CloudFormation exports, and cloud S3 names also include the account and region. The local
templates model the same queue timeouts, redrive policy, storage notifications and DynamoDB
`expires` TTL contract. CI checks these settings and validates both the `dev` and `prod`
templates.

## Prerequisites

Provision these before deploying a stage:

1. **PostgreSQL 18 with pgvector**, backups and point-in-time recovery. Install the vector
   extension as an administrator, then run the schema and role setup SQL. Give the migration
   credentials schema ownership. Runtime roles should receive only the grants their service
   needs, with explicit cross-schema denial. The local convenience roles remain schema
   owners, so splitting migration and runtime roles in the cloud requires operator-managed
   grants.
2. **A VPC** with private Lambda subnets and security groups that permit database access.
   Provide outbound HTTPS through NAT or equivalent routing for the model providers, the AWS
   APIs and Langfuse. Use the same `subnetIds` and `securityGroupIds` parameters for every
   application stack.
3. **An HTTPS Web deployment** with `CORE_API_URL` pointing at Core's HTTP API, and a Web
   origin for CORS and authentication. Web's Docker image suits a host that terminates TLS;
   Serverless does not deploy it. Either host Langfuse or decide explicitly to leave its
   optional credentials empty.
4. **An SNS topic** with a confirmed operator subscription for the queue alarms, passed as
   `alarmTopicArn`. Creating an alarm does not confirm that it is delivered.
5. **Secrets** matching every required `${ssm:...}` path in the application definitions:
   - Core: database URL, Web origin, JWE active key ID and key map, and
     `papert/<stage>/core/edge-proxy-secret` in Secrets Manager;
   - Seymour: database URL and OpenAI key;
   - Ingestion: the OpenAI secret.

   Missing database or provider credentials fail deployment resolution. The fallback-model
   and Langfuse settings may be empty. Use the same embedding model for ingestion and
   retrieval. Never pass real secrets as CLI arguments.

## Deployment order

Use an authenticated Serverless session and a scoped AWS deployment role. Serialize releases
per stage.

1. Deploy the shared stack from `infra/shared`:

   ```sh
   npx --yes serverless@4.46.0 deploy --stage dev \
     --param='webOrigin=https://YOUR_WEB_HOST' \
     --param='alarmTopicArn=YOUR_SNS_ARN'
   ```

2. From a trusted release runner with database connectivity, run `make migrate-core` and
   `make migrate-seymour` with the migration URLs in the environment. Stop if either fails.
3. Deploy from `apps/core`, `apps/seymour` and `apps/ingestion` with the same pinned CLI and
   stage, adding:

   ```sh
   --param='subnetIds=subnet-a,subnet-b' \
   --param='securityGroupIds=sg-example' \
   --param='alarmTopicArn=YOUR_SNS_ARN'
   ```

Serverless builds Linux/amd64 Lambda images that contain the production dependencies, the
Prisma output and the tokenizer assets. CI builds the same images and imports their handlers
as their runtime users.

## Edge trust

Web and Core share one raw secret: Web's server-only `EDGE_PROXY_SECRET` and
`papert/<stage>/core/edge-proxy-secret` in Secrets Manager. Keep it out of build arguments and
browser configuration, and rotate it on both tiers together.

- Core requires the secret at startup whenever `TRUST_PROXY_HOPS` is nonzero, and compares it
  in constant time before trusting forwarded addresses: one hop in containers, two through
  API Gateway on Lambda.
- Calls that reach the public Gateway without valid proof use
  `requestContext.http.sourceIp`. `Origin` is not tier authentication.
- At the production Web ingress, terminate TLS, overwrite the client-supplied
  `X-Forwarded-For`, set `TRUSTED_PROXY_COUNT` for the actual proxy chain, prevent direct
  access to Next and use HTTPS to Core.
- Without a trusted ingress (`TRUSTED_PROXY_COUNT=0`), Web omits the address and logs once at
  proxy module startup. Core then limits such requests by its immediate peer.

Web's `/api/auth/*` proxy forwards to Core's `/auth/*`, so the Gateway route `/auth/{proxy+}`
has its own limit of 2 requests per second with a burst of five. Bursts of authentication
failures or rate limits, and every detected refresh-token reuse, raise CloudWatch alarms from
structured `securityEvent` logs.

## Migrations and acceptance

- Apply additive, backward-compatible migrations before promoting code.
- Take a backup before a destructive schema change.
- Roll back application images only while the schema remains compatible. Recover a failed data
  migration with a reviewed forward fix or a database restore, not by editing applied
  migrations.

Before public use: upload and delete a source, confirm queue-driven ingestion, run one tutor
execution, test readiness during a database outage and verify alarm delivery. **None of these
cloud acceptance checks has been performed.**
