import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Principal } from '../../auth/domain/auth.js';
import {
  CurrentPrincipal,
  SessionGuard,
} from '../../auth/infrastructure/session.guard.js';
import { DomainExceptionFilter } from '../../common/infrastructure/http/domain-exception.filter.js';
import { ResourceIdPipe } from '../../common/infrastructure/http/resource-id.pipe.js';
import { FeedbackService } from '../application/feedback.service.js';

@Controller('feedback')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class FeedbackController {
  constructor(
    @Inject(FeedbackService) private readonly feedback: FeedbackService,
  ) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Query('executions') executions: unknown,
  ) {
    return this.feedback.list(principal.user.id, executions);
  }

  @Put('executions/:id')
  rate(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.feedback.rate(principal.user.id, id, body);
  }

  @Delete('executions/:id')
  @HttpCode(204)
  async clear(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    await this.feedback.clear(principal.user.id, id);
  }
}
