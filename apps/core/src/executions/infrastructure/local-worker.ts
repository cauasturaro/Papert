import { fileURLToPath } from 'node:url';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import {
  loopbackEndpoint,
  runWorker,
  startControlBridge,
} from '../../common/infrastructure/local-runner.js';
import { maintenance as feedbackMaintenance } from '../../feedback/infrastructure/lambda-handlers.js';
import { maintenance, results, workerControl } from './lambda-handlers.js';

// Local-only bridge: the production worker uses IAM Lambda invocation instead.
const endpoint = loopbackEndpoint('execution');
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

const control = await startControlBridge(workerControl, 4096);
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

  // Local stand-in for the scheduled feedbackMaintenance function.
  void feedbackMaintenance().catch(() =>
    console.warn('Local feedback delivery failed.'),
  );
}, 60000);
sweep.unref();
console.info('Local execution runner ready.');

await Promise.all([
  consume(chatUrl, async (body) =>
    runWorker(
      python,
      'src.executions.local',
      `${root}apps/seymour`,
      {
        PATH: process.env.PATH,
        AWS_REGION: process.env.AWS_REGION,
        AWS_ENDPOINT_URL: process.env.AWS_ENDPOINT_URL,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
        RESULTS_QUEUE_URL: resultsUrl,
        LOCAL_CONTROL_URL: control.url,
        LOCAL_CONTROL_SECRET: control.secret,
        MODEL_PROVIDER: process.env.MODEL_PROVIDER,
        ENVIRONMENT: process.env.ENVIRONMENT,
        AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        // The fallback provider is optional: unset keys keep Seymour on OpenAI only.
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
        // The tutor searches the learner's sources in Seymour's schema.
        SEYMOUR_DATABASE_URL: process.env.SEYMOUR_DATABASE_URL,
        EMBEDDING_MODEL: process.env.EMBEDDING_MODEL,
        // Tutor checkpoints (L2) in the sessions table.
        SESSIONS_TABLE: process.env.SESSIONS_TABLE,
        LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
      },
      body,
      60_000,
    ),
  ),
  consume(resultsUrl, async (body, id) => {
    const result = await results({ Records: [{ body, messageId: id }] });

    return result.batchItemFailures.length === 0;
  }),
]);
