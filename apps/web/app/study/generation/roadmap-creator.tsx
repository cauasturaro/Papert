"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OfflineAlert } from "@/components/app/offline-alert";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card/card";
import { FormDescription, FormField, FormLabel } from "@/components/ui/form-field/form-field";
import { Textarea } from "@/components/ui/textarea/textarea";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { LEVELS, type Level } from "@/lib/roadmap";
import { cn } from "@/lib/utils";
import { studyKeys } from "../study-keys";
import { ACTIVE_DRAFT_LIMIT, createDraft } from "./drafts-api";
import { useDraftCapacity } from "./use-draft-capacity";

const GOAL_MIN = 10;
const GOAL_MAX = 500;
// The unsent goal survives Cancel and reloads in this tab.
const GOAL_STORAGE_KEY = "papert:roadmap-goal";

function readStoredGoal() {
  try {
    return window.sessionStorage.getItem(GOAL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeGoal(goal: string) {
  try {
    if (goal) {
      window.sessionStorage.setItem(GOAL_STORAGE_KEY, goal);
    } else {
      window.sessionStorage.removeItem(GOAL_STORAGE_KEY);
    }
  } catch {
    // Storage can be disabled; the goal then lives only in this form.
  }
}

function continueHint(length: number, atLimit: boolean) {
  if (atLimit) {
    return `You already have ${ACTIVE_DRAFT_LIMIT} roadmaps in preparation. Generate or discard one first.`;
  }

  if (length < GOAL_MIN) {
    const missing = GOAL_MIN - length;

    return `Write ${missing} more ${missing === 1 ? "character" : "characters"} to continue.`;
  }

  return "";
}

/** First step of a personalized roadmap: the goal and level, before any source is added. */
export function RoadmapCreator({
  onCreated,
  onCancel,
}: {
  onCreated: (workspaceId: string) => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState("");
  const [level, setLevel] = useState<Level>("beginner");

  // Session storage is only readable after hydration, so the saved goal arrives in an effect.
  useEffect(() => {
    const stored = readStoredGoal();

    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGoal(stored);
    }
  }, []);

  const { drafts, activeDrafts: active, atLimit } = useDraftCapacity();

  const creation = useMutation({
    mutationFn: () => createDraft(goal.trim(), level),
    onSuccess: (draft) => {
      storeGoal("");
      void queryClient.invalidateQueries({ queryKey: studyKeys.drafts() });

      onCreated(draft.workspaceId);
    },
  });

  const activeDrafts = active.length;
  const length = goal.trim().length;
  const valid = length >= GOAL_MIN && length <= GOAL_MAX && !atLimit;
  const hint = continueHint(length, atLimit);

  function changeGoal(value: string) {
    setGoal(value);
    storeGoal(value);
  }

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
          <OfflineAlert />

          {drafts.data && (
            <p className="text-sm text-muted-foreground">
              {activeDrafts} of {ACTIVE_DRAFT_LIMIT} drafts in preparation.
            </p>
          )}

          <FormField>
            <FormLabel htmlFor="roadmap-goal">Learning goal</FormLabel>
            <Textarea
              id="roadmap-goal"
              rows={4}
              maxLength={GOAL_MAX}
              value={goal}
              onChange={(event) => changeGoal(event.target.value)}
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

                // Native radios keep arrow-key selection; the card shows the choice.
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                      selected
                        ? "border-ring bg-primary/25 ring-2 ring-ring"
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
            <Alert variant="destructive" size="sm" role="alert">
              <AlertDescription>
                {toLearnerMessage(creation.error)}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={creation.isPending}
              disabled={!valid}
              aria-describedby={hint ? "roadmap-continue-hint" : undefined}
            >
              Continue
            </Button>
          </div>

          {hint && (
            <FormDescription id="roadmap-continue-hint">{hint}</FormDescription>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
