import type { Request, Response } from 'express';
import { AuthError } from '../domain/auth.js';
import type { SecurityEvents } from '../domain/ports/security-events.js';

export const COOKIE_NAME = 'papert_session';
export const REFRESH_COOKIE_NAME = 'papert_refresh';
export const AUTH_ORIGIN = Symbol('AUTH_ORIGIN');

export function prepareRequest(
  req: Request,
  res: Response,
  origin: string,
  events: SecurityEvents,
  mutation = false,
) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (
    mutation &&
    (req.get('origin') !== origin || !req.is('application/json'))
  ) {
    events.record({
      type: 'origin_rejected',
      peer: req.ip ?? 'unknown',
      method: req.method,
      path: req.path,
      origin: req.get('origin') ?? null,
    });

    throw new AuthError(
      'forbidden',
      'Request origin or content type is not allowed.',
    );
  }
}

export function cookieValue(req: Request, name: string) {
  return (
    req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}

export function sessionToken(req: Request) {
  return cookieValue(req, COOKIE_NAME);
}

export function refreshToken(req: Request) {
  return cookieValue(req, REFRESH_COOKIE_NAME);
}
