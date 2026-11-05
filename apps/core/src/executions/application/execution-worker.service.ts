import { authorizedGrounding, liveSourceIds } from '../domain/grounding.js';
import type { ExecutionLifecycle } from '../domain/ports/execution-lifecycle.js';
import type { RecommendationCatalog } from '../domain/ports/recommendation-catalog.js';
import type { TutorNoteCatalog } from '../domain/ports/tutor-note-catalog.js';
import type { TutorSourceCatalog } from '../domain/ports/tutor-source-catalog.js';
import { admittedNoteIds, withLiveNotes } from '../domain/tutor-context.js';
import { parseGrounding } from './contracts/grounding.contract.js';
import { workerEvent } from './contracts/worker-event.contract.js';
import { executionView } from './execution-presentation.js';
import { parse } from './contracts/execution-request.contract.js';

/** Seymour's side of an execution: leases, live scope and results. */
export class ExecutionWorkerService {
  constructor(
    private readonly lifecycle: ExecutionLifecycle,
    private readonly sources: TutorSourceCatalog,
    private readonly catalog: RecommendationCatalog,
    private readonly notes: TutorNoteCatalog,
  ) {}

  /** A worker receives only the durable notes that still exist when it claims the job. */
  async claim(id: string) {
    const claim = await this.lifecycle.claim(id);
    if (claim.status !== 'running') {
      return claim;
    }

    const noteIds = admittedNoteIds(claim.input);
    if (noteIds.length === 0) {
      return claim;
    }

    const scope = await this.lifecycle.sourceScope(id);
    const live = scope ? await this.notes.active(scope.userId, noteIds) : [];

    return { ...claim, input: withLiveNotes(claim.input, live) };
  }

  failed(id: string, lease: string) {
    return this.lifecycle.failed(id, lease);
  }

  active(id: string, lease: string) {
    return this.lifecycle.active(id, lease);
  }

  /** Sources Seymour may still search for this leased execution; deleted ones drop out. */
  async liveSources(id: string, lease: string) {
    const active = await this.lifecycle.active(id, lease);

    if (!active) {
      return [];
    }

    return this.admittedAndReady(id);
  }

  async accept(body: unknown) {
    const event = parse(workerEvent, body);

    const grounding = await this.authorizeGrounding(
      event.executionId,
      event.grounding,
    );

    // Drop evidence from sources deleted during the run.
    let liveSourceIds: string[] = [];
    if (event.roadmap !== undefined) {
      liveSourceIds = await this.admittedAndReady(event.executionId);
    }

    let publishedIds: string[] = [];
    if (event.recommendation !== undefined) {
      publishedIds = await this.offeredAndPublished(event.executionId);
    }

    const job = await this.lifecycle.accept(event, grounding, {
      liveSourceIds,
      publishedIds,
    });

    return executionView(job);
  }

  private async authorizeGrounding(id: string, value: unknown) {
    const grounding = value === undefined ? null : parseGrounding(value);

    if (!grounding) {
      return null;
    }

    const live = await this.admittedAndReady(id);

    return authorizedGrounding(grounding, live);
  }

  // Sources the execution was admitted with that are still ready in its workspace now.
  private async admittedAndReady(id: string) {
    const scope = await this.lifecycle.sourceScope(id);

    if (!scope || scope.sourceIds.length === 0) {
      return [];
    }

    const ready = await this.sources.ready(scope.userId, scope.workspaceId);
    const readyIds = ready.map((source) => source.id);

    return liveSourceIds(scope.sourceIds, readyIds);
  }

  // Roadmaps offered to Seymour for this execution that are still published now.
  private async offeredAndPublished(id: string) {
    const scope = await this.lifecycle.sourceScope(id);

    if (!scope || scope.offeredRoadmapIds.length === 0) {
      return [];
    }

    return this.catalog.publishedIds(scope.offeredRoadmapIds);
  }
}
