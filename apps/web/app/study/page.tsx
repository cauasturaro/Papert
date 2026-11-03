"use client";

import Link from "next/link";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useStudy } from "./use-study";
import { ExecutionPanel } from "./execution-panel";
import { WorkspaceEditor } from "./workspace-editor";

export default function Study() {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <StudySpace />
    </QueryClientProvider>
  );
}

function StudySpace() {
  const {
    roadmap,
    workspace,
    files,
    setFiles,
    notes,
    setNotes,
    busy,
    message,
    status,
    online,
    conflict,
    start,
    retryLoad,
    save,
    reload,
    download,
  } = useStudy();

  const step = workspace?.roadmap.definition.steps[workspace.currentStep];

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-8 lg:px-8">
      <nav className="flex gap-6" aria-label="Main navigation">
        <Link href="/" className="underline">
          Papert
        </Link>
        <Link href="/account" className="underline">
          Your account / Sign in
        </Link>
      </nav>

      <h1 className="text-3xl font-semibold">Your study space</h1>

      <p role="status" aria-live="polite">
        {busy ? "Please wait…" : message}
      </p>

      {!roadmap && !busy && (
        <Button onClick={retryLoad}>Retry loading study</Button>
      )}

      {roadmap && (
        <section className="flex flex-col gap-3" aria-label="Roadmap">
          <h2 className="text-2xl font-semibold">{roadmap.definition.title}</h2>

          <p>
            Created by <strong>{roadmap.authorName}</strong>
          </p>
          <p>{roadmap.definition.description}</p>

          <ol className="list-inside list-decimal">
            {roadmap.definition.steps.map((item, index) => {
              let status = "Current step";

              if (index > (workspace?.currentStep ?? 0)) {
                status = "Locked";
              } else if (index < (workspace?.currentStep ?? 0)) {
                status = "Completed";
              }

              return (
                <li key={item.id}>
                  {item.title} — {status}
                </li>
              );
            })}
          </ol>

          {!workspace && (
            <button
              className="auth-button w-fit"
              type="button"
              onClick={start}
              disabled={busy}
            >
              Start or resume study
            </button>
          )}
        </section>
      )}

      {workspace && step && (
        <>
          <section
            className="flex flex-col gap-4"
            aria-label="Current challenge"
          >
            <h2 className="text-2xl font-semibold">{step.title}</h2>
            <p>{step.content}</p>

            <h3 className="text-xl font-semibold">Challenge</h3>
            <p>{step.challenge.instructions}</p>

            <h3 className="font-semibold">Acceptance criteria</h3>
            <ul className="list-inside list-disc">
              {step.challenge.criteria.map((criterion) => (
                <li key={criterion.id}>{criterion.description}</li>
              ))}
            </ul>
          </section>

          <section
            aria-label="Save status"
            className="flex flex-wrap items-center gap-3 rounded-xl border border-current/15 p-4"
          >
            <p role="status" className="mr-auto text-sm">
              {online
                ? status
                : "Offline. Your draft stays in this tab; reconnect to save."}
            </p>
            <span className="text-xs">Saved revision {workspace.revision}</span>
            <Button variant="outline" onClick={download}>
              Download draft
            </Button>
            <Button onClick={() => void save()} disabled={conflict || !online}>
              Save now / Retry
            </Button>
            {conflict && (
              <div role="alert" className="w-full space-y-3">
                <p>
                  Another tab or session changed this workspace. Your draft is
                  preserved. Download it before loading the server version, then
                  reapply your changes.
                </p>
                <Button variant="outline" onClick={() => void reload()}>
                  Load server version
                </Button>
              </div>
            )}
          </section>

          <WorkspaceEditor
            workspaceId={workspace.id}
            files={files}
            savedFiles={workspace.files}
            onChange={setFiles}
            tutor={(activeFile, selection) => (
              <ExecutionPanel
                key={workspace.id}
                workspaceId={workspace.id}
                revision={workspace.revision}
                activeFile={activeFile}
                selection={selection}
              />
            )}
          />

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();

              void save();
            }}
            aria-busy={busy}
          >
            <label htmlFor="notes" className="text-xl font-semibold">
              Study notes
            </label>
            <textarea
              id="notes"
              className="auth-input"
              rows={6}
              maxLength={8000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={busy}
            />

            <div className="flex flex-wrap gap-3">
              <button
                className="auth-button"
                type="submit"
                disabled={busy || conflict || !online}
              >
                Save notes
              </button>
              <button
                className="rounded border px-5 py-3"
                type="button"
                disabled={busy || conflict || !online}
                onClick={() => void save(true)}
              >
                Save notes and record attempt
              </button>
            </div>

            <p className="text-sm">
              Recording an attempt preserves the saved files and criteria.
              Evaluation is not available yet; the next step stays locked.
            </p>
          </form>

          <section className="flex flex-col gap-3" aria-label="Attempt history">
            <h2 className="text-xl font-semibold">Attempt history</h2>

            {workspace.attempts.length === 0 && (
              <p>No attempts recorded yet.</p>
            )}

            {workspace.attempts.map((attempt) => (
              <details key={attempt.id} className="rounded border p-4">
                <summary className="cursor-pointer">
                  {attempt.stepId} · revision {attempt.revision} ·{" "}
                  {attempt.result.status === "not_evaluated"
                    ? "Not evaluated"
                    : attempt.result.status}
                </summary>

                <p className="my-3">{attempt.challenge.instructions}</p>

                <ul className="list-inside list-disc">
                  {attempt.challenge.criteria.map((criterion) => (
                    <li key={criterion.id}>{criterion.description}</li>
                  ))}
                </ul>

                {Object.entries(attempt.files).map(([path, content]) => (
                  <div key={path} className="mt-3">
                    <p className="font-mono text-sm">{path}</p>
                    <pre className="overflow-auto">
                      <code>{content}</code>
                    </pre>
                  </div>
                ))}
              </details>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
