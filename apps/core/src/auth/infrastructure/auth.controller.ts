import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { DomainExceptionFilter } from '../../common/infrastructure/http/domain-exception.filter.js';
import { AuthService, TOKEN_SECONDS } from '../application/auth.service.js';
import type { Principal } from '../domain/auth.js';
import type { SecurityEvents } from '../domain/ports/security-events.js';
import {
  AUTH_ORIGIN,
  COOKIE_NAME,
  prepareRequest,
  REFRESH_COOKIE_NAME,
  refreshToken,
  sessionToken,
} from './auth-http.js';
import { SECURITY_EVENTS } from './security-log.js';
import { CurrentPrincipal, SessionGuard } from './session.guard.js';

export { AUTH_ORIGIN, COOKIE_NAME, REFRESH_COOKIE_NAME } from './auth-http.js';
export { SECURITY_EVENTS } from './security-log.js';

// The refresh cookie reaches only the auth routes that renew or end a session.
const ACCESS_COOKIE_PATH = '/api';
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
@UseFilters(DomainExceptionFilter)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_ORIGIN) private readonly origin: string,
    @Inject(SECURITY_EVENTS) private readonly events: SecurityEvents,
  ) {}

  private cookieOptions(path: string): CookieOptions {
    return {
      httpOnly: true,
      secure: this.origin.startsWith('https://'),
      sameSite: 'strict',
      path,
    };
  }

  private sendGrant(
    res: Response,
    grant: Awaited<ReturnType<AuthService['login']>>,
  ) {
    const now = Date.now();

    res.cookie(COOKIE_NAME, grant.token, {
      ...this.cookieOptions(ACCESS_COOKIE_PATH),
      maxAge: Math.min(TOKEN_SECONDS * 1000, grant.expiresAt.getTime() - now),
    });
    res.cookie(REFRESH_COOKIE_NAME, grant.refreshToken, {
      ...this.cookieOptions(REFRESH_COOKIE_PATH),
      maxAge: grant.sessionExpiresAt.getTime() - now,
    });

    // Tokens leave this adapter only in HttpOnly cookies, never the response body.
    const {
      token: _token,
      refreshToken: _refreshToken,
      sessionExpiresAt: _sessionExpiresAt,
      ...body
    } = grant;

    return body;
  }

  @Post('register')
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    prepareRequest(req, res, this.origin, this.events, true);

    const grant = await this.auth.register(body, req.ip ?? 'unknown');

    return this.sendGrant(res, grant);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    prepareRequest(req, res, this.origin, this.events, true);

    const grant = await this.auth.login(body, req.ip ?? 'unknown');

    return this.sendGrant(res, grant);
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentPrincipal() principal: Principal) {
    const { user, session } = principal;

    return {
      user: { id: user.id, email: user.email },
      sessionId: session.id,
      expiresAt: session.expiresAt,
    };
  }

  @Get('sessions/:id')
  @UseGuards(SessionGuard)
  session(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.auth.ownedSession(principal, id);
  }

  // Renews with the refresh cookie, so it does not require a live access token.
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    prepareRequest(req, res, this.origin, this.events, true);

    const grant = await this.auth.refresh(
      refreshToken(req),
      sessionToken(req),
      req.ip ?? 'unknown',
    );

    return this.sendGrant(res, grant);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    prepareRequest(req, res, this.origin, this.events, true);

    await this.auth.logout(sessionToken(req), refreshToken(req));

    res.clearCookie(COOKIE_NAME, this.cookieOptions(ACCESS_COOKIE_PATH));
    res.clearCookie(
      REFRESH_COOKIE_NAME,
      this.cookieOptions(REFRESH_COOKIE_PATH),
    );
  }
}
