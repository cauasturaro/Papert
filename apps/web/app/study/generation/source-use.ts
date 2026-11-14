// How each source of a preparation workspace relates to its roadmap generation.

import type { Source } from "../sources/sources-api";
import type { RoadmapDraft } from "./drafts-api";

export type SourceUseTone = "used" | "neutral" | "info" | "warning";

export type SourceUse = {
  id: string;
  filename: string;
  label: string;
  tone: SourceUseTone;
};

type DraftFacts = Pick<RoadmapDraft, "status" | "consulted" | "evidence"> & {
  stepIds: string[];
};

function beforeGeneration(source: Source): Omit<SourceUse, "id" | "filename"> {
  if (source.status === "ready") {
    return { label: "Ready; Seymour will read it", tone: "neutral" };
  }

  if (source.status === "failed") {
    return {
      label: "Could not be read; generation will skip it",
      tone: "warning",
    };
  }

  return { label: "Still processing", tone: "info" };
}

function afterGeneration(
  source: Source,
  facts: DraftFacts,
): Omit<SourceUse, "id" | "filename"> {
  const consulted = facts.consulted.some((item) => item.id === source.id);

  if (!consulted) {
    return {
      label: "Not used: it was not ready when the roadmap was generated",
      tone: "neutral",
    };
  }

  const steps = facts.evidence
    .filter((item) => item.sourceId === source.id)
    .map((item) => facts.stepIds.indexOf(item.stepId) + 1)
    .filter((number) => number > 0);

  const unique = [...new Set(steps)].sort((a, b) => a - b);

  if (unique.length === 0) {
    return {
      label: "Read, but nothing in it was cited for your goal",
      tone: "neutral",
    };
  }

  const noun = unique.length === 1 ? "step" : "steps";

  return { label: `Used in ${noun} ${unique.join(", ")}`, tone: "used" };
}

/**
 * Never claims a source was used unless the roadmap cites it; pending and failed
 * sources are named as such.
 */
export function sourceUses(sources: Source[], facts: DraftFacts): SourceUse[] {
  return sources.map((source) => {
    const use =
      facts.status === "generated"
        ? afterGeneration(source, facts)
        : beforeGeneration(source);

    return { id: source.id, filename: source.filename, ...use };
  });
}

/**
 * Generation waits for uploads still in flight so they are not silently skipped. Uploads
 * that failed in this tab (`stalledIds`) never finish, so they do not block it.
 */
export function pendingSources(sources: Source[], stalledIds: string[] = []) {
  const stalled = new Set(stalledIds);

  return sources.filter((source) => {
    if (stalled.has(source.id)) {
      return false;
    }

    return (
      source.status === "processing" || source.status === "awaiting_upload"
    );
  }).length;
}
