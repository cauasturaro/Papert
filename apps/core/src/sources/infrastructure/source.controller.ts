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
import { DomainExceptionFilter } from '../../common/infrastructure/http/domain-exception.filter.js';
import { ResourceIdPipe } from '../../common/infrastructure/http/resource-id.pipe.js';
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
  async register(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', ResourceIdPipe) workspaceId: string,
    @Body() body: unknown,
  ) {
    const grant = await this.sources.register(
      principal.user.id,
      workspaceId,
      body,
    );

    return {
      source: grant.source,
      upload: {
        method: 'PUT' as const,
        url: grant.upload.url,
        headers: { 'Content-Type': grant.upload.contentType },
        expiresAt: grant.upload.expiresAt,
      },
    };
  }

  @Get(':sourceId/view')
  view(
    @CurrentPrincipal() principal: Principal,
    @Param('workspaceId', ResourceIdPipe) workspaceId: string,
    @Param('sourceId', ResourceIdPipe) sourceId: string,
  ) {
    return this.sources.view(principal.user.id, workspaceId, sourceId);
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
