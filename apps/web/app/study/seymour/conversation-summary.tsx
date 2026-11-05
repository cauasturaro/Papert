import type { Conversation } from "../../memory/memory-api";

/** Folded messages are no longer sent verbatim; the learner can read what Seymour kept. */
export function ConversationSummary({
  conversation,
}: {
  conversation: Conversation | null;
}) {
  const summary = conversation?.summary;

  if (!summary) {
    return null;
  }

  const groups = [
    { label: "Covered", items: summary.covered },
    { label: "Still to do", items: summary.pending },
    { label: "Harder parts", items: summary.struggles },
  ].filter((group) => group.items.length > 0);

  return (
    <details className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none">
        Earlier messages are summarized for Seymour
      </summary>

      <div className="mt-2 space-y-2">
        <p>
          Seymour now reads this summary instead of the oldest messages. Your
          current step always comes from your roadmap progress.
        </p>

        {groups.map((group) => (
          <div key={group.label}>
            <p className="font-medium text-foreground">{group.label}</p>
            <ul className="list-disc pl-4">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
