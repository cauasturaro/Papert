import { Card } from "@/components/ui/card/card";
import { MemoryExplainer } from "./memory-explainer";
import { MemoryManager } from "./memory-manager";

export function MemoryView() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">What Seymour remembers</h1>
        <p className="text-sm text-muted-foreground">
          Review what Seymour keeps about how you learn. Editing or deleting a
          memory changes the next answers.
        </p>
      </div>

      <MemoryExplainer />

      <Card className="p-4 sm:p-6">
        <MemoryManager />
      </Card>
    </div>
  );
}
