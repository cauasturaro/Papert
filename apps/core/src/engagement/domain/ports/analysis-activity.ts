import type { EvaluatedAnalysis } from '../engagement.js';

// Only infrastructure may unwrap this caller-owned transaction; no nested transaction is started.
export type EngagementTransaction = object;

/** Driven by executions inside the transaction that records the analysis outcome. */
export interface AnalysisActivity {
  recordAnalysis(
    tx: EngagementTransaction,
    analysis: EvaluatedAnalysis,
  ): Promise<void>;
}
