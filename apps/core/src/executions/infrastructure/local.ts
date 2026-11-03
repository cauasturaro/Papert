import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { maintenance, results, workerControl } from './handlers.js';

// Local-only bridge: the production worker uses IAM Lambda invocation instead.
const endpoint = new URL(
  process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
);
if (
  !['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
  process.env.NODE_ENV === 'production'
) {
  throw new Error(
    'The local execution runner requires a loopback AWS endpoint and a non-production environment.',
  );
}

process.env.AWS_ENDPOINT_URL = endpoint.href;
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
process.env.AWS_REGION ??= 'us-east-1';
const chatUrl = process.env.CHAT_QUEUE_URL;
const resultsUrl = process.env.RESULTS_QUEUE_URL;
if (!chatUrl || !resultsUrl) {
  throw new Error('CHAT_QUEUE_URL and RESULTS_QUEUE_URL are required.');
}
for (const url of [chatUrl, resultsUrl]) {
  if (new URL(url).origin !== endpoint.origin) {
    throw new Error(
      'Local queue URLs must use the configured loopback endpoint.',
    );
  }
}

const secret = randomBytes(32).toString('hex');
const server = createServer(async (req, res) => {
  const supplied = Buffer.from(req.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    req.method !== 'POST' ||
    req.url !== '/control' ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    res.writeHead(403).end();

    return;
  }

  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 4096) {
        throw new Error('Control request too large.');
      }

      chunks.push(Buffer.from(chunk));
    }

    const requestBody = Buffer.concat(chunks).toString();
    const request = JSON.parse(requestBody);
    const response = await workerControl(request);
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(response));
  } catch {
    res.writeHead(400).end('{}');
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address() as { port: number };
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const python =
  process.env.SEYMOUR_PYTHON ?? `${root}apps/seymour/.venv/bin/python`;
const sqs = new SQSClient({
  endpoint: endpoint.href,
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

async function consume(
  queueUrl: string,
  action: (body: string, id: string) => Promise<boolean>,
) {
  while (true) {
    try {
      const page = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 1,
        }),
      );

      for (const message of page.Messages ?? []) {
        const succeeded = await action(message.Body!, message.MessageId!);
        if (succeeded) {
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        }
      }
    } catch {
      console.warn('Local execution transport unavailable; retrying.');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

await maintenance();
const sweep = setInterval(() => {
  void maintenance().catch(() =>
    console.warn('Local execution maintenance failed.'),
  );
}, 60000);
sweep.unref();
console.info('Local execution runner ready.');

await Promise.all([
  consume(
    chatUrl,
    async (body) =>
      new Promise<boolean>((resolve) => {
        const worker = spawn(python, ['-m', 'src.executions.local'], {
          cwd: `${root}apps/seymour`,
          env: {
            PATH: process.env.PATH,
            AWS_REGION: process.env.AWS_REGION,
            AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
            AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
            AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
            RESULTS_QUEUE_URL: resultsUrl,
            LOCAL_CONTROL_URL: `http://127.0.0.1:${address.port}/control`,
            LOCAL_CONTROL_SECRET: secret,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            OPENAI_MODEL: process.env.OPENAI_MODEL,
            LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
            LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
            LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
          },
          stdio: ['pipe', 'inherit', 'inherit'],
        });
        worker.on('error', () => resolve(false));
        worker.on('exit', (code) => resolve(code === 0));
        worker.stdin.on('error', () => {});
        worker.stdin.end(body);
      }),
  ),
  consume(resultsUrl, async (body, id) => {
    const result = await results({ Records: [{ body, messageId: id }] });

    return result.batchItemFailures.length === 0;
  }),
]);
