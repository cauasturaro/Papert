import { describe, expect, it } from 'vitest';
import {
  LangfuseFeedbackSink,
  scoresOf,
  traceIdOf,
} from './langfuse-feedback-sink.js';

const EXECUTION = '7c0e1b0e-3f39-4a55-9f35-a3f1d4b9a2c1';
const SIGNAL = {
  executionId: EXECUTION,
  rating: 'down' as const,
  hallucination: true,
  revision: 2,
};

describe('Langfuse feedback sink', () => {
  it('derives the trace id exactly like the Seymour SDK seed', () => {
    // Langfuse Python: sha256(seed.encode("utf-8")).digest()[:16].hex()
    expect(traceIdOf(EXECUTION)).toMatch(/^[0-9a-f]{32}$/);
    expect(traceIdOf('session-456')).toBe('da8e78131d7a9924039c74c39a01e0a1');
  });

  it('sends stable score ids so a changed verdict updates the same scores', () => {
    const first = scoresOf({
      ...SIGNAL,
      revision: 1,
      hallucination: false,
      rating: 'up',
    });
    const second = scoresOf(SIGNAL);

    expect(first.map((score) => score.id)).toEqual(
      second.map((score) => score.id),
    );
    expect(second.map((score) => [score.name, score.value])).toEqual([
      ['learner_rating', 0],
      ['hallucination_report', 1],
    ]);
  });

  it('posts both scores with basic authentication and no answer text', async () => {
    const requests: { url: string; body: string; init: RequestInit }[] = [];
    const request = async (url: URL, init: RequestInit) => {
      requests.push({ url: url.href, body: init.body as string, init });

      return new Response('{}', { status: 200 });
    };
    const sink = new LangfuseFeedbackSink(
      { baseUrl: 'http://langfuse:3000', publicKey: 'pk', secretKey: 'sk' },
      request as typeof fetch,
    );

    await sink.send(SIGNAL);

    const bodies = requests.map((sent) => JSON.parse(sent.body));

    expect(requests.map((sent) => sent.url)).toEqual([
      'http://langfuse:3000/api/public/scores',
      'http://langfuse:3000/api/public/scores',
    ]);
    expect(new Headers(requests[0].init.headers).get('authorization')).toBe(
      `Basic ${Buffer.from('pk:sk').toString('base64')}`,
    );
    expect(Object.keys(bodies[0]).sort()).toEqual(
      ['dataType', 'id', 'metadata', 'name', 'traceId', 'value'].sort(),
    );
  });

  it('fails so the revision stays pending when Langfuse is down or unconfigured', async () => {
    const down = new LangfuseFeedbackSink(
      { baseUrl: 'http://langfuse:3000', publicKey: 'pk', secretKey: 'sk' },
      (async () => new Response('', { status: 503 })) as typeof fetch,
    );
    const unconfigured = new LangfuseFeedbackSink(null);

    await expect(down.send(SIGNAL)).rejects.toThrow('status 503');
    await expect(unconfigured.send(SIGNAL)).rejects.toThrow('not configured');
  });
});
