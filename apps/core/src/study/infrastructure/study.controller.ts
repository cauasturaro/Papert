import {
  All,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
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
import { StudyService } from '../application/study.service.js';

@Controller('study')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class StudyController {
  constructor(@Inject(StudyService) private readonly study: StudyService) {}

  @Get('roadmaps/fixture')
  fixture() {
    return this.study.fixture();
  }

  @Post('roadmaps/:id/start')
  @HttpCode(200)
  start(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.study.start(principal.user.id, id, body);
  }

  @Get('workspaces/:id')
  workspace(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.study.workspace(principal.user.id, id);
  }

  @Get('workspaces/:id/steps/:stepId')
  step(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ) {
    return this.study.step(principal.user.id, id, stepId);
  }

  @Put('workspaces/:id')
  save(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.study.save(principal.user.id, id, body);
  }

  @Post('workspaces/:id/attempts')
  recordAttempt(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.study.recordAttempt(principal.user.id, id, body);
  }

  @All('roadmaps/:id')
  immutable() {
    throw new HttpException(
      { message: 'Consolidated roadmaps are immutable.' },
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}
