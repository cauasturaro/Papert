"use client";

import { PreviewStep } from "./preview-step";
import { StarterFiles } from "./starter-files";
import type { Roadmap } from "../study-api";
import type { Evidence } from "./drafts-api";

// Core sends the starter files with the definition; the shared study type leaves them out.
function starterPaths(roadmap: Roadmap) {
  const definition = roadmap.definition as {
    starterFiles?: Record<string, string>;
  };

  return Object.keys(definition.starterFiles ?? {}).sort();
}

/** Read-only view of a generated roadmap before the learner starts studying it. */
export function RoadmapPreview({
  roadmap,
  evidence,
}: {
  roadmap: Roadmap;
  evidence: Evidence[];
}) {
  const { steps } = roadmap.definition;
  const titles = new Map(steps.map((step) => [step.id, step.title]));
  const paths = starterPaths(roadmap);

  return (
    <section aria-label="Generated roadmap" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{roadmap.definition.title}</h2>
        <p className="text-sm text-muted-foreground">
          {roadmap.definition.description}
        </p>
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <PreviewStep
            key={step.id}
            step={step}
            index={index}
            titles={titles}
            evidence={evidence.filter((item) => item.stepId === step.id)}
          />
        ))}
      </ol>

      <StarterFiles paths={paths} />
    </section>
  );
}
