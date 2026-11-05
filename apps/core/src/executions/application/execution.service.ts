import { lintWorkspace } from '../../analysis/domain/syntax.js';
import type { SyntaxChecker } from '../../analysis/domain/ports/syntax-checker.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import { ExecutionError } from '../domain/execution.js';
import {
  executionRequest,
  parse,
} from './contracts/execution-request.contract.js';
import type { ExecutionRequest, ExecutionRecord } from '../domain/execution.js';
import type { ExecutionQueue } from '../domain/ports/execution-queue.js';
import type { ExecutionLifecycle } from '../domain/ports/execution-lifecycle.js';
import type { ExecutionRepository } from '../domain/ports/execution-repository.js';
import type { TutorSourceCatalog } from '../domain/ports/tutor-source-catalog.js';
import {
  generationRequest,
  isGenerationBody,
} from './contracts/generation.contract.js';
import {
  isRecommendationBody,
  recommendationRequest,
} from './contracts/recommendation.contract.js';
import type { RecommendationCatalog } from '../domain/ports/recommendation-catalog.js';
import { executionView } from './execution-presentation.js';

/** Learner-facing executions: admission, reads, cancellation and the publication outbox. */
export class ExecutionService {
  constructor(
    private readonly repo: ExecutionRepository,
    private readonly lifecycle: ExecutionLifecycle,
    private readonly queue: ExecutionQueue,
    private readonly syntax: SyntaxChecker,
    private readonly sources: TutorSourceCatalog,
    private readonly catalog: RecommendationCatalog,
  ) {}

  quota(userId: string) {
    return this.repo.quota(userId);
  }

  // HTTP entry point: analysis may end in a syntax rejection instead of an execution.
  async submit(userId: string, workspaceId: string, body: unknown) {
    if (isGenerationBody(body)) {
      return this.generate(userId, workspaceId, body);
    }

    if (isRecommendationBody(body)) {
      return this.recommend(userId, workspaceId, body);
    }

    const input = parse(executionRequest, body);
    if (input.kind === 'analysis') {
      return this.analyze(userId, workspaceId, input);
    }

    return this.start(userId, workspaceId, input);
  }

  async create(userId: string, workspaceId: string, body: unknown) {
    const input = parse(executionRequest, body);
    if (input.kind === 'analysis') {
      throw new ExecutionError(
        'invalid',
        'Submit analysis through its own request.',
      );
    }

    return this.start(userId, workspaceId, input);
  }

  async analyze(userId: string, workspaceId: string, input: ExecutionRequest) {
    const files = await this.repo.analysisFiles(
      userId,
      workspaceId,
      input.revision,
    );

    // A stale revision has no files to lint; creation then resolves the request key or rejects it.
    let syntax: SyntaxReport | undefined;
    if (files) {
      syntax = await lintWorkspace(files, this.syntax);
    }

    // Syntax errors stop here: no execution, quota reservation or model call.
    if (syntax?.status === 'failed') {
      const attempt = await this.repo.rejectSyntax(
        userId,
        workspaceId,
        input.revision,
        syntax,
      );

      return { status: 'syntax_error' as const, attempt, syntax };
    }

    return this.start(userId, workspaceId, input, syntax);
  }

  /** Drafts a roadmap from the preparation workspace's goal, level and ready sources. */
  async generate(userId: string, workspaceId: string, body: unknown) {
    const input = parse(generationRequest, body);

    // Only ready sources are snapshotted.
    const sources = await this.sources.ready(userId, workspaceId);

    const execution = await this.repo.createGeneration(
      userId,
      workspaceId,
      input,
      sources,
    );

    try {
      await this.publish(execution);
    } catch {
      // The execution row is the durable outbox; the scheduled sweep retries publication.
    }

    return this.snapshot(execution);
  }

  /** Asks Seymour which published roadmaps fit the draft's goal before any generation. */
  async recommend(userId: string, workspaceId: string, body: unknown) {
    const input = parse(recommendationRequest, body);

    const candidates = await this.catalog.candidates(userId);

    const execution = await this.repo.createRecommendation(
      userId,
      workspaceId,
      input,
      candidates,
    );

    try {
      await this.publish(execution);
    } catch {
      // The execution row is the durable outbox; the scheduled sweep retries publication.
    }

    return this.snapshot(execution);
  }

  private async start(
    userId: string,
    workspaceId: string,
    input: ExecutionRequest,
    syntax?: SyntaxReport,
  ) {
    // Only tutor requests may search the learner's sources.
    const sources = input.mode
      ? await this.sources.ready(userId, workspaceId)
      : [];

    const execution = await this.repo.create(userId, workspaceId, input, {
      syntax,
      sources,
    });

    try {
      await this.publish(execution);
    } catch {
      // The execution row is the durable outbox; the scheduled sweep retries publication.
    }

    return this.snapshot(execution);
  }

  snapshot(job: ExecutionRecord) {
    return executionView(job);
  }

  owned(userId: string, id: string) {
    return this.repo.owned(userId, id);
  }

  async list(userId: string, workspaceId: string) {
    const jobs = await this.repo.list(userId, workspaceId);

    return jobs.map((job) => this.snapshot(job));
  }

  async cancel(userId: string, id: string) {
    const job = await this.lifecycle.cancel(userId, id);

    return this.snapshot(job);
  }

  private async publish(job: ExecutionRecord) {
    if (job.status !== 'queued' || job.publishedAt) {
      return;
    }

    await this.queue.publish(job.id);

    await this.repo.markPublished(job.id);
  }

  async sweep() {
    const expired = await this.lifecycle.expire();
    const pending = await this.repo.pending();
    let published = 0;

    for (const job of pending) {
      try {
        await this.publish(job);
        published++;
      } catch {
        console.warn(
          JSON.stringify({
            metric: 'execution_publish_failure',
            executionId: job.id,
          }),
        );
      }
    }

    return { expired, published };
  }
}
