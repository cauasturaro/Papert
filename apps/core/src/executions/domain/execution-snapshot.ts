import type { ExecutionRequest } from './execution.js';
import type { SummaryFold } from './tutor/conversation-window.js';
import type { ProgressionStep } from './ports/execution-study-progression.js';
import type { TutorNote, TutorSummary } from './ports/execution-memory.js';
import type { TutorSource, TutorTurn } from './tutor/tutor-context.js';
import type { GenerationLevel } from './roadmaps/roadmap-drafts.js';
import type { RecommendationCandidate } from './roadmaps/recommendation.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';

// Older rows omit context fields added after their admission.
type SnapshotFields = Partial<Omit<ExecutionRequest, 'kind'>> & {
  sessionId?: string;
  workspaceId?: string;
  stepId?: string;
  files?: Record<string, string>;
  challenge?: ProgressionStep['challenge'];
  objective?: string;
  stepTitle?: string;
  solutionAllowed?: boolean;
  recentResults?: { revision: number; result: unknown }[];
  sources?: TutorSource[];
  recentTurns?: TutorTurn[];
  foldTurns?: TutorTurn[];
  memory?: TutorNote[];
  summary?: TutorSummary;
  summaryFold?: SummaryFold;
  attemptId?: string;
  syntax?: Pick<SyntaxReport, 'coverage' | 'checked' | 'unchecked'>;
  goal?: string;
  level?: GenerationLevel;
  candidates?: RecommendationCandidate[];
};

export type ChatSnapshot = SnapshotFields & { kind: 'chat' };
export type AnalysisSnapshot = SnapshotFields & { kind: 'analysis' };
export type GenerationSnapshot = SnapshotFields & { kind: 'generation' };
export type RecommendationSnapshot = SnapshotFields & {
  kind: 'recommendation';
};
export type LegacyExecutionSnapshot = SnapshotFields & { kind?: undefined };

export type ExecutionSnapshot =
  | ChatSnapshot
  | AnalysisSnapshot
  | GenerationSnapshot
  | RecommendationSnapshot
  | LegacyExecutionSnapshot;
