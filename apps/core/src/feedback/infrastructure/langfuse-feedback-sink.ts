import { createHash } from 'node:crypto';
import type { FeedbackSignal } from '../domain/feedback.js';
import type { FeedbackSink } from '../domain/ports/feedback-sink.js';

const TIMEOUT_MS = 3000;

/** Seymour seeds each execution's trace with its id; this is the Langfuse SDK's derivation. */
export function traceIdOf(executionId: string) {
  return createHash('sha256')
    .update(executionId, 'utf8')
    .digest()
    .subarray(0, 16)
    .toString('hex');
}

/** One score per verdict. Stable ids make Langfuse update the score instead of adding one. */
export function scoresOf(signal: FeedbackSignal) {
  const traceId = traceIdOf(signal.executionId);
  const metadata = { revision: signal.revision, source: 'learner' };

  return [
    {
      id: `${signal.executionId}-learner-rating`,
      traceId,
      name: 'learner_rating',
      dataType: 'BOOLEAN',
      value: signal.rating === 'up' ? 1 : 0,
      metadata,
    },
    {
      id: `${signal.executionId}-hallucination-report`,
      traceId,
      name: 'hallucination_report',
      dataType: 'BOOLEAN',
      value: signal.hallucination ? 1 : 0,
      metadata,
    },
  ];
}

export type LangfuseSettings = {
  baseUrl: string;
  publicKey: string;
  secretKey: string;
};

export class LangfuseFeedbackSink implements FeedbackSink {
  constructor(
    private readonly settings: LangfuseSettings | null,
    private readonly request: typeof fetch = fetch,
  ) {}

  async send(signal: FeedbackSignal) {
    if (this.settings === null) {
      throw new Error('Langfuse is not configured');
    }

    const credentials = `${this.settings.publicKey}:${this.settings.secretKey}`;
    const authorization = `Basic ${Buffer.from(credentials).toString('base64')}`;
    const url = new URL('api/public/scores', withSlash(this.settings.baseUrl));

    for (const score of scoresOf(signal)) {
      const response = await this.request(url, {
        method: 'POST',
        headers: {
          authorization,
          'content-type': 'application/json',
        },
        body: JSON.stringify(score),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(
          `Langfuse rejected the score with status ${response.status}`,
        );
      }
    }
  }
}

export function langfuseSettings(
  env: NodeJS.ProcessEnv,
): LangfuseSettings | null {
  const baseUrl = env.LANGFUSE_BASE_URL;
  const publicKey = env.LANGFUSE_PUBLIC_KEY;
  const secretKey = env.LANGFUSE_SECRET_KEY;

  if (!baseUrl || !publicKey || !secretKey) {
    return null;
  }

  return { baseUrl, publicKey, secretKey };
}

function withSlash(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}
