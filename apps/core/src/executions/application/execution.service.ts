import { parse } from '../../study/domain/study.js';
import { executionRequest, workerEvent } from '../domain/execution.js';
import type {
  ExecutionQueue,
  ExecutionRepository,
  ExecutionRecord,
} from '../domain/execution.js';

export class ExecutionService {
  constructor(
    private readonly repo: ExecutionRepository,
    private readonly queue: ExecutionQueue,
  ) {}

  quota(userId: string) {
    return this.repo.quota(userId);
  }

  async create(userId: string, workspaceId: string, body: unknown) {
    const input = parse(executionRequest, body);
    const execution = await this.repo.create(userId, workspaceId, input);

    try {
      await this.publish(execution);
    } catch {
      // The execution row is the durable outbox; the scheduled sweep retries publication.
    }

    return this.snapshot(execution);
  }

  snapshot(job: ExecutionRecord) {
    return {
      id: job.id,
      workspaceId: job.workspaceId,
      status: job.status,
      text: job.text,
      sequence: job.sequence,
      attempts: job.attempts,
      charged: job.charged,
      reserved: job.reserved,
      createdAt: job.createdAt,
      firstEventAt: job.firstEventAt,
      finishedAt: job.finishedAt,
      deadline: job.deadline,
    };
  }

  owned(userId: string, id: string) {
    return this.repo.owned(userId, id);
  }

  async list(userId: string, workspaceId: string) {
    const jobs = await this.repo.list(userId, workspaceId);

    return jobs.map((job) => this.snapshot(job));
  }

  async cancel(userId: string, id: string) {
    const job = await this.repo.cancel(userId, id);

    return this.snapshot(job);
  }

  claim(id: string) {
    return this.repo.claim(id);
  }

  failed(id: string, lease: string) {
    return this.repo.failed(id, lease);
  }

  active(id: string, lease: string) {
    return this.repo.active(id, lease);
  }

  async accept(body: unknown) {
    const event = parse(workerEvent, body);
    const job = await this.repo.accept(event);

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
    const expired = await this.repo.expire();
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
