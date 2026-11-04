import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Principal } from '../../auth/domain/auth.js';
import {
  CurrentPrincipal,
  SessionGuard,
} from '../../auth/infrastructure/session.guard.js';
import { DomainExceptionFilter } from '../../common/http/domain-exception.filter.js';
import { ResourceIdPipe } from '../../common/http/resource-id.pipe.js';
import { issueStreamTicket } from './stream-handshake.js';
import { ExecutionService } from '../application/execution.service.js';
import { ExecutionStreamService } from '../application/execution-stream.service.js';

@Controller('executions')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class ExecutionController {
  constructor(
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionStreamService)
    private readonly stream: ExecutionStreamService,
  ) {}

  @Get('quota')
  quota(@CurrentPrincipal() principal: Principal) {
    return this.executions.quota(principal.user.id);
  }

  @Get('workspaces/:id')
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    return this.executions.list(principal.user.id, id);
  }

  @Post('workspaces/:id')
  create(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.executions.submit(principal.user.id, id, body);
  }

  @Get(':id')
  async read(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    const job = await this.executions.owned(principal.user.id, id);

    return this.executions.snapshot(job);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    const result = await this.executions.cancel(principal.user.id, id);

    try {
      await this.stream.broadcast(id);
    } catch {
      // Cancellation is committed even when the optional streaming channel is down.
    }

    return result;
  }

  @Post(':id/ticket')
  ticket(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    return issueStreamTicket(this.stream, principal, id);
  }
}
