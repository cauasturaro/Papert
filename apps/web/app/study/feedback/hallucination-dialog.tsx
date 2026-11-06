"use client";

import { Button } from "@/components/ui/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";

/** Explains what a hallucination is and what the report sends before it is sent. */
export function HallucinationDialog({
  open,
  subject,
  pending,
  onOpenChange,
  onReport,
}: {
  open: boolean;
  subject: "answer" | "analysis";
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onReport: () => void;
}) {
  return (
    <Dialog size="sm" open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Report a hallucination</DialogTitle>
        <DialogDescription>
          Use this when Seymour stated something false as a fact in this{" "}
          {subject}.
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="space-y-3 text-sm">
        <ul className="list-disc space-y-1 pl-5">
          <li>An API, rule or library feature that does not exist.</li>
          <li>A passage or page your sources do not contain.</li>
          <li>Code, files or test results that are not in your workspace.</li>
        </ul>

        <p className="text-muted-foreground">
          The report rates the {subject} down. Papert&apos;s quality review
          receives only the verdict and a reference to this {subject}; your code
          and messages are not attached. A reviewer may later turn it into a
          test case after removing personal data.
        </p>
      </DialogContent>

      <DialogFooter>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button loading={pending} onClick={onReport}>
          Report hallucination
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
