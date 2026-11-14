"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import type { Recommendation } from "./recommendation-panel";

export function CheckFailed({ recommendation }: { recommendation: Recommendation }) {
  return (
    <Alert role="alert">
      <AlertTitle>The community catalog could not be checked</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>Try again, or continue without suggestions.</span>
        <Button
          size="sm"
          variant="outline"
          disabled={recommendation.checking}
          onClick={recommendation.check}
        >
          Try again
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={recommendation.declining}
          onClick={recommendation.decline}
        >
          Continue without suggestions
        </Button>
      </AlertDescription>
    </Alert>
  );
}
