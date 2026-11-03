import type {
  FailureCode,
  SourceStatus,
  StoredSource,
} from '../domain/source.js';

// Learner-facing wording for each failure; codes are the domain's.
const FAILURE_MESSAGES: Record<FailureCode, string> = {
  unsupported_format: 'This file type is not supported.',
  content_mismatch: 'The file content does not match its extension.',
  corrupt_file: 'The file could not be read. It may be damaged.',
  encrypted: 'Password-protected files cannot be processed.',
  no_text:
    'No extractable text was found. Scanned documents need text recognition first.',
  too_large: 'The file is larger than the allowed size.',
  too_many_pages: 'The document has more pages than allowed.',
  too_much_text: 'The document has more text than allowed.',
  invalid_upload: 'The uploaded object does not match its registration.',
  processing_failed: 'Processing failed repeatedly. Try uploading again later.',
  upload_expired: 'The upload was not completed in time.',
  processing_timeout: 'Processing did not finish in time.',
};

export function presentSource(source: StoredSource, now: Date) {
  const expired =
    source.status === 'awaiting_upload' && source.uploadExpiresAt < now;
  const status: SourceStatus = expired ? 'failed' : source.status;
  const code = (
    expired ? 'upload_expired' : source.errorCode
  ) as FailureCode | null;

  let error = null;

  if (code) {
    const message = FAILURE_MESSAGES[code] ?? FAILURE_MESSAGES.corrupt_file;

    error = { code, message };
  }

  return {
    id: source.id,
    workspaceId: source.workspaceId,
    filename: source.filename,
    format: source.format,
    size: source.sizeBytes,
    status,
    error,
    chunkCount: source.chunkCount,
    characterCount: source.characterCount,
    pageCount: source.pageCount,
    warnings: source.warnings,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    readyAt: source.readyAt,
  };
}
