"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs/tabs";
import {
  WorkspaceCommandsProvider,
  useWorkspaceCommands,
} from "../workspace/workspace-commands-context";
import type { AskSeymour, OpenLocation } from "../attempt/feedback-actions";
import { CollapsePanelButton } from "../shell/side-panel-controls";
import { RECENT_ATTEMPT_LIMIT, type Workspace } from "../study-api";
import { AttemptHistory } from "./attempt-history";
import { StepOverview } from "./step-overview";
import { StudyNotes } from "./study-notes";

export type ChallengePanelProps = {
  workspace: Workspace;
  notes: string;
  onNotesChange: (notes: string) => void;
  onSave?: () => void;
  busy: boolean;
  saveBlocked: boolean;
  onCollapse: () => void;
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
  // `null` selects the current step.
  onSelectStep?: (stepId: string | null) => void;
  // A completed step shown read-only; null or absent shows the current step.
  viewedStepId?: string | null;
  onRestoreFiles?: (files: Record<string, string>) => void;
};

export function ChallengePanel({
  workspace,
  notes,
  onNotesChange,
  onSave,
  busy,
  saveBlocked,
  onCollapse,
  onOpenLocation,
  onAskSeymour,
  onSelectStep,
  viewedStepId,
  onRestoreFiles,
}: ChallengePanelProps) {
  const commands = useWorkspaceCommands();
  const attempts = workspace.attempts.length;
  // Workspace reads include recent attempts and the latest per step; history may hold more.
  const attemptCount =
    attempts >= RECENT_ATTEMPT_LIMIT
      ? `${RECENT_ATTEMPT_LIMIT}+`
      : `${attempts}`;

  return (
    <WorkspaceCommandsProvider
      value={{ onOpenLocation, onAskSeymour, onRestoreFiles }}
    >
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
              History{attempts > 0 ? ` (${attemptCount})` : ""}
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
          <StepOverview
            workspace={workspace}
            viewedStepId={viewedStepId}
            onSelectStep={onSelectStep}
            onOpenLocation={onOpenLocation ?? commands.onOpenLocation}
            onAskSeymour={onAskSeymour ?? commands.onAskSeymour}
          />
        </TabsContent>

        <TabsContent
          value="history"
          className="min-h-0 flex-1 overflow-auto px-4"
        >
          <AttemptHistory workspace={workspace} />
        </TabsContent>

        <TabsContent value="notes" className="min-h-0 flex-1 p-4">
          <StudyNotes
            notes={notes}
            onNotesChange={onNotesChange}
            onSave={onSave}
            busy={busy}
            saveBlocked={saveBlocked}
          />
        </TabsContent>
      </Tabs>
    </WorkspaceCommandsProvider>
  );
}
