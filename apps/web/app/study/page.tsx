"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppNav } from "@/components/app/app-nav";
import { Navbar } from "@/components/app/navbar";
import { DraftPage } from "./generation/draft-page";
import { RoadmapCreator } from "./generation/roadmap-creator";
import { useStudy } from "./use-study";
import { StudyStart } from "./study-start";
import { StudyWorkspace } from "./study-workspace";

type View =
  { kind: "home" } | { kind: "create" } | { kind: "draft"; id: string };

/**
 * Links from other pages: `?roadmap=` starts or resumes a roadmap, `?workspace=` opens one
 * that is already started and `?create=1` opens the creator. The page instance survives
 * navigations, so each request is handled when its parameter appears, then removed.
 */
function StudyLinks({
  onRoadmap,
  onWorkspace,
  onCreate,
}: {
  onRoadmap: (roadmapId: string) => void;
  onWorkspace: (workspaceId: string) => void;
  onCreate: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const roadmap = params.get("roadmap");
  const workspace = params.get("workspace");
  const create = params.get("create") === "1";

  useEffect(() => {
    if (roadmap) {
      onRoadmap(roadmap);
    } else if (workspace) {
      onWorkspace(workspace);
    } else if (create) {
      onCreate();
    } else {
      return;
    }

    router.replace(pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadmap, workspace, create]);

  return null;
}

export default function Study() {
  const study = useStudy();
  const [view, setView] = useState<View>({ kind: "home" });

  // Next keeps this route mounted but hidden after navigating away, so the lock follows
  // the effect lifecycle instead of the DOM; hiding the route runs the cleanup.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.viewportApp = "";

    return () => {
      delete root.dataset.viewportApp;
    };
  }, []);

  const links = (
    <Suspense>
      <StudyLinks
        onRoadmap={study.start}
        onWorkspace={study.open}
        onCreate={() => setView({ kind: "create" })}
      />
    </Suspense>
  );

  if (study.workspace) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        {links}
        <StudyWorkspace
          key={study.workspace.id}
          study={study}
          workspace={study.workspace}
        />
      </div>
    );
  }

  const home = () => setView({ kind: "home" });
  const openDraft = (id: string) => setView({ kind: "draft", id });

  let content = (
    <StudyStart
      study={study}
      onCreate={() => setView({ kind: "create" })}
      onOpenDraft={openDraft}
    />
  );

  if (view.kind === "create") {
    content = (
      <main className="flex flex-1 items-start justify-center overflow-auto bg-muted/40 p-4 sm:p-6">
        <div className="w-full max-w-2xl">
          <RoadmapCreator onCreated={openDraft} onCancel={home} />
        </div>
      </main>
    );
  }

  if (view.kind === "draft") {
    content = (
      <DraftPage
        key={view.id}
        workspaceId={view.id}
        onBack={home}
        onStudy={study.start}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {links}
      <Navbar>
        <AppNav />
      </Navbar>
      {content}
    </div>
  );
}
