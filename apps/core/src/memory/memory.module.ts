import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaService } from '../infrastructure/database/prisma.service.js';
import { PrismaWorkspaceAccess } from '../study/infrastructure/prisma-workspace-access.js';
import { StudyModule } from '../study/study.module.js';
import { MemoryService } from './application/memory.service.js';
import type { MemoryWorkspaces } from './domain/ports/memory-workspaces.js';
import { MemoryController } from './infrastructure/memory.controller.js';
import { PrismaConversationRepository } from './infrastructure/prisma-conversation-repository.js';
import { PrismaMemoryRepository } from './infrastructure/prisma-memory-repository.js';
import { PrismaTutorMemory } from './infrastructure/prisma-tutor-memory.js';

@Module({
  imports: [AuthModule, StudyModule],
  controllers: [MemoryController],
  providers: [
    {
      provide: MemoryService,
      inject: [PrismaService, PrismaWorkspaceAccess],
      useFactory: (db: PrismaService, workspaces: MemoryWorkspaces) =>
        new MemoryService(
          new PrismaMemoryRepository(db),
          new PrismaConversationRepository(db),
          workspaces,
          () => new Date(),
        ),
    },
    // Driven by executions inside its own transactions.
    {
      provide: PrismaTutorMemory,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaTutorMemory(db),
    },
  ],
  exports: [MemoryService, PrismaTutorMemory],
})
export class MemoryModule {}
