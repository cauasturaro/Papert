import {
  All,
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../../auth/application/auth.service.js';
import {
  AUTH_ORIGIN,
  AuthExceptionFilter,
} from '../../auth/infrastructure/auth.controller.js';
import {
  prepareRequest,
  sessionToken,
} from '../../auth/infrastructure/auth-http.js';
import { StudyService } from '../application/study.service.js';
import { StudyError } from '../domain/study.js';

@Catch(StudyError)
export class StudyExceptionFilter implements ExceptionFilter {
  catch(error: StudyError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    response.status(error.status).json({ message: error.message });
  }
}

@Controller('study')
@UseFilters(AuthExceptionFilter, StudyExceptionFilter)
export class StudyController {
  constructor(
    @Inject(StudyService) private readonly study: StudyService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_ORIGIN) private readonly origin: string,
  ) {}

  private async user(req: Request, res: Response) {
    prepareRequest(
      req,
      res,
      this.origin,
      !['GET', 'HEAD'].includes(req.method),
    );

    const principal = await this.auth.authenticate(sessionToken(req));

    return principal.user.id;
  }

  @Get('roadmaps/fixture')
  async fixture(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.user(req, res);

    return this.study.fixture();
  }

  @Post('roadmaps/:id/start')
  @HttpCode(200)
  async start(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const userId = await this.user(req, res);

    return this.study.start(userId, id, body);
  }

  @Get('workspaces/:id')
  async workspace(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const userId = await this.user(req, res);

    return this.study.workspace(userId, id);
  }

  @Get('workspaces/:id/steps/:stepId')
  async step(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ) {
    const userId = await this.user(req, res);

    return this.study.step(userId, id, stepId);
  }

  @Put('workspaces/:id')
  async save(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const userId = await this.user(req, res);

    return this.study.save(userId, id, body);
  }

  @Post('workspaces/:id/attempts')
  async recordAttempt(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const userId = await this.user(req, res);

    return this.study.recordAttempt(userId, id, body);
  }

  @All('roadmaps/:id')
  async immutable(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.user(req, res);

    throw new StudyError(405, 'Consolidated roadmaps are immutable.');
  }
}
