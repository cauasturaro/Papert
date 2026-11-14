import { DomainError } from '../../common/domain/domain-error.js';

export class SourceError extends DomainError {}

// Keep in sync with the source_document table checks.
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const MAX_WORKSPACE_SOURCES = 20;
export const MAX_DAILY_REGISTRATIONS = 30;
export const UPLOAD_URL_SECONDS = 600;
export const PROCESSING_TIMEOUT_MS = 60 * 60 * 1000;

export type SourceFormat = 'pdf' | 'doc' | 'docx' | 'md';

export type SourceStatus =
  'awaiting_upload' | 'processing' | 'ready' | 'failed' | 'deleted';

type FormatRule = {
  extension: string;
  contentType: string;
  // Browsers report these for the format; they are normalized to `contentType`.
  accepted: string[];
};

const SOURCE_FORMATS: Record<SourceFormat, FormatRule> = {
  pdf: {
    extension: 'pdf',
    contentType: 'application/pdf',
    accepted: ['application/pdf'],
  },
  doc: {
    extension: 'doc',
    contentType: 'application/msword',
    accepted: ['application/msword'],
  },
  docx: {
    extension: 'docx',
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    accepted: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  md: {
    extension: 'md',
    contentType: 'text/markdown',
    accepted: ['text/markdown', 'text/x-markdown', 'text/plain'],
  },
};

// Reported by ingestion through `fail`; anything else is rejected.
export const FAILURE_CODES = [
  'unsupported_format',
  'content_mismatch',
  'corrupt_file',
  'encrypted',
  'no_text',
  'too_large',
  'too_many_pages',
  'too_much_text',
  'invalid_upload',
  'processing_failed',
] as const;

export type FailureCode =
  (typeof FAILURE_CODES)[number] | 'upload_expired' | 'processing_timeout';

/** What the client says about a file before uploading it. */
export type Declaration = {
  filename: string;
  contentType: string;
  size: number;
};

export type Registration = {
  filename: string;
  format: SourceFormat;
  contentType: string;
  size: number;
};

// Validates the client's declaration; ingestion re-checks the real bytes.
export function registration(body: Declaration) {
  const extension = body.filename.split('.').pop()?.toLowerCase() ?? '';
  const entry = Object.entries(SOURCE_FORMATS).find(
    ([, rule]) => rule.extension === extension,
  );

  if (!entry || !body.filename.includes('.')) {
    throw new SourceError('invalid', 'Upload a PDF, DOC, DOCX or MD file.');
  }

  const [format, rule] = entry as [SourceFormat, FormatRule];
  const declared = body.contentType.toLowerCase().split(';')[0].trim();
  const unknownType = ['', 'application/octet-stream'].includes(declared);

  if (!unknownType && !rule.accepted.includes(declared)) {
    throw new SourceError(
      'invalid',
      'The file type does not match its extension.',
    );
  }

  if (body.size > MAX_SOURCE_BYTES) {
    throw new SourceError('invalid', 'Files must be 15 MB or smaller.');
  }

  const result: Registration = {
    filename: body.filename,
    format,
    contentType: rule.contentType,
    size: body.size,
  };

  return result;
}

export function contentTypeOf(format: SourceFormat) {
  return SOURCE_FORMATS[format].contentType;
}

export function objectKey(documentId: string, format: SourceFormat) {
  return `documents/${documentId}/original.${SOURCE_FORMATS[format].extension}`;
}

const keyPattern =
  /^documents\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/original\.(pdf|doc|docx|md)$/;

export function parseObjectKey(key: string) {
  const match = keyPattern.exec(key);
  if (!match) {
    return null;
  }

  const extension = match[2];
  const format = Object.entries(SOURCE_FORMATS).find(
    ([, rule]) => rule.extension === extension,
  )?.[0] as SourceFormat;

  return { documentId: match[1], format };
}

// S3 sequencers are hexadecimal; compare after left-padding to equal length.
export function compareSequencers(left: string, right: string) {
  const width = Math.max(left.length, right.length);
  const a = left.toUpperCase().padStart(width, '0');
  const b = right.toUpperCase().padStart(width, '0');

  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

/** An S3 ObjectCreated notification for a registered key. */
export type ObjectEvent = {
  bucket: string;
  key: string;
  versionId: string;
  sequencer: string;
  size: number;
};

/** Identifies the object version a worker result refers to. */
export type VersionRef = {
  documentId: string;
  versionId: string;
  sequencer: string;
};

export type Completion = VersionRef & {
  chunkCount: number;
  characterCount: number;
  pageCount: number | null;
  embeddingTokens: number;
  warnings: string[];
};

export type Failure = VersionRef & { code: FailureCode };

// Failures about the upload itself cannot be fixed by extracting again.
const NOT_REINDEXABLE = ['invalid_upload', 'upload_expired'];

export type ReindexResult =
  | {
      outcome: 'process';
      documentId: string;
      workspaceId: string;
      format: SourceFormat;
      bucket: string;
      key: string;
      versionId: string;
      sequencer: string;
    }
  | { outcome: 'skip'; reason: string };

export type BeginResult =
  | {
      outcome: 'process';
      documentId: string;
      workspaceId: string;
      format: SourceFormat;
    }
  | {
      // `invalid` is a newer registered version that must not stay indexed.
      outcome: 'deleted' | 'invalid';
      reason: string;
      documentId: string;
      workspaceId: string;
    }
  | { outcome: 'reject' | 'stale' | 'duplicate'; reason: string };

export type StoredSource = {
  id: string;
  workspaceId: string;
  bucket: string;
  objectKey: string;
  filename: string;
  format: SourceFormat;
  sizeBytes: number;
  status: SourceStatus;
  objectVersionId: string | null;
  sequencer: string | null;
  errorCode: string | null;
  chunkCount: number | null;
  characterCount: number | null;
  pageCount: number | null;
  warnings: string[];
  uploadExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  readyAt: Date | null;
};

// Decides how an ObjectCreated event relates to the registered document.
export function beginDecision(
  source: StoredSource | null,
  request: ObjectEvent,
  bucket: string,
):
  | { kind: 'result'; result: BeginResult }
  | { kind: 'invalid' }
  | { kind: 'process' } {
  const parsed = parseObjectKey(request.key);

  if (request.bucket !== bucket || !parsed) {
    return {
      kind: 'result',
      result: { outcome: 'reject', reason: 'unknown_object' },
    };
  }

  if (
    !source ||
    source.id !== parsed.documentId ||
    source.format !== parsed.format ||
    source.bucket !== request.bucket
  ) {
    return {
      kind: 'result',
      result: { outcome: 'reject', reason: 'unregistered' },
    };
  }

  if (source.status === 'deleted') {
    return {
      kind: 'result',
      result: {
        outcome: 'deleted',
        reason: 'deleted',
        documentId: source.id,
        workspaceId: source.workspaceId,
      },
    };
  }

  if (source.sequencer) {
    const order = compareSequencers(request.sequencer, source.sequencer);
    const sameVersion = source.objectVersionId === request.versionId;

    if (order < 0 || (order === 0 && !sameVersion)) {
      return {
        kind: 'result',
        result: { outcome: 'stale', reason: 'older_version' },
      };
    }

    // Redelivery of the current version is retried unless it already finished.
    if (order === 0 && source.status === 'ready') {
      return {
        kind: 'result',
        result: { outcome: 'duplicate', reason: 'already_ready' },
      };
    }
  }

  const tampered =
    request.size !== source.sizeBytes || request.size > MAX_SOURCE_BYTES;

  if (tampered) {
    return { kind: 'invalid' };
  }

  return { kind: 'process' };
}

export type ResultVerdict = { accepted: boolean; deleted: boolean };

/** Worker results apply only to the current version of a live, unfinished document. */
export function resultVerdict(
  source: StoredSource | null,
  version: VersionRef,
): ResultVerdict {
  if (!source) {
    return { accepted: false, deleted: false };
  }

  if (source.status === 'deleted') {
    return { accepted: false, deleted: true };
  }

  const current =
    source.objectVersionId === version.versionId &&
    source.sequencer?.toUpperCase() === version.sequencer.toUpperCase();
  const open = source.status === 'processing' || source.status === 'failed';

  return { accepted: current && open, deleted: false };
}

/** Re-extraction can resume an unfinished current version after redelivery. */
export function reindexDecision(source: StoredSource | null) {
  if (!source || !source.objectVersionId || !source.sequencer) {
    return { reindex: false as const, reason: 'no_object' };
  }

  const resumable = ['ready', 'failed', 'processing'].includes(source.status);
  const fixable = !NOT_REINDEXABLE.includes(source.errorCode ?? '');

  if (!resumable || !fixable) {
    return { reindex: false as const, reason: source.status };
  }

  return { reindex: true as const, reason: null };
}

export type LimitBreach = 'workspace_limit' | 'daily_limit';

/** Registration limits, given the workspace's live sources and the user's sources today. */
export function registrationLimit(
  activeInWorkspace: number,
  registeredToday: number,
): LimitBreach | null {
  if (activeInWorkspace >= MAX_WORKSPACE_SOURCES) {
    return 'workspace_limit';
  }

  if (registeredToday >= MAX_DAILY_REGISTRATIONS) {
    return 'daily_limit';
  }

  return null;
}

/** Cut-off before which a document still `processing` is considered stuck. */
export function processingDeadline(now: Date) {
  return new Date(now.getTime() - PROCESSING_TIMEOUT_MS);
}

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
