import type { ArgumentsHost } from '@nestjs/common';
import { DomainError } from '../../domain/domain-error.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';

function fakeHost() {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);

  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { host, response };
}

describe('Domain exception filter', () => {
  it('maps each error kind to its HTTP status with a message-only body', () => {
    const filter = new DomainExceptionFilter();
    const { host, response } = fakeHost();

    filter.catch(new DomainError('conflict', 'Workspace changed.'), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      message: 'Workspace changed.',
    });
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('announces Retry-After only when the error provides a delay', () => {
    const filter = new DomainExceptionFilter();
    const { host, response } = fakeHost();
    const error = new DomainError('rate_limited', 'Too many attempts.', 900);

    filter.catch(error, host);

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    expect(response.status).toHaveBeenCalledWith(429);
  });

  it('adds the reset moment of a rate limit to the body', () => {
    const filter = new DomainExceptionFilter();
    const { host, response } = fakeHost();
    const resetsAt = new Date('2026-11-10T00:00:00.000Z');
    const error = new DomainError('rate_limited', 'Quota used.', 60, resetsAt);

    filter.catch(error, host);

    expect(response.json).toHaveBeenCalledWith({
      message: 'Quota used.',
      resetsAt: '2026-11-10T00:00:00.000Z',
    });
  });
});
