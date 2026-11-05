import type { SyntaxReport } from '../../../analysis/domain/syntax.js';
import type { ExecutionRequest, ExecutionRecord } from '../execution.js';
import type { TutorSource } from '../tutor-context.js';
import type { GenerationRequest } from '../roadmap-drafts.js';
import type {
  RecommendationCandidate,
  RecommendationRequest,
} from '../recommendation.js';

/** Admission, learner reads and the publication outbox of executions. */
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
  createRecommendation(
    userId: string,
    workspaceId: string,
    input: RecommendationRequest,
    candidates: RecommendationCandidate[],
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
  list(
    userId: string,
    workspaceId: string,
    conversationId?: string,
  ): Promise<ExecutionRecord[]>;
  markPublished(id: string): Promise<void>;
  pending(): Promise<ExecutionRecord[]>;
}
