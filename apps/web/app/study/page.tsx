"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "@/components/app/navbar";
import { useStudy } from "./use-study";
import { StudyStart } from "./study-start";
import { StudyWorkspace } from "./study-workspace";

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

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {study.workspace ? (
        <StudyWorkspace
          key={study.workspace.id}
          study={study}
          workspace={study.workspace}
        />
      ) : (
        <>
          <Navbar />
          <StudyStart study={study} />
        </>
      )}
    </div>
  );
}
