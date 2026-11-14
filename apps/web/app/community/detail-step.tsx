"use client";

import { Badge } from "@/components/ui/badge/badge";
import { type CatalogDetails } from "./community-api";

type Step = CatalogDetails["steps"][number];

export function DetailStep({
  step,
  index,
  titles,
}: {
  step: Step;
  index: number;
  titles: Map<string, string>;
}) {
  const prerequisites = step.requires.map((id) => titles.get(id) ?? id);

  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">
          Step {index + 1}
        </p>
        <h3 className="text-base font-semibold">{step.title}</h3>
      </div>

      {step.concepts.length > 0 && (
        <ul aria-label="Concepts" className="flex flex-wrap gap-1.5">
          {step.concepts.map((concept) => (
            <li key={concept}>
              <Badge variant="outline" size="sm">
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

      <p className="text-sm whitespace-pre-line">{step.content}</p>

      <div className="space-y-2 rounded-md bg-muted/60 p-3">
        <p className="text-sm font-medium">Challenge</p>
        <p className="text-sm whitespace-pre-line">
          {step.challenge.instructions}
        </p>

        <ul aria-label="Criteria" className="list-disc space-y-1 pl-5 text-sm">
          {step.challenge.criteria.map((criterion) => (
            <li key={criterion.id}>{criterion.description}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}
