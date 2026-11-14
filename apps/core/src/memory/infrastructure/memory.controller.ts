import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
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
import { MemoryService } from '../application/memory.service.js';

@Controller('memory')
@UseGuards(SessionGuard)
@UseFilters(DomainExceptionFilter)
export class MemoryController {
  constructor(@Inject(MemoryService) private readonly memory: MemoryService) {}

  @Get()
  list(@CurrentPrincipal() principal: Principal) {
    return this.memory.list(principal.user.id);
  }

  @Post()
  create(@CurrentPrincipal() principal: Principal, @Body() body: unknown) {
    return this.memory.create(principal.user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.memory.update(principal.user.id, id, body);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.memory.accept(principal.user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.memory.remove(principal.user.id, id, body);
  }

  @Get('workspaces/:id/conversations/page')
  conversationPage(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Query() query: unknown,
  ) {
    return this.memory.conversationPage(principal.user.id, id, query);
  }

  @Get('workspaces/:id/conversations')
  conversations(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
  ) {
    return this.memory.conversationsOf(principal.user.id, id);
  }

  @Post('workspaces/:id/conversations')
  startConversation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.memory.startConversation(principal.user.id, id, body);
  }

  @Patch('workspaces/:id/conversations/:conversationId')
  renameConversation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Param('conversationId', ResourceIdPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    return this.memory.renameConversation(
      principal.user.id,
      id,
      conversationId,
      body,
    );
  }

  @Delete('workspaces/:id/conversations/:conversationId')
  @HttpCode(204)
  removeConversation(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ResourceIdPipe) id: string,
    @Param('conversationId', ResourceIdPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    return this.memory.removeConversation(
      principal.user.id,
      id,
      conversationId,
      body,
    );
  }
}
