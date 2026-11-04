"use client";

import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { BookIcon } from "@/components/icons";
import type { Roadmap } from "../study-api";
import { useOpenSource } from "../viewer/source-viewer-context";
import type { Evidence } from "./drafts-api";

type Step = Roadmap["definition"]["steps"][number];

function EvidenceLinks({ items }: { items: Evidence[] }) {
  const openSource = useOpenSource();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Based on</span>

      {items.map((item) => {
        // The viewer opens at the cited location; evidence carries no passage text.
        const citation = { ...item, excerpt: "", quote: null };

        return (
          <Button
            key={`${item.sourceId}-${item.cite}`}
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => openSource({ sourceId: item.sourceId, citation })}
          >
            <BookIcon className="size-3.5" />
            {item.cite}
          </Button>
        );
      })}
    </div>
  );
}

function PreviewStep({
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
        <h4 className="font-medium">
          <span className="text-muted-foreground">Step {index + 1}. </span>
          {step.title}
        </h4>

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

  return (
    <section aria-label="Generated roadmap" className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold">{roadmap.definition.title}</h3>
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
    </section>
  );
}
