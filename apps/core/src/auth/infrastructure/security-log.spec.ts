import { emailHashKey, StructuredSecurityLog } from './security-log.js';

const keys = JSON.stringify({ test: 'ab'.repeat(32), other: 'cd'.repeat(32) });

function capture(key = emailHashKey('test', keys)) {
  const lines: string[] = [];
  const loadKey = vi.fn(() => key);
  const log = new StructuredSecurityLog(
    loadKey,
    (line) => lines.push(line),
    () => new Date('2026-11-10T12:00:00Z'),
  );

  return { log, lines, loadKey };
}

describe('Structured security log', () => {
  it('writes one JSON line per event with a keyed email hash', () => {
    const { log, lines } = capture();

    log.record({
      type: 'sign_in_failed',
      email: 'alice@example.com',
      peer: '203.0.113.7',
      knownAccount: true,
    });

    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({
      securityEvent: 'auth.sign_in_failed',
      at: '2026-11-10T12:00:00.000Z',
      emailHash: expect.stringMatching(/^[0-9a-f]{32}$/),
      peer: '203.0.113.7',
      knownAccount: true,
    });
    expect(lines[0]).not.toContain('alice');
  });

  it('correlates the same email and separates different keys', () => {
    const first = capture();
    const second = capture(emailHashKey('other', keys));
    const event = {
      type: 'rate_limited' as const,
      scope: 'account' as const,
      peer: 'p',
      email: 'alice@example.com',
    };

    first.log.record(event);
    first.log.record(event);
    second.log.record(event);

    const [a, b] = first.lines.map((line) => JSON.parse(line).emailHash);
    const c = JSON.parse(second.lines[0]).emailHash;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('truncates attacker-controlled strings and loads the key only when hashing', () => {
    const { log, lines, loadKey } = capture();

    log.record({
      type: 'origin_rejected',
      peer: 'p',
      method: 'POST',
      path: '/auth/login',
      origin: `https://${'a'.repeat(500)}\n{"forged":true}`,
    });

    const entry = JSON.parse(lines[0]);
    expect(lines).toHaveLength(1);
    expect(entry.origin).toHaveLength(200);
    expect(entry).not.toHaveProperty('forged');
    expect(loadKey).not.toHaveBeenCalled();
  });

  it('fails clearly when the active key is missing', () => {
    expect(() => emailHashKey('missing', keys)).toThrow('AUTH_JWE_ACTIVE_KID');
  });
});
