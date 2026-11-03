import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import {
  SQSClient,
  CreateQueueCommand,
  ReceiveMessageCommand,
  DeleteQueueCommand,
} from '@aws-sdk/client-sqs';
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { PrismaService } from '../src/infrastructure/database/prisma.service.js';
import { PrismaStudyRepository } from '../src/study/infrastructure/prisma-study.repository.js';
import { PrismaExecutionRepository } from '../src/executions/infrastructure/prisma-execution.repository.js';
import { ParserSyntaxChecker } from '../src/analysis/infrastructure/parser-syntax-checker.js';
import { ExecutionService } from '../src/executions/application/execution.service.js';
import {
  ExecutionStream,
  SqsExecutionQueue,
} from '../src/executions/infrastructure/aws-execution.js';
import type { Principal } from '../src/auth/domain/auth.js';

const endpoint = process.env.EXECUTION_TEST_AWS_ENDPOINT;

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL || !endpoint)(
  'SQS + DynamoDB + signed stream delivery',
  () => {
    let db: PrismaService;
    let service: ExecutionService;
    let stream: ExecutionStream;
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
      service = new ExecutionService(
        new PrismaExecutionRepository(db),
        new SqsExecutionQueue(),
        new ParserSyntaxChecker(),
      );
      stream = new ExecutionStream(db, service);
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

    it('publishes only the execution identity and persists authorized session mappings, with replay-safe tickets and signed snapshots', async () => {
      const job = await service.create(principal.user.id, workspaceId, {
        requestKey: randomUUID(),
        kind: 'chat',
        revision: 0,
        prompt: 'Help',
      });
      const messages = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
        }),
      );
      expect(JSON.parse(messages.Messages![0].Body!)).toEqual({
        version: 1,
        executionId: job.id,
      });

      const ticket = await stream.ticket(principal, job.id);
      const secret = new URL(ticket.url!).searchParams.get('ticket')!;
      await expect(
        stream.connect('bad', secret, 'https://attacker.example'),
      ).rejects.toThrow('handshake');

      await stream.connect('first', secret, 'http://localhost:3000');
      await expect(
        stream.connect('replayed', secret, 'http://localhost:3000'),
      ).rejects.toThrow('already used');
      await stream.resume('first');
      expect(frames.at(-1)!.authorization).toContain('AWS4-HMAC-SHA256');
      expect(frames.at(-1)!.path).toBe('/@connections/first');
      expect(frames.at(-1)!.body.id).toBe(job.id);
      expect(frames.at(-1)!.body).not.toHaveProperty('input');

      const mapping = await dynamo.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': { S: `EXEC#${job.id}` } },
        }),
      );
      expect(mapping.Items![0].userId.S).toBe(principal.user.id);
      expect(mapping.Items![0].sessionId.S).toBeDefined();

      const claim = await service.claim(job.id);
      await service.accept({
        version: 1,
        executionId: job.id,
        lease: claim.lease,
        index: 1,
        status: 'running',
        text: 'First batch',
        tokens: 0,
      });
      await stream.broadcast(job.id);
      expect(frames.at(-1)!.body.text).toBe('First batch');
      expect(frames.at(-1)!.body.status).toBe('running');

      await stream.disconnect('first');
      const renewed = await stream.ticket(principal, job.id);
      await stream.connect(
        'second',
        new URL(renewed.url!).searchParams.get('ticket')!,
        'http://localhost:3000',
      );
      await stream.resume('second');
      expect(frames.at(-1)!.body.text).toBe('First batch');

      deliveryStatus = 500;
      await stream.broadcast(job.id);
      expect((await service.owned(principal.user.id, job.id)).status).toBe(
        'running',
      );

      deliveryStatus = 410;
      await stream.broadcast(job.id);
      const stale = await dynamo.send(
        new QueryCommand({
          TableName: table,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': { S: `EXEC#${job.id}` } },
        }),
      );
      expect(stale.Items).toHaveLength(0);

      await service.accept({
        version: 1,
        executionId: job.id,
        lease: claim.lease,
        index: 3,
        status: 'completed',
        text: 'First batch and final',
        tokens: 0,
      });
      expect((await service.owned(principal.user.id, job.id)).status).toBe(
        'completed',
      );
    });

    it('rejects an expired ticket and suppresses streaming after logout', async () => {
      deliveryStatus = 200;
      const job = await service.create(principal.user.id, workspaceId, {
        requestKey: randomUUID(),
        kind: 'chat',
        revision: 0,
        prompt: 'Review',
      });
      const expired = await stream.ticket(principal, job.id);
      await db.streamTicket.updateMany({
        where: { executionId: job.id },
        data: { expiresAt: new Date(0) },
      });
      await expect(
        stream.connect(
          'expired',
          new URL(expired.url!).searchParams.get('ticket')!,
          'http://localhost:3000',
        ),
      ).rejects.toThrow('expired');

      const ticket = await stream.ticket(principal, job.id);
      await stream.connect(
        'logout',
        new URL(ticket.url!).searchParams.get('ticket')!,
        'http://localhost:3000',
      );
      const before = frames.length;
      await db.authSession.update({
        where: { id: principal.session.id },
        data: { revokedAt: new Date() },
      });
      await stream.broadcast(job.id);

      expect(frames).toHaveLength(before);
      await expect(stream.resume('logout')).rejects.toThrow('Unknown');
    });
  },
);
