"use client";

import { Badge } from "@/components/ui/badge/badge";
import type { Roadmap } from "../study-api";
import type { Evidence } from "./drafts-api";
import { EvidenceLinks } from "./evidence-links";

type Step = Roadmap["definition"]["steps"][number];

export function PreviewStep({
  step,
  index,
  titles,
  evidence,
}: {
  step: Step;
  index: number;
  titles: Map<string, string>;
  evidence: Evidence[];
}) {
  const prerequisites = (step.requires ?? []).map((id) => titles.get(id) ?? id);

  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <header className="space-y-2">
        <h3 className="font-medium">
          <span className="text-muted-foreground">Step {index + 1}. </span>
          {step.title}
        </h3>

        {step.concepts && step.concepts.length > 0 && (
          <ul aria-label="Concepts" className="flex flex-wrap gap-1.5">
            {step.concepts.map((concept) => (
              <li key={concept}>
                <Badge size="sm" variant="secondary">
                  {concept}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        {prerequisites.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Builds on: {prerequisites.join(", ")}
          </p>
        )}
      </header>

      <p className="text-sm whitespace-pre-line">{step.content}</p>

      <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">Challenge</p>
        <p>{step.challenge.instructions}</p>

        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {step.challenge.criteria.map((criterion) => (
            <li key={criterion.id}>{criterion.description}</li>
          ))}
        </ul>
      </div>

      <EvidenceLinks items={evidence} />
    </li>
  );
}
