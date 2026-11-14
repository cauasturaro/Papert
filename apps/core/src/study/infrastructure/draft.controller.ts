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
import { RoadmapDraftService } from '../application/roadmap-draft.service.js';

// A draft is addressed by its preparation workspace ID; sources use the same ID.
@Controller('study/drafts')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class DraftController {
  constructor(
    @Inject(RoadmapDraftService) private readonly drafts: RoadmapDraftService,
  ) {}

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    return this.drafts.create(principal.user.id, body);
  }

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.drafts.list(principal.user.id);
  }

  @Get(':id')
  find(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    return this.drafts.find(principal.user.id, id);
  }

  @Post(':id/recommendation/decline')
  @HttpCode(200)
  declineRecommendation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.declineRecommendation(principal.user.id, id, body);
  }

  @Delete(':id')
  discard(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.drafts.discard(principal.user.id, id, body);
  }
}
