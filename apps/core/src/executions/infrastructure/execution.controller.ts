import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { z } from 'zod';
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
import { StudyExceptionFilter } from '../../study/infrastructure/study.controller.js';
import { StudyError } from '../../study/domain/study.js';
import { ExecutionService } from '../application/execution.service.js';
import { ExecutionStream } from './aws-execution.js';

@Controller('executions')
@UseFilters(AuthExceptionFilter, StudyExceptionFilter)
export class ExecutionController {
  constructor(
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionStream) private readonly stream: ExecutionStream,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AUTH_ORIGIN) private readonly origin: string,
  ) {}

  private async principal(req: Request, res: Response, id?: string) {
    prepareRequest(req, res, this.origin, req.method === 'POST');

    const principal = await this.auth.authenticate(sessionToken(req));
    if (id && !z.string().uuid().safeParse(id).success) {
      throw new StudyError(404, 'Resource not found.');
    }

    return principal;
  }

  @Get('quota')
  async quota(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const principal = await this.principal(req, res);

    return this.executions.quota(principal.user.id);
  }

  @Get('workspaces/:id')
  async list(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const principal = await this.principal(req, res, id);

    return this.executions.list(principal.user.id, id);
  }

  @Post('workspaces/:id')
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const principal = await this.principal(req, res, id);

    return this.executions.create(principal.user.id, id, body);
  }

  @Get(':id')
  async read(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const principal = await this.principal(req, res, id);
    const job = await this.executions.owned(principal.user.id, id);

    return this.executions.snapshot(job);
  }

  @Post(':id/cancel')
  async cancel(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const principal = await this.principal(req, res, id);
    const result = await this.executions.cancel(principal.user.id, id);

    try {
      await this.stream.broadcast(id);
    } catch {
      // Cancellation is committed even when the optional streaming channel is down.
    }

    return result;
  }

  @Post(':id/ticket')
  async ticket(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Param('id') id: string,
  ) {
    const principal = await this.principal(req, res, id);

    return this.stream.ticket(principal, id);
  }
}
