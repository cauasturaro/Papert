export const GENERATION_PHASES = [
  "Understanding your goal",
  "Designing steps and challenges",
  "Checking the roadmap",
] as const;

// Seymour reports "reading your sources", then "drafting", then "correcting" when a
// first draft needs a repair. Unknown text keeps the earliest phase.
const DRAFTING = /\bdraft/i;
const CHECKING = /\bcorrect|\bcheck/i;

/** Index into `GENERATION_PHASES` for Seymour's latest progress text. */
export function generationPhase(progress: string) {
  if (CHECKING.test(progress)) {
    return 2;
  }

  if (DRAFTING.test(progress)) {
    return 1;
  }

  return 0;
}

/** "0:42" or "1:05" for a running generation. */
export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
