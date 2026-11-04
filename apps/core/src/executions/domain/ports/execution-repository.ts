import type { SyntaxReport } from '../../../analysis/domain/syntax.js';
import type {
  ExecutionRequest,
  WorkerEvent,
  ExecutionRecord,
} from '../execution.js';
import type { TutorSource } from '../tutor-context.js';
import type { Grounding } from '../grounding.js';
import type { GenerationRequest } from '../roadmap-drafts.js';

export interface ExecutionRepository {
  quota(userId: string): Promise<{
    period: string;
    timezone: string;
    limit: number;
    used: number;
    reserved: number;
    reservation: number;
    resetsAt: number;
  }>;
  create(
    userId: string,
    workspaceId: string,
    input: ExecutionRequest,
    context: { syntax?: SyntaxReport; sources: TutorSource[] },
  ): Promise<ExecutionRecord>;
  createGeneration(
    userId: string,
    workspaceId: string,
    input: GenerationRequest,
    sources: TutorSource[],
  ): Promise<ExecutionRecord>;
  // Returns null when the revision is no longer current, so a retried request key can still resolve.
  analysisFiles(
    userId: string,
    workspaceId: string,
    revision: number,
  ): Promise<Record<string, string> | null>;
  rejectSyntax(
    userId: string,
    workspaceId: string,
    revision: number,
    syntax: SyntaxReport,
  ): Promise<{ id: string; revision: number; stepId: string; result: unknown }>;
  owned(userId: string, id: string): Promise<ExecutionRecord>;
  list(userId: string, workspaceId: string): Promise<ExecutionRecord[]>;
  cancel(userId: string, id: string): Promise<ExecutionRecord>;
  claim(id: string): Promise<{
    status: string;
    lease?: string;
    input?: unknown;
    budget?: number;
  }>;
  failed(id: string, lease: string): Promise<{ status: string }>;
  active(id: string, lease: string): Promise<boolean>;
  // liveSourceIds: admitted sources still ready now, for generation evidence.
  accept(
    event: WorkerEvent,
    grounding: Grounding | null,
    liveSourceIds: string[],
  ): Promise<ExecutionRecord>;
  // Internal: who owns an execution and which sources it was admitted with.
  sourceScope(id: string): Promise<{
    userId: string;
    workspaceId: string;
    sourceIds: string[];
  } | null>;
  markPublished(id: string): Promise<void>;
  pending(): Promise<ExecutionRecord[]>;
  expire(): Promise<number>;
}
