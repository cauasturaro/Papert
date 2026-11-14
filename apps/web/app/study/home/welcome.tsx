"use client";

import Link from "next/link";
import { SparklesIcon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button/button";

const LOOP = [
  {
    title: "Pick a goal",
    description:
      "Start a community roadmap, or describe what you want to build and Seymour designs one for you.",
  },
  {
    title: "Write the code",
    description:
      "Each step has a challenge with clear criteria. You build it in your own private workspace.",
  },
  {
    title: "Get feedback",
    description:
      "Ask for an analysis when you are ready, or ask Seymour when you are stuck. An approved step unlocks the next one.",
  },
];

export function Welcome({ onCreate }: { onCreate: () => void }) {
  return (
    <section
      aria-labelledby="welcome-title"
      className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="welcome-title" className="text-lg font-semibold">
          Welcome to Papert
        </h2>
        <p className="text-sm text-muted-foreground">
          You learn by building, one step at a time.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {LOOP.map((item, index) => (
          <li key={item.title} className="space-y-1 rounded-md bg-muted/50 p-3">
            <p className="flex items-center gap-2 font-medium">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {index + 1}
              </span>
              {item.title}
            </p>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Link href="/community" className={buttonVariants()}>
          Explore community roadmaps
        </Link>

        <Button variant="outline" onClick={onCreate}>
          <SparklesIcon />
          Create a roadmap
        </Button>
      </div>
    </section>
  );
}
