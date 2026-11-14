import { Controller, Get, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { configure as serverlessExpress } from '@vendia/serverless-express';
import type { Context } from 'aws-lambda';
import { configureHttp, proxyHops } from './http.js';
import type { HttpOptions } from './http.js';

@Controller()
class AddressController {
  @Get('address')
  address(@Req() req: Request) {
    return { ip: req.ip };
  }
}

async function start(
  options?: HttpOptions,
  before?: (req: Request, res: Response, next: NextFunction) => void,
) {
  const module = await Test.createTestingModule({
    controllers: [AddressController],
  }).compile();

  const app = module.createNestApplication();
  if (before) {
    app.use(before);
  }

  configureHttp(app, { defaultProxyHops: 1, ...options });
  await app.init();

  return app;
}

async function addressOf(
  app: INestApplication,
  forwardedFor?: string,
  proof: string | null = 'test-edge-secret',
) {
  const call = request(app.getHttpServer()).get('/address');
  if (forwardedFor !== undefined) {
    call.set('X-Forwarded-For', forwardedFor);
  }

  if (proof !== null) {
    call.set('X-Papert-Edge', proof);
  }

  const response = await call.expect(200);

  return response.body.ip as string;
}

describe('HTTP configuration', () => {
  let app: INestApplication | undefined;
  const environment = process.env.TRUST_PROXY_HOPS;
  const edgeSecret = process.env.EDGE_PROXY_SECRET;

  beforeEach(() => {
    process.env.EDGE_PROXY_SECRET = 'test-edge-secret';
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;

    if (edgeSecret === undefined) {
      delete process.env.EDGE_PROXY_SECRET;
    } else {
      process.env.EDGE_PROXY_SECRET = edgeSecret;
    }

    if (environment === undefined) {
      delete process.env.TRUST_PROXY_HOPS;
    } else {
      process.env.TRUST_PROXY_HOPS = environment;
    }
  });

  it('trusts exactly one authenticated proxy hop', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    app = await start();

    const forwarded = await addressOf(app, '203.0.113.7');
    const spoofed = await addressOf(app, '198.51.100.1, 203.0.113.7');

    expect(forwarded).toBe('203.0.113.7');
    expect(spoofed).toBe('203.0.113.7');
  });

  it('ignores forwarded addresses when no proxy is trusted', async () => {
    process.env.TRUST_PROXY_HOPS = '0';
    app = await start();

    const address = await addressOf(app, '203.0.113.7');

    expect(address).not.toBe('203.0.113.7');
    expect(address).toMatch(/127\.0\.0\.1|::1/);
  });

  it('lets the environment override the entry point default', async () => {
    process.env.TRUST_PROXY_HOPS = '2';
    app = await start({ defaultProxyHops: 1 });

    const address = await addressOf(app, '198.51.100.1, 203.0.113.7');

    expect(address).toBe('198.51.100.1');
  });

  it('recomputes the address when an adapter assigned req.ip directly', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    const assignIp = (req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', {
        value: '10.0.0.9',
        configurable: true,
        enumerable: true,
        writable: true,
      });
      next();
    };
    app = await start(undefined, assignIp);

    const address = await addressOf(app, '203.0.113.7');

    expect(address).toBe('203.0.113.7');
  });

  it('uses the socket peer for missing or invalid proof, regardless of XFF', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    app = await start();

    for (const proof of [null, 'wrong', 'test-edge-secreu']) {
      const address = await addressOf(app, '198.51.100.1, 203.0.113.7', proof);

      expect(address).toMatch(/127\.0\.0\.1|::1/);
    }
  });

  it('requires the edge secret at startup only when trusting proxies', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    delete process.env.EDGE_PROXY_SECRET;

    await expect(start()).rejects.toThrow('EDGE_PROXY_SECRET');
    app = await start({ defaultProxyHops: 0 });
  });

  it('keeps API Gateway sourceIp authoritative unless Web supplies valid proof', async () => {
    delete process.env.TRUST_PROXY_HOPS;
    app = await start({ defaultProxyHops: 2 });
    const proxy = serverlessExpress({
      app: app.getHttpAdapter().getInstance(),
    });
    const sourceIp = '203.0.113.9';

    for (const proof of [undefined, 'wrong', 'test-edge-secret']) {
      const event = {
        version: '2.0',
        routeKey: '$default',
        rawPath: '/address',
        rawQueryString: '',
        headers: {
          'x-forwarded-for': `198.51.100.77, ${sourceIp}`,
          ...(proof ? { 'x-papert-edge': proof } : {}),
        },
        requestContext: {
          http: {
            method: 'GET',
            path: '/address',
            sourceIp,
            protocol: 'HTTP/1.1',
          },
        },
        isBase64Encoded: false,
      };

      const result = await proxy(event, {} as Context, () => {});

      expect(JSON.parse(result.body).ip).toBe(
        proof === 'test-edge-secret' ? '198.51.100.77' : sourceIp,
      );
    }
  });

  it('rejects invalid hop counts at startup', () => {
    for (const value of ['-1', '1.5', 'true', '6']) {
      expect(() => proxyHops(value, 1)).toThrow('TRUST_PROXY_HOPS');
    }

    expect(proxyHops(undefined, 2)).toBe(2);
    expect(proxyHops('', 2)).toBe(2);
    expect(proxyHops('0', 2)).toBe(0);
  });

  it('keeps internal HTTP routes closed', async () => {
    app = await start();

    await request(app.getHttpServer()).get('/internal/resolve').expect(403);
  });

  it('sends API security headers on every response, including errors', async () => {
    app = await start();

    const found = await request(app.getHttpServer()).get('/address');
    const missing = await request(app.getHttpServer()).get('/missing');

    for (const response of [found, missing]) {
      expect(response.headers).toMatchObject({
        'content-security-policy': expect.stringContaining(
          "frame-ancestors 'none'",
        ),
        'cross-origin-resource-policy': 'same-origin',
        'referrer-policy': 'no-referrer',
        'strict-transport-security': expect.stringContaining('max-age='),
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
      });
      expect(response.headers).not.toHaveProperty('x-powered-by');
    }
    expect(missing.status).toBe(404);
  });
});
