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
import type { Request, Response } from 'express';
import { DomainExceptionFilter } from '../../common/http/domain-exception.filter.js';
import { AuthService, TOKEN_SECONDS } from '../application/auth.service.js';
import type { Principal } from '../domain/auth.js';
import { AUTH_ORIGIN, COOKIE_NAME, prepareRequest } from './auth-http.js';
import { CurrentPrincipal, SessionGuard } from './session.guard.js';

export { AUTH_ORIGIN, COOKIE_NAME } from './auth-http.js';

@Controller('auth')
@UseFilters(DomainExceptionFilter)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_ORIGIN) private readonly origin: string,
  ) {}

  private sendGrant(
    res: Response,
    grant: Awaited<ReturnType<AuthService['login']>>,
  ) {
    res.cookie(COOKIE_NAME, grant.token, {
      httpOnly: true,
      secure: this.origin.startsWith('https://'),
      sameSite: 'strict',
      path: '/api',
      maxAge: Math.min(
        TOKEN_SECONDS * 1000,
        grant.expiresAt.getTime() - Date.now(),
      ),
    });

    // Tokens leave this adapter only in the HttpOnly cookie, never the response body.
    const { token: _token, ...body } = grant;
    return body;
  }

  @Post('register')
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ) {
    prepareRequest(req, res, this.origin, true);

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
    prepareRequest(req, res, this.origin, true);

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

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async refresh(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) res: Response,
  ) {
    const grant = await this.auth.refresh(principal);

    return this.sendGrant(res, grant);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(principal);

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: this.origin.startsWith('https://'),
      sameSite: 'strict',
      path: '/api',
    });
  }
}
