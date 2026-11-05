"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge/badge";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { UsersIcon } from "@/components/icons";
import { listPublications } from "./community-api";
import { PublishDialog } from "./publish-dialog";
import { PUBLICATIONS_KEY } from "./community-keys";

/** Publish button for the learner's own roadmap, or its catalog link once published. */
export function PublishAction({
  roadmap,
}: {
  roadmap: { id: string; title: string };
}) {
  const [open, setOpen] = useState(false);

  const publications = useQuery({
    queryKey: PUBLICATIONS_KEY,
    queryFn: listPublications,
    retry: false,
  });

  const published = publications.data?.some(
    (item) => item.roadmapId === roadmap.id,
  );

  // When the list cannot load, Publish stays available; publishing again returns the first publication.
  if (publications.isPending) {
    return null;
  }

  if (published && !open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Published</Badge>
        <Link
          href={`/community/${roadmap.id}`}
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          View in the catalog
        </Link>
      </div>
    );
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UsersIcon />
        Publish to the community
      </Button>

      <PublishDialog roadmap={roadmap} open={open} onOpenChange={setOpen} />
    </>
  );
}
