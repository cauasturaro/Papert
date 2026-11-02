import {
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, TOKEN_SECONDS } from '../application/auth.service.js';
import { AuthError } from '../domain/auth.js';

export const AUTH_ORIGIN = Symbol('AUTH_ORIGIN');
export const COOKIE_NAME = 'papert_session';

@Catch(AuthError)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(error: AuthError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (error.status === 429) {
      response.setHeader('Retry-After', '900');
    }

    response.status(error.status).json({ message: error.message });
  }
}

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_ORIGIN) private readonly origin: string,
  ) {}

  private prepare(req: Request, res: Response, mutation = false) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (
      mutation &&
      (req.get('origin') !== this.origin || !req.is('application/json'))
    ) {
      throw new AuthError(
        403,
        'Request origin or content type is not allowed.',
      );
    }
  }

  private principal(req: Request) {
    const token = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1);

    return this.auth.authenticate(token ?? '');
  }

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
    this.prepare(req, res, true);

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
    this.prepare(req, res, true);

    const grant = await this.auth.login(body, req.ip ?? 'unknown');

    return this.sendGrant(res, grant);
  }

  @Get('me')
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.prepare(req, res);

    const { user, session } = await this.principal(req);

    return {
      user: { id: user.id, email: user.email },
      sessionId: session.id,
      expiresAt: session.expiresAt,
    };
  }

  @Get('sessions/:id')
  async session(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    this.prepare(req, res);

    const principal = await this.principal(req);

    return this.auth.ownedSession(principal, id);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.prepare(req, res, true);

    const principal = await this.principal(req);
    const grant = await this.auth.refresh(principal);

    return this.sendGrant(res, grant);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.prepare(req, res, true);

    const principal = await this.principal(req);
    await this.auth.logout(principal);

    res.clearCookie(COOKIE_NAME, {
      httpOnly: true,
      secure: this.origin.startsWith('https://'),
      sameSite: 'strict',
      path: '/api',
    });
  }
}
