import type { INestApplication } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Application, Request, Response, NextFunction } from 'express';

const MAX_PROXY_HOPS = 5;

// Core serves JSON only, so nothing it returns may be framed, rendered or embedded.
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

export type HttpOptions = {
  // Reverse proxies in front of Core that append to X-Forwarded-For.
  defaultProxyHops?: number;
};

export function proxyHops(value: string | undefined, fallback: number) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_PROXY_HOPS) {
    throw new Error(
      `TRUST_PROXY_HOPS must be an integer from 0 to ${MAX_PROXY_HOPS}.`,
    );
  }

  return hops;
}

export function configureHttp(
  app: INestApplication,
  { defaultProxyHops = 0 }: HttpOptions = {},
) {
  const express = app.getHttpAdapter().getInstance() as Application;
  const hops = proxyHops(process.env.TRUST_PROXY_HOPS, defaultProxyHops);
  const secret = process.env.EDGE_PROXY_SECRET;
  if (hops > 0 && !secret) {
    throw new Error('EDGE_PROXY_SECRET is required when TRUST_PROXY_HOPS > 0.');
  }

  const proofHash = secret
    ? createHash('sha256').update(secret).digest()
    : undefined;

  // Forwarded addresses are usable only after authenticating the Web tier below.
  express.set('trust proxy', hops);
  express.disable('x-powered-by');

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.set(SECURITY_HEADERS);

    const proof = req.headers['x-papert-edge'];
    const authenticated =
      proofHash !== undefined &&
      typeof proof === 'string' &&
      timingSafeEqual(proofHash, createHash('sha256').update(proof).digest());
    delete req.headers['x-papert-edge'];
    if (!authenticated) {
      delete req.headers['x-forwarded-for'];
    }

    // The adapter socket retains API Gateway's authoritative sourceIp. Recompute only
    // after removing unauthenticated XFF, including when the adapter assigned req.ip.
    if (Object.hasOwn(req, 'ip')) {
      delete (req as { ip?: string }).ip;
    }

    if (/^\/internal(?:\/|$)/i.test(req.path)) {
      res.status(403).json({ message: 'Internal HTTP access is not enabled.' });
      return;
    }

    next();
  });
}
