import { executionRecord } from './execution-snapshot.js';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import type { ExecutionStudyProgression } from '../domain/ports/execution-study-progression.js';
import type { ExecutionWorkspaces } from '../domain/ports/execution-workspaces.js';
import { ExecutionError } from '../domain/execution.js';
import {
  DAILY_LIMIT,
  period,
  resetsAt,
  TUTOR_ATTEMPT_BUDGET,
} from '../domain/admission/quota.js';
import type { ExecutionRequest } from '../domain/execution.js';
import type { ExecutionRepository } from '../domain/ports/execution-repository.js';
import type { TutorSource } from '../domain/tutor/tutor-context.js';
import { activeStudyStep } from '../domain/admission/admission.js';
import { admitExecution } from './prisma-execution-admission.js';
import {
  admitGeneration,
  admitRecommendation,
} from './prisma-draft-admission.js';
import type { ExecutionRecommendationDrafts } from '../domain/ports/execution-recommendation-drafts.js';
import type { ExecutionRoadmapDrafts } from '../domain/ports/execution-roadmap-drafts.js';
import type { GenerationRequest } from '../domain/roadmaps/roadmap-drafts.js';
import type {
  RecommendationCandidate,
  RecommendationRequest,
} from '../domain/roadmaps/recommendation.js';
import type { AttemptState } from '../domain/analysis/analysis.js';
import type { ExecutionMemory } from '../domain/ports/execution-memory.js';

const CONVERSATION_TRANSCRIPT = 100;

export class PrismaExecutionRepository implements ExecutionRepository {
  constructor(
    private readonly db: PrismaService,
    private readonly now = () => new Date(),
    private readonly workspaces: ExecutionWorkspaces,
    private readonly study: ExecutionStudyProgression,
    private readonly drafts: ExecutionRoadmapDrafts,
    private readonly recommendations: ExecutionRecommendationDrafts,
    private readonly memory: ExecutionMemory,
  ) {}

  async quota(userId: string) {
    const now = this.now();
    const today = period(now);
    const quota = await this.db.executionQuota.findUnique({
      where: { userId_period: { userId, period: today } },
    });

    return {
      period: today,
      timezone: 'UTC',
      limit: DAILY_LIMIT,
      used: quota?.used ?? 0,
      reserved: quota?.reserved ?? 0,
      reservation: TUTOR_ATTEMPT_BUDGET,
      resetsAt: resetsAt(now),
    };
  }

  create(
    userId: string,
    workspaceId: string,
    input: ExecutionRequest,
    context: { syntax?: SyntaxReport; sources: TutorSource[] },
  ) {
    return admitExecution(
      this.db,
      this.workspaces,
      this.study,
      this.memory,
      this.now,
      userId,
      workspaceId,
      input,
      context,
    );
  }

  createGeneration(
    userId: string,
    workspaceId: string,
    input: GenerationRequest,
    sources: TutorSource[],
  ) {
    return admitGeneration(
      this.db,
      this.workspaces,
      this.drafts,
      this.now,
      userId,
      workspaceId,
      input,
      sources,
    );
  }

  createRecommendation(
    userId: string,
    workspaceId: string,
    input: RecommendationRequest,
    candidates: RecommendationCandidate[],
  ) {
    return admitRecommendation(
      this.db,
      this.workspaces,
      this.recommendations,
      this.now,
      userId,
      workspaceId,
      input,
      candidates,
    );
  }

  async analysisFiles(userId: string, workspaceId: string, revision: number) {
    const workspace = await this.workspaces.saved(userId, workspaceId);
    if (!workspace) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }

    if (workspace.revision !== revision) {
      return null;
    }

    return workspace.files;
  }

  async rejectSyntax(
    userId: string,
    workspaceId: string,
    revision: number,
    syntax: SyntaxReport,
  ) {
    return this.db.$transaction(async (tx) => {
      const workspace = await this.workspaces.lock(tx, userId, workspaceId);
      if (!workspace) {
        throw new ExecutionError('not_found', 'Workspace not found.');
      }
      if (workspace.revision !== revision) {
        throw new ExecutionError(
          'conflict',
          'Save and reload the workspace before starting an execution.',
        );
      }

      const roadmap = activeStudyStep(workspace.roadmap ?? undefined);
      const definition = this.study.definition(roadmap.definition);
      const step = activeStudyStep(definition.steps[workspace.currentStep]);

      const attempt = await this.study.snapshot(
        tx,
        workspaceId,
        revision,
        step,
        workspace.files,
      );
      const state = attempt.result as AttemptState;
      if (state.status !== 'not_evaluated') {
        return attempt;
      }

      return this.study.updateResult(tx, attempt.id, {
        status: 'syntax_error',
        syntax,
      });
    });
  }

  async owned(userId: string, id: string) {
    const job = await this.db.execution.findFirst({ where: { id, userId } });
    if (!job) {
      throw new ExecutionError('not_found', 'Execution not found.');
    }

    return executionRecord(job);
  }

  async list(
    userId: string,
    workspaceId: string,
    conversationId?: string,
    before?: string,
  ) {
    if (!(await this.workspaces.owns(userId, workspaceId))) {
      throw new ExecutionError('not_found', 'Workspace not found.');
    }

    const scope = {
      userId,
      workspaceId,
      ...(conversationId ? { conversationId } : {}),
    };

    // The cursor must belong to the same transcript; ties on time fall back to the id.
    let older = {};

    if (before) {
      const cursor = await this.db.execution.findFirst({
        where: { ...scope, id: before },
        select: { id: true, createdAt: true },
      });
      if (!cursor) {
        throw new ExecutionError(
          'not_found',
          'Those earlier messages are no longer available.',
        );
      }

      older = {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      };
    }

    // A conversation lists its transcript a page at a time; the workspace view keeps the latest jobs.
    const jobs = await this.db.execution.findMany({
      where: { ...scope, ...older },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: conversationId ? CONVERSATION_TRANSCRIPT : 20,
    });

    return jobs.map(executionRecord);
  }

  async markPublished(id: string) {
    await this.db.execution.updateMany({
      where: { id, publishedAt: null },
      data: { publishedAt: this.now() },
    });
  }

  async pending() {
    const jobs = await this.db.execution.findMany({
      where: {
        status: 'queued',
        publishedAt: null,
        deadline: { gt: this.now() },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return jobs.map(executionRecord);
  }
}
