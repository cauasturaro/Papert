import type { AttemptResult } from "../study-api";

// Seymour's prose sometimes sounds like a verdict; Papert's recorded result is the official one.
const SOUNDS_APPROVED =
  /\b(all (the )?criteria (are )?met|approved|meets every criterion|passes)\b/i;

const NEGATED_APPROVAL =
  /\b(not|never|isn[’']t|aren[’']t|wasn[’']t)\s+(?:yet\s+)?(?:approved|passes|all (?:the )?criteria (?:are )?met|meets every criterion)\b/gi;

const SOUNDS_FAILED = /\b(not (yet )?met|does not meet|fails?|missing)\b/i;

export function summaryDisagrees(result: AttemptResult, summary: string) {
  if (result.status === "needs_work") {
    const affirmative = summary.replace(NEGATED_APPROVAL, "");

    return SOUNDS_APPROVED.test(affirmative);
  }

  if (result.status === "approved") {
    return SOUNDS_FAILED.test(summary);
  }

  return false;
}
