import { BookIcon, HistoryIcon, MemoryIcon } from "@/components/icons";

const KINDS = [
  {
    icon: HistoryIcon,
    title: "Conversation history",
    text: "Each study workspace keeps its conversations with Seymour. Long ones are summarized for Seymour. Start a new conversation from the tutor panel at any time.",
  },
  {
    icon: MemoryIcon,
    title: "Durable memory",
    text: "Preferences and difficulties on this page. Seymour uses them in every new conversation, in all your roadmaps, never to grade or unlock steps.",
  },
  {
    icon: BookIcon,
    title: "Sources",
    text: "Documents you upload to a workspace. Seymour cites them in that workspace only. Manage them in the study Sources tab.",
  },
];

/** The three things Seymour can draw on, and where each one is managed. */
export function MemoryExplainer() {
  return (
    <ul aria-label="What Seymour uses" className="grid gap-3 md:grid-cols-3">
      {KINDS.map((kind) => (
        <li
          key={kind.title}
          className="space-y-1.5 rounded-lg border border-border bg-card p-3"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <kind.icon className="size-4 text-ring" />
            {kind.title}
          </p>
          <p className="text-xs text-muted-foreground">{kind.text}</p>
        </li>
      ))}
    </ul>
  );
}
