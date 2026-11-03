"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card/card";
import { cn } from "@/lib/utils";
import { RoadmapSteps } from "./challenge/roadmap-steps";
import type { useStudy } from "./use-study";

/** Shown until a workspace exists: loading, retry, or the roadmap to start. */
export function StudyStart({ study }: { study: ReturnType<typeof useStudy> }) {
  const { roadmap, busy, message, signedOut, start, retryLoad } = study;

  return (
    <main className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-4">
      <div className="flex w-full max-w-xl flex-col gap-4">
        <h1 className="sr-only">Your study space</h1>

        <p
          role="status"
          aria-live="polite"
          className="text-center text-sm text-muted-foreground"
        >
          {busy ? "Please wait…" : message}
        </p>

        {signedOut && !busy && (
          <Link href="/account" className={cn(buttonVariants(), "mx-auto")}>
            Go to sign in
          </Link>
        )}

        {!signedOut && !roadmap && !busy && (
          <Button className="mx-auto" onClick={retryLoad}>
            Retry loading study
          </Button>
        )}

        {roadmap && (
          <Card
            aria-label="Roadmap"
            role="region"
            className="shadow-xl shadow-foreground/5"
          >
            <CardHeader>
              <CardTitle as="h2" className="text-2xl">
                {roadmap.definition.title}
              </CardTitle>
              <CardDescription>
                Created by <strong>{roadmap.authorName}</strong>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <p>{roadmap.definition.description}</p>
              <RoadmapSteps roadmap={roadmap} currentStep={0} />
            </CardContent>

            <CardFooter>
              <Button onClick={start} disabled={busy}>
                Start or resume study
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </main>
  );
}
