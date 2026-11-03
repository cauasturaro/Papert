"use client";

import { useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { useTheme } from "@/components/theme/use-theme";
import { AnalysisPanel } from "./analysis/analysis-panel";
import { useAnalysis } from "./analysis/use-analysis";
import { ChallengePanel } from "./challenge/challenge-panel";
import { EditorArea, type EditorSelection } from "./editor/editor-area";
import { useOpenFiles } from "./editor/use-open-files";
import { useCollapsedPanels } from "./use-collapsed-panels";
import { ExplorerPanel } from "./explorer/explorer-panel";
import { SeymourPanel } from "./seymour/seymour-panel";
import { StudyLayout } from "./study-layout";
import { StudyNavbar } from "./study-navbar";
import type { Workspace } from "./study-api";
import type { useStudy } from "./use-study";

type StudyWorkspaceProps = {
  study: ReturnType<typeof useStudy>;
  workspace: Workspace;
};

/** The full-screen IDE for a started workspace. */
export function StudyWorkspace({ study, workspace }: StudyWorkspaceProps) {
  const { files, conflict, online } = study;
  const { resolved: theme } = useTheme();
  const openFiles = useOpenFiles(files);
  const panels = useCollapsedPanels();
  const [selection, setSelection] = useState<EditorSelection | null>(null);
  const analysis = useAnalysis({
    workspaceId: workspace.id,
    prepare: study.prepareAnalysis,
    onSettled: study.refresh,
  });

  const saveBlocked = conflict || !online;
  const active = openFiles.active;

  // Seymour only reads saved code, so a selection counts while the file is unchanged.
  const selectionIsSaved =
    !!active &&
    selection?.path === active &&
    files[active] === workspace.files[active];
  const tutorSelection = selectionIsSaved
    ? { start: selection.start, end: selection.end }
    : undefined;

  return (
    <>
      <StudyNavbar
        workspace={workspace}
        status={study.status}
        online={online}
        conflict={conflict}
        analyzing={analysis.busy || analysis.running}
        onDownload={study.download}
        onSave={() => void study.save()}
        onAnalyze={() => void analysis.analyze()}
      />

      <h1 className="sr-only">Your study space</h1>

      {conflict && (
        <Alert
          variant="destructive"
          size="sm"
          role="alert"
          className="rounded-none border-x-0 border-t-0"
        >
          <AlertTitle>Workspace changed elsewhere</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3 space-y-0">
            <p className="flex-1">
              Another tab or session changed this workspace. Your draft is
              preserved. Download it before loading the server version, then
              reapply your changes.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void study.reload()}
            >
              Load server version
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!online && (
        <p className="shrink-0 border-b border-border bg-muted px-4 py-1.5 text-sm">
          Offline. Your draft stays in this tab; reconnect to save.
        </p>
      )}

      {study.message && (
        <p
          role="status"
          aria-live="polite"
          className="shrink-0 border-b border-border bg-muted px-4 py-1.5 text-sm"
        >
          {study.message}
        </p>
      )}

      <StudyLayout
        challenge={
          <ChallengePanel
            workspace={workspace}
            notes={study.notes}
            onNotesChange={study.setNotes}
            onSave={(recordAttempt) => void study.save(recordAttempt)}
            busy={study.busy}
            saveBlocked={saveBlocked}
            onCollapse={() => panels.collapse("challenge")}
          />
        }
        explorer={
          <ExplorerPanel
            files={files}
            savedFiles={workspace.files}
            activePath={active}
            onFilesChange={study.setFiles}
            onOpenFile={openFiles.open}
            onPathMoved={openFiles.rename}
          />
        }
        editor={
          <EditorArea
            workspaceId={workspace.id}
            files={files}
            savedFiles={workspace.files}
            tabs={openFiles.tabs}
            active={active}
            theme={theme}
            onSelectTab={openFiles.open}
            onCloseTab={openFiles.close}
            onFilesChange={study.setFiles}
            onSelectionChange={setSelection}
          />
        }
        analysis={<AnalysisPanel analysis={analysis} />}
        seymour={
          <SeymourPanel
            workspaceId={workspace.id}
            revision={workspace.revision}
            activeFile={active ?? undefined}
            selection={tutorSelection}
            onCollapse={() => panels.collapse("seymour")}
          />
        }
        collapsed={panels.collapsed}
        onExpand={panels.expand}
      />
    </>
  );
}
