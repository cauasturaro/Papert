import { createParamDecorator, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../application/auth.service.js';
import type { Principal } from '../domain/auth.js';
import { AUTH_ORIGIN, prepareRequest, sessionToken } from './auth-http.js';

type AuthenticatedRequest = Request & { principal?: Principal };

const READ_ONLY_METHODS = ['GET', 'HEAD'];

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_ORIGIN) private readonly origin: string,
  ) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    // Mutations also require the exact web origin and a JSON body.
    const mutation = !READ_ONLY_METHODS.includes(req.method);
    prepareRequest(req, res, this.origin, mutation);

    req.principal = await this.auth.authenticate(sessionToken(req));

    return true;
  }
}

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!req.principal) {
      throw new Error('CurrentPrincipal requires SessionGuard on the route.');
    }

    return req.principal;
  },
);
