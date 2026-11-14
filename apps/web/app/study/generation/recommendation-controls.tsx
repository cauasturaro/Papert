"use client";

import { Button } from "@/components/ui/button/button";
import { type CommunityActions } from "../../community/use-community-actions";
import { CheckFailed } from "./recommendation-check-failed";
import { Matches } from "./recommendation-matches";
import type { Recommendation } from "./recommendation-panel";

export function ViewControls({
  recommendation,
  actions,
}: {
  recommendation: Recommendation;
  actions: CommunityActions;
}) {
  switch (recommendation.view) {
    case "idle":
      if (!recommendation.checkError) {
        return null;
      }

      return (
        <Button
          size="sm"
          variant="outline"
          disabled={recommendation.checking}
          onClick={recommendation.check}
        >
          Check the community catalog
        </Button>
      );
    case "failed":
      return <CheckFailed recommendation={recommendation} />;
    case "matches":
      return <Matches recommendation={recommendation} actions={actions} />;
    case "declined":
      return (
        <Button
          size="sm"
          variant="ghost"
          disabled={recommendation.checking}
          onClick={recommendation.check}
        >
          Check the community again
        </Button>
      );
    default:
      return null;
  }
}
