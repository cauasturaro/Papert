import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import type { Principal } from '../../src/auth/domain/auth.js';
import { ExecutionStreamService } from '../../src/executions/application/execution-stream.service.js';
import type { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { SqsExecutionQueue } from '../../src/executions/infrastructure/aws-execution.js';
import { createExecutionStream } from '../../src/executions/infrastructure/stream-composition.js';
import { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PrismaStudyRepository } from '../../src/study/infrastructure/prisma-study-repository.js';
import { createExecutions } from './executions.js';

// These suites do not exercise the community catalog.
const noCatalog = { candidates: async () => [], publishedIds: async () => [] };

// These suites do not exercise workspace sources.
const noSources = { ready: async () => [] };

const endpoint = process.env.EXECUTION_TEST_AWS_ENDPOINT;

export function executionStreamHarness() {
  let db: PrismaService;
  let service: ExecutionService;
  let worker: ExecutionWorkerService;
  let stream: ExecutionStreamService;
  let principal: Principal;
  let workspaceId: string;
  let queueUrl: string;
  let table: string;
  let server: Server;
  let sqs: SQSClient;
  let dynamo: DynamoDBClient;
  let deliveryStatus = 200;
  const frames: {
    body: Record<string, unknown>;
    authorization: string;
    path: string;
  }[] = [];
  const environment = { ...process.env };

  beforeAll(async () => {
    const suffix = randomUUID();
    process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL;
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.WEBSOCKET_URL = 'ws://localhost:3003';
    table = `papert-stream-test-${suffix}`;
    process.env.SESSIONS_TABLE = table;

    sqs = new SQSClient({ endpoint, region: 'us-east-1' });
    dynamo = new DynamoDBClient({ endpoint, region: 'us-east-1' });
    const queue = await sqs.send(
      new CreateQueueCommand({
        QueueName: `papert-execution-test-${suffix}`,
      }),
    );

    queueUrl = queue.QueueUrl!;
    process.env.CHAT_QUEUE_URL = queueUrl;

    await dynamo.send(
      new CreateTableCommand({
        TableName: table,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
      }),
    );

    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk));
      }

      frames.push({
        body: JSON.parse(Buffer.concat(chunks).toString()),
        authorization: req.headers.authorization ?? '',
        path: req.url!,
      });
      res.writeHead(deliveryStatus, {
        'Content-Type': 'application/json',
        'x-amzn-errortype': deliveryStatus === 410 ? 'GoneException' : '',
      });
      res.end(deliveryStatus === 410 ? '{"message":"Gone"}' : '{}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );

    const address = server.address() as { port: number };
    process.env.WEBSOCKET_MANAGEMENT_URL = `http://127.0.0.1:${address.port}`;

    db = new PrismaService();
    await db.$connect();

    const user = await db.user.create({
      data: { email: `${suffix}@stream.example`, passwordHash: 'test-only' },
    });
    const session = await db.authSession.create({
      data: {
        userId: user.id,
        tokenId: randomUUID(),
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    principal = { user, session };

    const studies = new PrismaStudyRepository(db);
    const fixture = await studies.fixture();
    const workspace = await studies.start(user.id, fixture.id);
    workspaceId = workspace!.id;

    const built = createExecutions(
      db,
      new SqsExecutionQueue(),
      new ParserSyntaxChecker(),
      noSources,
      noCatalog,
    );

    service = built.service;
    worker = built.worker;
    stream = createExecutionStream(db, service);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (queueUrl) {
      await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
    }
    if (table) {
      await dynamo.send(new DeleteTableCommand({ TableName: table }));
    }
    if (principal) {
      await db.user.delete({ where: { id: principal.user.id } });
    }

    await db?.$disconnect();
    sqs?.destroy();
    dynamo?.destroy();
    process.env = environment;
  });

  return {
    get db() {
      return db;
    },
    get service() {
      return service;
    },
    get worker() {
      return worker;
    },
    get stream() {
      return stream;
    },
    get principal() {
      return principal;
    },
    get workspaceId() {
      return workspaceId;
    },
    get queueUrl() {
      return queueUrl;
    },
    get table() {
      return table;
    },
    get sqs() {
      return sqs;
    },
    get dynamo() {
      return dynamo;
    },
    get deliveryStatus() {
      return deliveryStatus;
    },
    set deliveryStatus(value: typeof deliveryStatus) {
      deliveryStatus = value;
    },
    frames,
  };
}
