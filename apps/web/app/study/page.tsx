"use client";

import Link from "next/link";
import { useStudy } from "./use-study";

export default function Study() {
  const { roadmap, workspace, notes, setNotes, busy, message, start, save } =
    useStudy();

  const step = workspace?.roadmap.definition.steps[workspace.currentStep];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16">
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

          <section className="flex flex-col gap-3" aria-label="Workspace files">
            <h2 className="text-xl font-semibold">Saved files</h2>

            {Object.entries(workspace.files).map(([path, content]) => (
              <div key={path}>
                <h3 className="font-mono text-sm">{path}</h3>
                <pre className="overflow-auto rounded border p-4">
                  <code>{content}</code>
                </pre>
              </div>
            ))}
          </section>

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
              <button className="auth-button" type="submit" disabled={busy}>
                Save notes
              </button>
              <button
                className="rounded border px-5 py-3"
                type="button"
                disabled={busy}
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
