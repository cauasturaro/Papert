"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { Checkbox } from "@/components/ui/checkbox/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import {
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from "@/components/ui/form-field/form-field";
import { Input } from "@/components/ui/input/input";
import { AUTHOR_NAME_MAX, authorNameProblem } from "./author-name";
import { publishRoadmap } from "./community-api";
import { COMMUNITY_KEY } from "./community-keys";
import { PublishSuccess } from "./publish-success";

/** Explicit, permanent publication of a learner's own generated roadmap. */
export function PublishDialog({
  roadmap,
  open,
  onOpenChange,
}: {
  roadmap: { id: string; title: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [authorName, setAuthorName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const publication = useMutation({
    mutationFn: () => publishRoadmap(roadmap.id, authorName.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COMMUNITY_KEY] });
    },
  });

  const name = authorName.trim();
  const nameProblem = authorNameProblem(name);
  // Only explain the rule once the learner has typed something.
  const shownProblem = name ? nameProblem : null;
  const valid = nameProblem === null && acknowledged;
  const published = publication.data;

  // The dialog opens in an effect of its own, after which the field can take focus.
  useEffect(() => {
    if (open && !published) {
      nameRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();

    if (valid) {
      publication.mutate();
    }
  }

  function change(next: boolean) {
    if (!publication.isPending) {
      onOpenChange(next);
    }
  }

  // Both views render the same dialog element, so it stays open while the content changes.
  if (published) {
    return (
      <Dialog
        open={open}
        onOpenChange={change}
        size="md"
        aria-labelledby={`${nameId}-done`}
      >
        <PublishSuccess
          titleId={`${nameId}-done`}
          roadmap={roadmap}
          authorName={published.authorName}
          onClose={() => change(false)}
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      size="md"
      aria-labelledby={`${nameId}-title`}
    >
      <form onSubmit={submit} className="contents">
        <DialogHeader>
          <DialogTitle id={`${nameId}-title`}>
            Publish “{roadmap.title}”
          </DialogTitle>
          <DialogDescription>
            Published roadmaps are public, permanent and cannot be edited.
          </DialogDescription>
        </DialogHeader>

        <DialogContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 rounded-md border border-border p-3">
              <p className="font-medium">Becomes public</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Title, description and level</li>
                <li>Steps, concepts and challenges</li>
                <li>Starter files</li>
                <li>The public name below</li>
              </ul>
            </div>

            <div className="space-y-1 rounded-md border border-border p-3">
              <p className="font-medium">Stays private</p>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                <li>Your sources and their citations</li>
                <li>Your files, notes and attempts</li>
                <li>Your conversations with Seymour</li>
                <li>Your e-mail and account</li>
              </ul>
            </div>
          </div>

          <FormField>
            <FormLabel htmlFor={nameId}>Public author name</FormLabel>
            <Input
              ref={nameRef}
              id={nameId}
              value={authorName}
              maxLength={AUTHOR_NAME_MAX * 2}
              autoComplete="nickname"
              required
              aria-invalid={shownProblem ? true : undefined}
              aria-describedby={`${nameId}-hint ${nameId}-problem`}
              onChange={(event) => setAuthorName(event.target.value)}
            />
            <FormDescription id={`${nameId}-hint`}>
              2 to 40 letters, digits, spaces, dots, hyphens or underscores. It
              is shown on the roadmap and never changes.
            </FormDescription>
            <FormMessage id={`${nameId}-problem`} aria-live="polite">
              {shownProblem}
            </FormMessage>
          </FormField>

          <label className="flex items-start gap-3">
            <Checkbox
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>
              I understand that publishing is permanent and that the roadmap
              text becomes public.
            </span>
          </label>

          {publication.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{publication.error.message}</AlertDescription>
            </Alert>
          )}
        </DialogContent>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={publication.isPending}
            onClick={() => change(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || publication.isPending}>
            {publication.isPending ? "Publishing…" : "Publish"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
