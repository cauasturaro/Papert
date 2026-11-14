"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { MemoryManager } from "../../memory/memory-manager";

/** Durable memory without leaving the workspace; the same manager as the memory page. */
export function MemoryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog size="lg" open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>What Seymour remembers</DialogTitle>
        <DialogDescription>
          Durable memories apply to every conversation in all your roadmaps.
          This conversation and your sources stay in this workspace.{" "}
          <Link href="/memory" className="underline underline-offset-2">
            Open the memory page
          </Link>
        </DialogDescription>
      </DialogHeader>

      <DialogContent className="max-h-[60dvh] overflow-auto">
        {open && <MemoryManager />}
      </DialogContent>
    </Dialog>
  );
}
