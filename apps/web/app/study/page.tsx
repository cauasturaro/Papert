"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "@/components/app/navbar";
import { DraftPage } from "./generation/draft-page";
import { RoadmapCreator } from "./generation/roadmap-creator";
import { useStudy } from "./use-study";
import { StudyStart } from "./study-start";
import { StudyWorkspace } from "./study-workspace";

type View =
  { kind: "home" } | { kind: "create" } | { kind: "draft"; id: string };

export default function Study() {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <StudySpace />
    </QueryClientProvider>
  );
}

function StudySpace() {
  const study = useStudy();
  const [view, setView] = useState<View>({ kind: "home" });

  if (study.workspace) {
    return (
      <div data-viewport-app className="flex h-dvh flex-col overflow-hidden">
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
    <div data-viewport-app className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      {content}
    </div>
  );
}
