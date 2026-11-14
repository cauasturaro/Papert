import type { ExecutionSnapshot } from '../domain/execution-snapshot.js';

/** Stored snapshots predate the current request contracts and retain their original fields. */
export function executionSnapshot(value: unknown): ExecutionSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as ExecutionSnapshot;
}

export function executionRecord<T extends { input: unknown }>(record: T) {
  return { ...record, input: executionSnapshot(record.input) };
}
