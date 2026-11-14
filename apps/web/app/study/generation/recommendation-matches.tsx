"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import type { CatalogCard } from "../../community/community-api";
import { RoadmapCard } from "../../community/roadmap-card";
import { StartDialog } from "../../community/start-dialog";
import { type CommunityActions } from "../../community/use-community-actions";
import { similarityLabel } from "./recommendation-state";
import { useAdoptRecommendation } from "./use-adopt-recommendation";
import type { Recommendation } from "./recommendation-panel";

export function Matches({
  recommendation,
  actions,
}: {
  recommendation: Recommendation;
  actions: CommunityActions;
}) {
  const [chosen, setChosen] = useState<CatalogCard | null>(null);
  const adoption = useAdoptRecommendation(recommendation, actions);

  function choose(card: CatalogCard) {
    adoption.reset();
    setChosen(card);
  }

  return (
    <div className="space-y-3">
      <ul
        aria-label="Suggested community roadmaps"
        className="grid gap-3 xl:grid-cols-2"
      >
        {recommendation.cards.map((card) => {
          const similarity = recommendation.similarity.get(card.id);

          let note = null;

          if (similarity !== undefined) {
            note = (
              <Badge variant="info" size="sm">
                {similarityLabel(similarity)}
              </Badge>
            );
          }

          return (
            <li key={card.id}>
              <RoadmapCard
                card={card}
                actions={actions}
                note={note}
                primaryAction={
                  <Button size="sm" onClick={() => choose(card)}>
                    Use this roadmap
                  </Button>
                }
              />
            </li>
          );
        })}
      </ul>

      <StartDialog
        open={chosen !== null}
        onOpenChange={(open) => {
          if (!open) {
            setChosen(null);
          }
        }}
        title={chosen?.title ?? ""}
        pending={adoption.pending}
        error={adoption.error}
        note={
          <p className="text-sm">
            This draft is discarded, with any sources you added to it. You can
            add your sources again in the new workspace.
          </p>
        }
        onConfirm={() => {
          if (chosen) {
            adoption.adopt(chosen.id);
          }
        }}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
        <p className="flex-1 text-sm">
          None of these fit what you want to learn?
        </p>
        <Button
          variant="outline"
          disabled={recommendation.declining}
          onClick={recommendation.decline}
        >
          Continue to generate my own
        </Button>
      </div>
    </div>
  );
}
