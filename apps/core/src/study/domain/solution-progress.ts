export const SOLUTION_ATTEMPTS_REQUIRED = 3;

export type SolutionProgress = {
  analyzedAttempts: number;
  required: number;
  eligible: boolean;
};

function codeVersion(files: unknown) {
  const entries = Object.entries((files ?? {}) as Record<string, unknown>);

  entries.sort(([left], [right]) => left.localeCompare(right));

  return JSON.stringify(entries);
}

/** Only analyzed `needs_work` attempts count, and identical code counts once. */
export function analyzedAttemptCount(
  attempts: { files: unknown; result: unknown }[],
) {
  const versions = new Set<string>();

  for (const attempt of attempts) {
    const status = (attempt.result as { status?: unknown } | null)?.status;

    if (status === 'needs_work') {
      versions.add(codeVersion(attempt.files));
    }
  }

  return versions.size;
}

export function solutionProgress(analyzedAttempts: number): SolutionProgress {
  const counted = Math.min(analyzedAttempts, SOLUTION_ATTEMPTS_REQUIRED);

  return {
    analyzedAttempts: counted,
    required: SOLUTION_ATTEMPTS_REQUIRED,
    eligible: counted >= SOLUTION_ATTEMPTS_REQUIRED,
  };
}
