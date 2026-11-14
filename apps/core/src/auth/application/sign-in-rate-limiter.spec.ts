import { createHash } from 'node:crypto';
import { SignInRateLimiter } from './sign-in-rate-limiter.js';

const attemptKey = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function store(allowed = true) {
  return {
    consumeAttempt: vi.fn().mockResolvedValue(allowed),
    releaseAttempt: vi.fn().mockResolvedValue(undefined),
    clearAttempts: vi.fn().mockResolvedValue(undefined),
  };
}

const accountPeer = attemptKey(
  `account-peer:${JSON.stringify(['alice@example.com', 'peer'])}`,
);
const account = attemptKey('account:alice@example.com');

describe('Sign-in rate limiter', () => {
  const events = { record: vi.fn() };

  beforeEach(() => {
    events.record.mockClear();
  });

  it('throttles each client in its own hashed bucket', async () => {
    const attempts = store();
    const limiter = new SignInRateLimiter(attempts, events);

    await limiter.admit('peer');

    expect(attempts.consumeAttempt.mock.calls).toEqual([
      [attemptKey('peer:peer'), 300, 900],
    ]);
  });

  it('reserves a failure per account and client and per account', async () => {
    const attempts = store();
    const limiter = new SignInRateLimiter(attempts, events);

    await limiter.reserve('alice@example.com', 'peer');

    expect(attempts.consumeAttempt.mock.calls).toEqual([
      [accountPeer, 10, 900],
      [account, 100, 900],
    ]);
  });

  it('clears the client failures and returns the account reservation on success', async () => {
    const attempts = store();
    const limiter = new SignInRateLimiter(attempts, events);

    await limiter.succeeded('alice@example.com', 'peer');

    expect(attempts.clearAttempts).toHaveBeenCalledWith(accountPeer);
    expect(attempts.releaseAttempt).toHaveBeenCalledWith(account);
    expect(attempts.consumeAttempt).not.toHaveBeenCalled();
  });

  it('reserves a registration conflict per client and gives it back on success', async () => {
    const attempts = store();
    const limiter = new SignInRateLimiter(attempts, events);
    const key = attemptKey('registration-conflict:peer');

    await limiter.reserveRegistration('peer');
    await limiter.registered('peer');

    expect(attempts.consumeAttempt).toHaveBeenCalledWith(key, 10, 900);
    expect(attempts.releaseAttempt).toHaveBeenCalledWith(key);
  });

  it('keeps similar emails and clients in distinct buckets', async () => {
    const attempts = store();
    const limiter = new SignInRateLimiter(attempts, events);

    await limiter.reserve('a:b@example.com', 'c');
    await limiter.reserve('a@example.com', 'b:c');

    const [first, , second] = attempts.consumeAttempt.mock.calls;
    expect(first[0]).not.toBe(second[0]);
  });

  it('stops at the first exhausted bucket', async () => {
    const attempts = store(false);
    const limiter = new SignInRateLimiter(attempts, events);

    await expect(
      limiter.reserve('alice@example.com', 'peer'),
    ).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 900,
    });
    expect(attempts.consumeAttempt).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith({
      type: 'rate_limited',
      scope: 'account_client',
      peer: 'peer',
      email: 'alice@example.com',
    });
  });

  it('records client throttling without an email', async () => {
    const attempts = store(false);
    const limiter = new SignInRateLimiter(attempts, events);

    await expect(limiter.admit('peer')).rejects.toMatchObject({
      kind: 'rate_limited',
    });

    expect(events.record).toHaveBeenCalledWith({
      type: 'rate_limited',
      scope: 'client',
      peer: 'peer',
      email: undefined,
    });
  });

  it('propagates storage failures instead of allowing an unchecked attempt', async () => {
    const failure = new Error('Storage unavailable');
    const attempts = store();
    attempts.consumeAttempt.mockRejectedValue(failure);
    const limiter = new SignInRateLimiter(attempts, events);

    await expect(limiter.admit('peer')).rejects.toBe(failure);
  });
});
