"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";

/** The publish dialog after Core accepted the publication. */
export function PublishSuccess({
  titleId,
  roadmap,
  authorName,
  onClose,
}: {
  titleId: string;
  roadmap: { id: string; title: string };
  authorName: string;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // The form that had focus is gone; reading the title tells the learner it worked.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  return (
    <>
      <DialogHeader>
        <DialogTitle
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="outline-none"
        >
          Published to the community
        </DialogTitle>
        <DialogDescription>
          “{roadmap.title}” is in the catalog as written by{" "}
          <strong>{authorName}</strong>. Other learners can now find, save and
          start it in their own workspace.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Link href={`/community/${roadmap.id}`} className={buttonVariants()}>
          View in the catalog
        </Link>
      </DialogFooter>
    </>
  );
}
