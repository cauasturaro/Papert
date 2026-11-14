import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';

// Shared by the local execution and ingestion runners, which stand in for Lambda
// triggers and IAM-invoked control functions during development only.

/** Refuses anything but a loopback AWS endpoint outside production. */
export function loopbackEndpoint(runner: string) {
  const endpoint = new URL(
    process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566',
  );

  if (
    !['localhost', '127.0.0.1'].includes(endpoint.hostname) ||
    process.env.NODE_ENV === 'production'
  ) {
    throw new Error(
      `The local ${runner} runner requires a loopback AWS endpoint and a non-production environment.`,
    );
  }

  process.env.AWS_ENDPOINT_URL = endpoint.href;
  process.env.AWS_ACCESS_KEY_ID ??= 'test';
  process.env.AWS_SECRET_ACCESS_KEY ??= 'test';
  process.env.AWS_REGION ??= 'us-east-1';

  return endpoint;
}

/**
 * Serves POST /control on loopback, authenticated by a per-process bearer
 * secret that is passed only to the spawned worker.
 */
export async function startControlBridge(
  handle: (request: unknown) => Promise<unknown>,
  maxBytes: number,
) {
  const secret = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${secret}`);

  const server = createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const allowed =
      req.method === 'POST' &&
      req.url === '/control' &&
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected);

    if (!allowed) {
      res.writeHead(403).end();

      return;
    }

    try {
      const chunks: Buffer[] = [];
      let length = 0;

      for await (const chunk of req) {
        length += chunk.length;

        if (length > maxBytes) {
          throw new Error('Control request too large.');
        }

        chunks.push(Buffer.from(chunk));
      }

      const request = JSON.parse(Buffer.concat(chunks).toString());
      const response = await handle(request);

      res
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(response));
    } catch {
      res.writeHead(400).end('{}');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as { port: number };

  return { url: `http://127.0.0.1:${port}/control`, secret };
}

/** Runs one worker invocation with `input` on stdin; resolves true on exit code 0. */
export function runWorker(
  python: string,
  module: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  input: string,
  timeoutMs = 120_000,
) {
  return new Promise<boolean>((resolve) => {
    const worker = spawn(python, ['-m', module], {
      cwd,
      env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    let timedOut = false;
    let escalation: NodeJS.Timeout | undefined;
    const watchdog = setTimeout(() => {
      timedOut = true;
      worker.kill('SIGTERM');
      escalation = setTimeout(() => worker.kill('SIGKILL'), 1000);
    }, timeoutMs);

    const finish = (succeeded: boolean) => {
      clearTimeout(watchdog);
      clearTimeout(escalation);
      resolve(succeeded && !timedOut);
    };
    worker.on('error', () => finish(false));
    worker.on('exit', (code) => finish(code === 0));
    worker.stdin.on('error', () => {});
    worker.stdin.end(input);
  });
}
