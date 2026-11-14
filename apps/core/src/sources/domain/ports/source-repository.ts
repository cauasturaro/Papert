import type {
  beginDecision,
  BeginResult,
  Completion,
  Failure,
  ObjectEvent,
  ReindexResult,
  ResultVerdict,
  StoredSource,
  NewSource,
  RegisterOutcome,
} from '../source.js';

// Each method locks the document row and applies the domain rules inside its transaction.
export interface SourceRepository {
  register(
    userId: string,
    workspaceId: string,
    source: NewSource,
    dayStart: Date,
  ): Promise<RegisterOutcome>;
  list(userId: string, workspaceId: string): Promise<StoredSource[] | null>;
  markDeleted(
    userId: string,
    workspaceId: string,
    sourceId: string,
  ): Promise<StoredSource | null>;
  markPurged(sourceId: string): Promise<void>;
  begin(
    event: ObjectEvent,
    decide: (source: StoredSource | null) => ReturnType<typeof beginDecision>,
  ): Promise<BeginResult>;
  complete(completion: Completion): Promise<ResultVerdict>;
  fail(failure: Failure): Promise<ResultVerdict>;
  findByKey(key: string): Promise<StoredSource | null>;
  reindex(documentId: string): Promise<ReindexResult>;
  expire(now: Date): Promise<{ expired: number; timedOut: number }>;
  unpurged(limit: number): Promise<StoredSource[]>;
}
