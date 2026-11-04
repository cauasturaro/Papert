"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card/card";
import {
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from "@/components/ui/form-field/form-field";
import { Textarea } from "@/components/ui/textarea/textarea";
import { cn } from "@/lib/utils";
import type { Level } from "../study-api";
import { createDraft, LEVELS } from "./drafts-api";

const GOAL_MIN = 10;
const GOAL_MAX = 500;

/** First step of a personalized roadmap: the goal and level, before any source is added. */
export function RoadmapCreator({
  onCreated,
  onCancel,
}: {
  onCreated: (workspaceId: string) => void;
  onCancel: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Level>("beginner");

  const creation = useMutation({
    mutationFn: () => createDraft(goal.trim(), level),
    onSuccess: (draft) => onCreated(draft.workspaceId),
  });

  const length = goal.trim().length;
  const valid = length >= GOAL_MIN && length <= GOAL_MAX;

  function submit(event: FormEvent) {
    event.preventDefault();

    if (valid) {
      creation.mutate();
    }
  }

  return (
    <Card className="shadow-xl shadow-foreground/5">
      <form onSubmit={submit} aria-label="Create a roadmap">
        <CardHeader>
          <CardTitle as="h2" className="text-2xl">
            Create a roadmap
          </CardTitle>
          <CardDescription>
            Tell Seymour what you want to build and how experienced you are. You
            can add your own documents on the next screen.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <FormField>
            <FormLabel htmlFor="roadmap-goal">Learning goal</FormLabel>
            <Textarea
              id="roadmap-goal"
              rows={4}
              maxLength={GOAL_MAX}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="For example: structure a NestJS backend with hexagonal architecture for an online store."
              aria-describedby="roadmap-goal-count"
            />
            <FormDescription id="roadmap-goal-count">
              {length} of {GOAL_MAX} characters, at least {GOAL_MIN}.
            </FormDescription>
          </FormField>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Experience level</legend>

            <div className="grid gap-2 sm:grid-cols-3">
              {LEVELS.map((option) => {
                const selected = option.value === level;

                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring/40",
                      selected
                        ? "border-ring bg-primary/15"
                        : "border-border hover:border-input/40",
                    )}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <input
                        type="radio"
                        name="roadmap-level"
                        value={option.value}
                        checked={selected}
                        onChange={() => setLevel(option.value)}
                        className="accent-primary"
                      />
                      {option.label}
                    </span>
                    <span className="text-muted-foreground">{option.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {creation.error && (
            <FormMessage role="alert">{creation.error.message}</FormMessage>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || creation.isPending}>
            {creation.isPending ? "Preparing…" : "Continue"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
