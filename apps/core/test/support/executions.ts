import { ExecutionService } from '../../src/executions/application/execution.service.js';
import { ExecutionWorkerService } from '../../src/executions/application/execution-worker.service.js';
import type { ExecutionQueue } from '../../src/executions/domain/ports/execution-queue.js';
import type { RecommendationCatalog } from '../../src/executions/domain/ports/recommendation-catalog.js';
import type { TutorSourceCatalog } from '../../src/executions/domain/ports/tutor-source-catalog.js';
import type { SyntaxChecker } from '../../src/analysis/domain/ports/syntax-checker.js';
import { PrismaExecutionRepository } from '../../src/executions/infrastructure/prisma-execution-repository.js';
import { PrismaExecutionLifecycle } from '../../src/executions/infrastructure/prisma-execution-lifecycle.js';
import type { PrismaService } from '../../src/infrastructure/database/prisma.service.js';
import { PrismaMemoryRepository } from '../../src/memory/infrastructure/prisma-memory-repository.js';
import { PrismaTutorMemory } from '../../src/memory/infrastructure/prisma-tutor-memory.js';
import { PrismaAttemptProgression } from '../../src/study/infrastructure/prisma-attempt-progression.js';
import { PrismaRoadmapGeneration } from '../../src/study/infrastructure/prisma-roadmap-generation.js';
import { PrismaRoadmapRecommendation } from '../../src/study/infrastructure/prisma-roadmap-recommendation.js';
import { PrismaWorkspaceAccess } from '../../src/study/infrastructure/prisma-workspace-access.js';

export function createExecutions(
  db: PrismaService,
  queue: ExecutionQueue,
  syntax: SyntaxChecker,
  sources: TutorSourceCatalog,
  catalog: RecommendationCatalog,
  now = () => new Date(),
) {
  const study = new PrismaAttemptProgression();
  const drafts = new PrismaRoadmapGeneration();
  const recommendations = new PrismaRoadmapRecommendation();
  const memory = new PrismaTutorMemory(db);
  const items = new PrismaMemoryRepository(db);
  const notes = {
    active: (userId: string, ids: string[]) => items.activeIds(userId, ids),
  };
  const repository = new PrismaExecutionRepository(
    db,
    now,
    new PrismaWorkspaceAccess(db),
    study,
    drafts,
    recommendations,
    memory,
  );
  const lifecycle = new PrismaExecutionLifecycle(
    db,
    now,
    study,
    drafts,
    recommendations,
    memory,
  );

  return {
    service: new ExecutionService(
      repository,
      lifecycle,
      queue,
      syntax,
      sources,
      catalog,
    ),
    worker: new ExecutionWorkerService(lifecycle, sources, catalog, notes),
  };
}
