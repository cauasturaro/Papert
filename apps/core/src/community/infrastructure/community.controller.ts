import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
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
import { DomainExceptionFilter } from '../../common/http/domain-exception.filter.js';
import { CommunityService } from '../application/community.service.js';
import { PublicationService } from '../application/publication.service.js';

@Controller('community')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class CommunityController {
  constructor(
    @Inject(CommunityService) private readonly community: CommunityService,
    @Inject(PublicationService)
    private readonly publishing: PublicationService,
  ) {}

  @Get('roadmaps')
  catalog(
    @CurrentPrincipal() principal: Principal,
    @Query() query: Record<string, unknown>,
  ) {
    return this.community.catalog(principal.user.id, query);
  }

  // Specific roadmaps in the given order, such as recommendation matches.
  @Get('roadmaps/selection')
  selection(
    @CurrentPrincipal() principal: Principal,
    @Query('ids') ids: unknown,
  ) {
    return this.community.selection(principal.user.id, ids);
  }

  @Get('roadmaps/:id')
  details(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.community.details(principal.user.id, id);
  }

  @Post('roadmaps/:id/publish')
  @HttpCode(200)
  publish(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.publishing.publish(principal.user.id, id, body);
  }

  @Put('roadmaps/:id/vote')
  vote(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.community.vote(principal.user.id, id, body);
  }

  @Post('roadmaps/:id/start')
  @HttpCode(200)
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.community.start(principal.user.id, id, body);
  }

  @Get('publications')
  publications(@CurrentPrincipal() principal: Principal) {
    return this.publishing.myPublications(principal.user.id);
  }

  @Get('library')
  library(@CurrentPrincipal() principal: Principal) {
    return this.community.savedRoadmaps(principal.user.id);
  }

  @Put('library/:id')
  favorite(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.community.favorite(principal.user.id, id, body);
  }

  @Delete('library/:id')
  unfavorite(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.community.unfavorite(principal.user.id, id, body);
  }
}
