import { fileURLToPath } from 'node:url';
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import type { Message } from '@aws-sdk/client-sqs';
import {
  loopbackEndpoint,
  runWorker,
  startControlBridge,
} from '../../common/infrastructure/local-runner.js';
import { maintenance, sourceControl } from './handlers.js';

// Local-only stand-in for the ingestion Lambda's SQS trigger and IAM control call.
const endpoint = loopbackEndpoint('ingestion');
const queueUrl = process.env.INGESTION_QUEUE_URL;

if (!queueUrl || new URL(queueUrl).origin !== endpoint.origin) {
  throw new Error(
    'INGESTION_QUEUE_URL is required and must use the loopback endpoint.',
  );
}

// Failed messages become visible again quickly so local redrive is observable.
const RETRY_VISIBILITY_SECONDS = 5;

const control = await startControlBridge(sourceControl, 8192);

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const python =
  process.env.INGESTION_PYTHON ?? `${root}apps/ingestion/.venv/bin/python`;
const sqs = new SQSClient({
  endpoint: endpoint.href,
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

function ingest(message: Message) {
  const record = {
    messageId: message.MessageId,
    body: message.Body,
    attributes: {
      ApproximateReceiveCount:
        message.Attributes?.ApproximateReceiveCount ?? '1',
    },
  };

  const env = {
    PATH: process.env.PATH,
    AWS_REGION: process.env.AWS_REGION,
    AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    SOURCES_BUCKET: process.env.SOURCES_BUCKET,
    SEYMOUR_DATABASE_URL: process.env.SEYMOUR_DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LOCAL_CONTROL_URL: control.url,
    LOCAL_CONTROL_SECRET: control.secret,
  };

  return runWorker(
    python,
    'src.local',
    `${root}apps/ingestion`,
    env,
    JSON.stringify({ Records: [record] }),
  );
}

async function settle(message: Message, succeeded: boolean) {
  if (succeeded) {
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );

    return;
  }

  await sqs.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: message.ReceiptHandle,
      VisibilityTimeout: RETRY_VISIBILITY_SECONDS,
    }),
  );
}

async function consume() {
  while (true) {
    try {
      const page = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 1,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }),
      );

      for (const message of page.Messages ?? []) {
        const succeeded = await ingest(message);

        await settle(message, succeeded);
      }
    } catch {
      console.warn('Local ingestion transport unavailable; retrying.');

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

await maintenance();

const sweep = setInterval(() => {
  void maintenance().catch(() =>
    console.warn('Local source maintenance failed.'),
  );
}, 60000);

sweep.unref();
console.info('Local ingestion runner ready.');

await consume();
