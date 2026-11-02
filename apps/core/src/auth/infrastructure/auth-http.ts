import type { Request, Response } from 'express';
import { AuthError } from '../domain/auth.js';

export const COOKIE_NAME = 'papert_session';

export function prepareRequest(
  req: Request,
  res: Response,
  origin: string,
  mutation = false,
) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (
    mutation &&
    (req.get('origin') !== origin || !req.is('application/json'))
  ) {
    throw new AuthError(403, 'Request origin or content type is not allowed.');
  }
}

export function sessionToken(req: Request) {
  return (
    req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1) ?? ''
  );
}
