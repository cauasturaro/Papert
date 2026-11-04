import { createHash } from 'node:crypto';
import { SignInRateLimiter } from './sign-in-rate-limiter.js';

const attemptKey = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Sign-in rate limiter', () => {
  it('uses separate hashed peer and account buckets with their own limits', async () => {
    const consumeAttempt = vi.fn().mockResolvedValue(true);
    const limiter = new SignInRateLimiter({ consumeAttempt });

    await limiter.check('alice@example.com', 'peer');

    expect(consumeAttempt.mock.calls).toEqual([
      [attemptKey('peer:peer'), 300, 900],
      [attemptKey('email:alice@example.com'), 10, 900],
    ]);
  });

  it('stops before consuming the account bucket when the peer is blocked', async () => {
    const consumeAttempt = vi.fn().mockResolvedValue(false);
    const limiter = new SignInRateLimiter({ consumeAttempt });

    await expect(
      limiter.check('alice@example.com', 'peer'),
    ).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 900,
    });
    expect(consumeAttempt).toHaveBeenCalledTimes(1);
  });

  it('propagates storage failures instead of allowing an unchecked attempt', async () => {
    const failure = new Error('Storage unavailable');
    const consumeAttempt = vi.fn().mockRejectedValue(failure);
    const limiter = new SignInRateLimiter({ consumeAttempt });

    await expect(limiter.check('alice@example.com', 'peer')).rejects.toBe(
      failure,
    );
  });
});
