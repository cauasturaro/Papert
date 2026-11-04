import type {
  beginDecision,
  BeginResult,
  Completion,
  Failure,
  ObjectEvent,
  Registration,
  ReindexResult,
  ResultVerdict,
  StoredSource,
} from './source.js';

export type NewSource = Registration & {
  id: string;
  bucket: string;
  objectKey: string;
  uploadExpiresAt: Date;
};

export type RegisterOutcome =
  | { kind: 'created'; source: StoredSource }
  | { kind: 'workspace_not_found' }
  | { kind: 'workspace_limit' }
  | { kind: 'daily_limit' };

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

// Storage-specific on purpose: bucket, key, presigning and versions.
export interface SourceStorage {
  readonly bucket: string;
  presignUpload(
    key: string,
    contentType: string,
    size: number,
    expiresInSeconds: number,
  ): Promise<string>;
  deleteAllVersions(key: string): Promise<void>;
  // Every object version whose key starts with the prefix (renditions of all versions).
  deleteAllVersionsUnder(prefix: string): Promise<void>;
  presignDownload(request: {
    key: string;
    // Omitted for renditions, whose key already names the original's version.
    versionId?: string;
    contentType: string;
    // Set for "download original"; inline viewing leaves it undefined.
    attachmentFilename?: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
