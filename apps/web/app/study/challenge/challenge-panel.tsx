"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs/tabs";
import { CollapsePanelButton } from "../side-panel-controls";
import type { Workspace } from "../study-api";
import { AttemptHistory } from "./attempt-history";
import { StepOverview } from "./step-overview";
import { StudyNotes } from "./study-notes";

type ChallengePanelProps = {
  workspace: Workspace;
  notes: string;
  onNotesChange: (notes: string) => void;
  onSave: (recordAttempt?: boolean) => void;
  busy: boolean;
  saveBlocked: boolean;
  onCollapse: () => void;
};

export function ChallengePanel({
  workspace,
  notes,
  onNotesChange,
  onSave,
  busy,
  saveBlocked,
  onCollapse,
}: ChallengePanelProps) {
  const attempts = workspace.attempts.length;

  return (
    <Tabs
      defaultValue="challenge"
      className="flex h-full min-h-0 flex-col space-y-0 bg-card"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-2">
        <TabsList className="bg-transparent p-0">
          <TabsTrigger size="sm" value="challenge" className="h-7">
            Challenge
          </TabsTrigger>
          <TabsTrigger size="sm" value="history" className="h-7">
            History{attempts > 0 ? ` (${attempts})` : ""}
          </TabsTrigger>
          <TabsTrigger size="sm" value="notes" className="h-7">
            Notes
          </TabsTrigger>
        </TabsList>

        <div className="ml-auto">
          <CollapsePanelButton
            side="left"
            label="challenge panel"
            onCollapse={onCollapse}
          />
        </div>
      </div>

      <TabsContent
        value="challenge"
        className="min-h-0 flex-1 overflow-auto p-4"
      >
        <StepOverview workspace={workspace} />
      </TabsContent>

      <TabsContent
        value="history"
        className="min-h-0 flex-1 overflow-auto px-4"
      >
        <AttemptHistory workspace={workspace} />
      </TabsContent>

      <TabsContent value="notes" className="min-h-0 flex-1 overflow-auto p-4">
        <StudyNotes
          notes={notes}
          onNotesChange={onNotesChange}
          onSave={onSave}
          busy={busy}
          saveBlocked={saveBlocked}
        />
      </TabsContent>
    </Tabs>
  );
}
