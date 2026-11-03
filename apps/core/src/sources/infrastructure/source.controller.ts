import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { SourceService } from '../application/source.service.js';

// Nested under /study so the existing Web proxy covers these routes.
@Controller('study/workspaces/:workspaceId/sources')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class SourceController {
  constructor(@Inject(SourceService) private readonly sources: SourceService) {}

  @Get()
  list(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', ResourceIdPipe) workspaceId: string,
  ) {
    return this.sources.list(principal.user.id, workspaceId);
  }

  @Post()
  register(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', ResourceIdPipe) workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.sources.register(principal.user.id, workspaceId, body);
  }

  @Delete(':sourceId')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', ResourceIdPipe) workspaceId: string,
    @Param('sourceId', ResourceIdPipe) sourceId: string,
  ) {
    await this.sources.remove(principal.user.id, workspaceId, sourceId);
  }
}
