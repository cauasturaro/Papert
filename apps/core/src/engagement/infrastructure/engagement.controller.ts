import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Principal } from '../../auth/domain/auth.js';
import {
  CurrentPrincipal,
  SessionGuard,
} from '../../auth/infrastructure/session.guard.js';
import { DomainExceptionFilter } from '../../common/http/domain-exception.filter.js';
import { EngagementService } from '../application/engagement.service.js';

@Controller('engagement')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class EngagementController {
  constructor(
    @Inject(EngagementService) private readonly engagement: EngagementService,
  ) {}

  @Get()
  view(@CurrentPrincipal() principal: Principal) {
    return this.engagement.view(principal.user.id);
  }

  @Put('time-zone')
  setTimeZone(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    return this.engagement.setTimeZone(principal.user.id, body);
  }
}
