"use client";

import { flushSync } from "react-dom";
import { memo, useEffect, useMemo, useState } from "react";
import { SkipLink } from "@/components/ui/skip-link/skip-link";
import { useTheme } from "@/components/theme/use-theme";
import { AnalysisPanel } from "../analysis/analysis-panel";
import { useAnalysis } from "../analysis/use-analysis";
import { ChallengePanel } from "../challenge/challenge-panel";
import {
  EDITOR_REGION_ID,
  EditorArea,
  type CodeRange,
} from "../editor/editor-area";
import { createEditorController } from "../editor/editor-controller";
import { useEditorSettings } from "../editor/editor-settings";
import { useOpenFiles } from "../editor/use-open-files";
import { ExplorerPanel } from "../explorer/explorer-panel";
import { SeymourPanel } from "../seymour/seymour-panel";
import type { StepContext } from "../seymour/seymour-empty-state";
import { SourcesPanel } from "../sources/sources-panel";
import { StudyLayout, type MobilePanel } from "../shell/study-layout";
import { StudyNavbar } from "../shell/study-navbar";
import { useCollapsedPanels } from "../shell/use-collapsed-panels";
import { WorkspaceResources } from "./workspace-resources";
import { SourceViewerProvider } from "../viewer/source-viewer-context";
import { WorkspaceCommandsProvider } from "./workspace-commands-context";
import { useStableCallback } from "../use-stable-callback";
import { useWorkspaceActions } from "./use-workspace-actions";
import { useWorkspaceSession } from "./use-workspace-session";
import { WorkspaceDialogs } from "./workspace-dialogs";
import { WorkspaceBanners } from "./workspace-banners";
import {
  useWorkspaceShortcuts,
} from "./workspace-shortcuts";
import type { Workspace } from "../study-api";

// Typing re-renders the IDE; these panels only change with their own inputs.
const MemoChallengePanel = memo(ChallengePanel);
const MemoSeymourPanel = memo(SeymourPanel);
const MemoSourcesPanel = memo(SourcesPanel);

type StudyWorkspaceProps = {
  workspace: Workspace;
  // From the address: ?file= and ?step=.
  initialFile: string | null;
  initialStepId: string | null;
};

type Selection = { path: string; range: CodeRange };

const mobilePanelKey = (workspaceId: string) =>
  `papert:study-mobile-panel:${workspaceId}`;

const mobilePanelValues: MobilePanel[] = [
  "challenge",
  "editor",
  "analysis",
  "seymour",
  "files",
];

// A step never attempted starts on its challenge; otherwise the last panel is restored.
function initialMobilePanel(workspace: Workspace): MobilePanel {
  const step = workspace.roadmap.definition.steps[workspace.currentStep];
  const attempted = workspace.attempts.some(
    (attempt) => attempt.stepId === step?.id,
  );

  if (!attempted) {
    return "challenge";
  }

  try {
    const stored = localStorage.getItem(mobilePanelKey(workspace.id));

    return mobilePanelValues.find((value) => value === stored) ?? "editor";
  } catch {
    return "editor";
  }
}

/** The full-screen IDE for a started workspace. */
export function StudyWorkspace({
  workspace: initialWorkspace,
  initialFile,
  initialStepId,
}: StudyWorkspaceProps) {
  const session = useWorkspaceSession(initialWorkspace);
  const { workspace, files } = session;
  const { resolved: theme } = useTheme();
  const editorSettings = useEditorSettings();
  const [controller] = useState(createEditorController);
  const openFiles = useOpenFiles(files, workspace.id, initialFile);
  const panels = useCollapsedPanels();
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(() =>
    initialMobilePanel(initialWorkspace),
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [seymourAnswering, setSeymourAnswering] = useState(false);

  const analysis = useAnalysis({
    workspaceId: workspace.id,
    prepare: session.prepareAnalysis,
    onSettled: session.refresh,
  });

  useEffect(() => {
    try {
      localStorage.setItem(mobilePanelKey(workspace.id), mobilePanel);
    } catch {
      // The panel choice still applies to this page view.
    }
  }, [workspace.id, mobilePanel]);

  const showPanel = useStableCallback((panel: MobilePanel) => {
    setMobilePanel(panel);
  });

  const actions = useWorkspaceActions({
    session,
    openFiles,
    controller,
    panels,
    showPanel,
    initialStepId,
  });

  const saveBlocked = session.conflict || !session.online;
  const analyzing = analysis.busy || analysis.running;
  const active = openFiles.active;
  const steps = workspace.roadmap.definition.steps;
  const roadmapCompleted = workspace.currentStep >= steps.length;
  const viewedStep =
    steps.find((step) => step.id === actions.viewedStepId) ??
    steps[workspace.currentStep];

  // Seymour answers about the current step, or the last one once the roadmap is complete.
  const tutorStep = steps[Math.min(workspace.currentStep, steps.length - 1)];

  const tutorStepContext = useMemo<StepContext | null>(() => {
    if (!tutorStep) {
      return null;
    }

    const criteria = tutorStep.challenge.criteria.map(
      (criterion) => criterion.description,
    );

    return { title: tutorStep.title, criteria };
  }, [tutorStep]);

  // A new analysis result is flagged on the phone tab until the learner opens it.
  const execution = analysis.execution;
  const resultKey =
    execution && !analysis.running
      ? `${execution.id}:${execution.status}`
      : null;
  const [seenResult, setSeenResult] = useState(resultKey);

  if (mobilePanel === "analysis" && seenResult !== resultKey) {
    setSeenResult(resultKey);
  }

  const badges: Partial<Record<MobilePanel, string>> = {};

  if (session.dirty) {
    badges.editor = "unsaved changes";
  }

  if (resultKey !== null && resultKey !== seenResult) {
    badges.analysis = "new result";
  }

  if (seymourAnswering) {
    badges.seymour = "answering";
  }

  // Seymour only reads saved code, so a selection counts while the file is unchanged.
  const selectionIsSaved =
    !!active &&
    selection?.path === active &&
    files[active] === workspace.files[active];
  const selectionRange = selectionIsSaved ? selection.range : null;

  const tutorSelection = useMemo(() => {
    if (!selectionRange) {
      return undefined;
    }

    return {
      start: selectionRange.start,
      end: selectionRange.end,
      startLine: selectionRange.startLine,
      endLine: selectionRange.endLine,
    };
  }, [selectionRange]);

  const analyze = useStableCallback(() => {
    if (saveBlocked || !analysis.canAnalyze) {
      return;
    }

    void analysis.analyze();
  });

  const save = useStableCallback(() => {
    void session.save();
  });

  const changeFile = useStableCallback((path: string, content: string) => {
    session.setFiles({ ...files, [path]: content });
  });

  const changeSelection = useStableCallback(
    (path: string, range: CodeRange | null) => {
      setSelection(range ? { path, range } : null);
    },
  );

  const askAboutCode = useStableCallback(
    (path: string, range: CodeRange | null) => {
      let prompt = `Can you help me with ${path}?`;

      if (range && range.startLine === range.endLine) {
        prompt = `Can you help me with line ${range.startLine} of ${path}?`;
      } else if (range) {
        prompt = `Can you help me with lines ${range.startLine}–${range.endLine} of ${path}?`;
      }

      actions.askSeymour(prompt);
    },
  );

  const openFromExplorer = useStableCallback((path: string) => {
    openFiles.open(path);

    // On phones the file opens where it can be edited.
    setMobilePanel("editor");
  });

  const followMove = useStableCallback((from: string, to: string) => {
    openFiles.rename(from, to);
  });

  const setFiles = useStableCallback(session.setFiles);
  const setNotes = useStableCallback(session.setNotes);
  const collapseChallenge = useStableCallback(() =>
    panels.collapse("challenge"),
  );
  const collapseSeymour = useStableCallback(() => panels.collapse("seymour"));
  const collapseExplorer = useStableCallback(() => panels.collapse("explorer"));
  const updateSettings = useStableCallback(editorSettings.update);
  const showShortcuts = useStableCallback(() => setShortcutsOpen(true));

  useWorkspaceShortcuts(
    {
      saveAll: () => void actions.saveAllChanges(),
      analyze,
      toggleExplorer: () => panels.toggle("explorer"),
      toggleSeymour: () => panels.toggle("seymour"),
      focusChat: actions.focusChat,
      selectTab: (index) => {
        const path = openFiles.tabs[index];

        if (path) {
          openFiles.open(path);
          setMobilePanel("editor");
        }
      },
      closeTab: () => {
        if (active) {
          openFiles.close(active);
        }
      },
      showShortcuts,
    },
    !shortcutsOpen && !conflictOpen,
  );

  return (
    <SourceViewerProvider workspaceId={workspace.id}>
      <WorkspaceCommandsProvider
        value={{
          onOpenLocation: actions.openLocation,
          onAskSeymour: actions.askSeymour,
          onRestoreFiles: actions.restoreFiles,
        }}
      >
        <SkipLink
          targetId={EDITOR_REGION_ID}
          onClick={() => flushSync(() => setMobilePanel("editor"))}
        >
          Skip to editor
        </SkipLink>

        <StudyNavbar
          workspace={workspace}
          step={viewedStep}
          saveState={session.saveState}
          savedAt={session.savedAt}
          failure={session.failure}
          saveBlocked={saveBlocked}
          analyzing={analyzing}
          canAnalyze={analysis.canAnalyze}
          roadmapCompleted={roadmapCompleted}
          onDownload={session.download}
          onSave={save}
          onAnalyze={analyze}
        />

        <WorkspaceBanners
          session={session}
          onResolveConflict={() => setConflictOpen(true)}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          <h1 className="sr-only">
            {workspace.roadmap.definition.title}
            {viewedStep ? `: ${viewedStep.title}` : ""}
          </h1>

          <StudyLayout
            challenge={
              <MemoChallengePanel
                workspace={workspace}
                notes={session.notes}
                onNotesChange={setNotes}
                onSave={save}
                busy={false}
                saveBlocked={saveBlocked}
                onCollapse={collapseChallenge}
                onSelectStep={actions.selectStep}
                viewedStepId={actions.viewedStepId}
              />
            }
            explorer={
              <WorkspaceResources
                onCollapse={collapseExplorer}
                files={
                  <ExplorerPanel
                    files={files}
                    savedFiles={workspace.files}
                    activePath={active}
                    onFilesChange={setFiles}
                    onOpenFile={openFromExplorer}
                    onPathMoved={followMove}
                  />
                }
                sources={<MemoSourcesPanel workspaceId={workspace.id} />}
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
                controller={controller}
                settings={editorSettings.settings}
                onSettingsChange={updateSettings}
                focusMode={panels.focusMode}
                onToggleFocusMode={panels.toggleFocusMode}
                onShowShortcuts={showShortcuts}
                onSelectTab={openFiles.open}
                onCloseTab={openFiles.close}
                onFileChange={changeFile}
                onSelectionChange={changeSelection}
                onAskSeymour={askAboutCode}
                onSave={save}
              />
            }
            analysis={
              <AnalysisPanel
                analysis={analysis}
                workspace={workspace}
                hasUnsavedChanges={actions.hasUnsavedChanges}
                onSaveChanges={actions.saveAllChanges}
                onOpenLocation={actions.openLocation}
                onAskSeymour={actions.askSeymour}
                onSelectStep={actions.selectStep}
              />
            }
            seymour={
              <MemoSeymourPanel
                workspaceId={workspace.id}
                revision={workspace.revision}
                activeFile={active ?? undefined}
                selection={tutorSelection}
                onCollapse={collapseSeymour}
                seededPrompt={actions.seededPrompt}
                focusRequest={actions.chatFocusRequest}
                unsavedChanges={actions.hasUnsavedChanges}
                onSaveChanges={actions.saveAllChanges}
                onInsertCode={actions.insertAtCursor}
                workspaceFiles={actions.workspaceFilePaths}
                onOpenLocation={actions.openLocation}
                solution={workspace.solution ?? null}
                roadmapCompleted={roadmapCompleted}
                step={tutorStepContext}
                onAnsweringChange={setSeymourAnswering}
              />
            }
            collapsed={panels.collapsed}
            onExpand={panels.expand}
            mobilePanel={mobilePanel}
            onMobilePanelChange={setMobilePanel}
            badges={badges}
          />
        </main>

        <WorkspaceDialogs
          session={session}
          actions={actions}
          shortcutsOpen={shortcutsOpen}
          setShortcutsOpen={setShortcutsOpen}
          conflictOpen={conflictOpen}
          setConflictOpen={setConflictOpen}
        />
      </WorkspaceCommandsProvider>
    </SourceViewerProvider>
  );
}
