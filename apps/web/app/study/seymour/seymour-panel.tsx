"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownIcon, SparklesIcon } from "@/components/icons";
import { Button } from "@/components/ui/button/button";
import { Skeleton } from "@/components/ui/skeleton/skeleton";
import { announce } from "@/lib/a11y/announcer";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { MEMORY_KEY } from "../../memory/memory-keys";
import { proposalFor } from "../../memory/memory-state";
import { useMemory } from "../../memory/use-memory";
import { turnState } from "../execution/execution-state";
import { useAnswerFeedback } from "../feedback/use-answer-feedback";
import { CollapsePanelButton } from "../shell/side-panel-controls";
import { useReadySources } from "../sources/use-ready-sources";
import { useStableCallback } from "../use-stable-callback";
import { ChatTurn, type TurnHandlers } from "./chat-turn";
import { ConversationBar } from "./conversation-bar";
import { ConversationSummary } from "./conversation-summary";
import { MemoryDialog } from "./memory-dialog";
import { fileTargets, type MentionTarget } from "./mentions";
import { SeymourComposer } from "./seymour-composer";
import { SeymourEmptyState, type StepContext } from "./seymour-empty-state";
import { modeUnavailable, type SolutionProgress } from "./seymour-options";
import { useConversations } from "./use-conversations";
import { useSeymour, type CodeSelection, type Question } from "./use-seymour";
import { useTranscriptScroll } from "./use-transcript-scroll";

type SeymourPanelProps = {
  workspaceId: string;
  revision: number;
  activeFile?: string;
  selection?: CodeSelection;
  onCollapse: () => void;
  // Puts text in the composer without sending it; a new id applies it again.
  // `mode` switches the tutor mode when that mode is available.
  seededPrompt?: { id: number; text: string; mode?: string } | null;
  // Focuses the composer whenever the number changes.
  focusRequest?: number;
  unsavedChanges?: boolean;
  // Saves the editor; resolves false when saving failed.
  onSaveChanges?: () => Promise<boolean>;
  onInsertCode?: (code: string) => void;
  // Saved file paths, offered as @ mentions.
  workspaceFiles?: string[];
  onOpenLocation?: (path: string, line?: number) => void;
  solution?: SolutionProgress | null;
  roadmapCompleted?: boolean;
  step?: StepContext | null;
  // Reports whether Seymour is working on an answer, such as for a tab badge.
  onAnsweringChange?: (answering: boolean) => void;
};

export function SeymourPanel({
  onCollapse,
  seededPrompt,
  focusRequest,
  unsavedChanges,
  onSaveChanges,
  onInsertCode,
  workspaceFiles,
  onOpenLocation,
  solution,
  roadmapCompleted,
  step,
  onAnsweringChange,
  ...props
}: SeymourPanelProps) {
  const sources = useReadySources(props.workspaceId);
  const conversations = useConversations(props.workspaceId);
  const memory = useMemory();
  const queryClient = useQueryClient();
  const [memoryOpen, setMemoryOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const targets = useMemo<MentionTarget[]>(
    () => [
      ...sources.map((source) => ({
        id: source.id,
        filename: source.filename,
        kind: "source" as const,
      })),
      ...fileTargets(workspaceFiles ?? []),
    ],
    [sources, workspaceFiles],
  );

  const seymour = useSeymour({
    ...props,
    sources: targets,
    conversationId: conversations.currentId,
    onCreated: (execution) =>
      conversations.adopt(execution.conversationId ?? null),
  });

  const turns = useMemo(
    () => (seymour.execution ? [...seymour.history, seymour.execution] : []),
    [seymour.history, seymour.execution],
  );
  const transcriptLoading =
    conversations.currentId === undefined || seymour.loading;

  const answered = turns.flatMap((job) =>
    job.status === "completed" ? [job.id] : [],
  );
  const feedback = useAnswerFeedback(answered);
  const rateFeedback = useStableCallback(feedback.rate);
  const clearFeedback = useStableCallback(feedback.clear);
  const acceptMemory = useStableCallback(memory.accept);
  const updateMemory = useStableCallback(memory.update);
  const removeMemory = useStableCallback(memory.remove);
  const pendingMemoryId = memory.pendingId;
  const proposalActions = useMemo(() => ({
    pendingId: pendingMemoryId,
    accept: acceptMemory,
    update: updateMemory,
    remove: removeMemory,
  }), [pendingMemoryId, acceptMemory, updateMemory, removeMemory]);

  const focusComposer = useCallback((caretToEnd = false) => {
    // After React applies a new prompt value.
    requestAnimationFrame(() => {
      const field = textarea.current;

      if (!field) {
        return;
      }

      field.focus();

      if (caretToEnd) {
        field.setSelectionRange(field.value.length, field.value.length);
      }
    });
  }, []);

  const { setPrompt, setMode } = seymour;

  function fillComposer(text: string) {
    setPrompt(text);
    focusComposer(true);
  }

  const seedId = seededPrompt?.id;
  const seedText = seededPrompt?.text;
  const seedMode = seededPrompt?.mode;
  const seedModeBlocked = seedMode
    ? modeUnavailable(seedMode, { solution, roadmapCompleted }) !== null
    : true;

  // Each seed applies once; later eligibility changes must not overwrite the composer.
  const appliedSeedId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (seedId === undefined || seedText === undefined) {
      return;
    }

    if (seedId === appliedSeedId.current) {
      return;
    }

    appliedSeedId.current = seedId;
    setPrompt(seedText);

    if (seedMode && !seedModeBlocked) {
      setMode(seedMode);
    }

    focusComposer(true);
  }, [
    seedId,
    seedText,
    seedMode,
    seedModeBlocked,
    setPrompt,
    setMode,
    focusComposer,
  ]);

  // The value at mount is not a request; focusing then would steal focus from the editor.
  const mountedFocusRequest = useRef(focusRequest);

  useEffect(() => {
    if (
      focusRequest === undefined ||
      focusRequest === mountedFocusRequest.current
    ) {
      return;
    }

    mountedFocusRequest.current = undefined;
    focusComposer();
  }, [focusRequest, focusComposer]);

  const { scroller, unseen, scrollToEnd, loadEarlier, trackScroll } = useTranscriptScroll(seymour);
  const latest = seymour.execution;

  // One polite announcement per finished answer, never the answer text itself.
  const followedId = useRef<string | null>(null);
  const latestState = latest ? turnState(latest) : null;

  useEffect(() => {
    if (!latest || latestState === null) {
      return;
    }

    if (latestState === "working") {
      followedId.current = latest.id;

      return;
    }

    if (followedId.current !== latest.id) {
      return;
    }

    followedId.current = null;

    if (latestState === "answered") {
      announce("Seymour answered");
    } else if (latestState === "failed") {
      announce("Seymour couldn't answer");
    } else {
      announce("Answer stopped");
    }
  }, [latest, latestState]);

  // A finished answer may have added a suggestion, a summary or a new title.
  const completedId = latestState === "answered" ? latest?.id : null;

  useEffect(() => {
    if (completedId) {
      void queryClient.invalidateQueries({ queryKey: [MEMORY_KEY] });
    }
  }, [completedId, queryClient]);

  const unavailable = useCallback(
    (mode: string) => modeUnavailable(mode, { solution, roadmapCompleted }),
    [solution, roadmapCompleted],
  );

  const ask = useStableCallback((question: Question) => {
    scrollToEnd();
    void seymour.send(question);
  });
  const edit = useStableCallback(fillComposer);
  const openMemory = useStableCallback(() => setMemoryOpen(true));
  const insertCode = useStableCallback((code: string) => onInsertCode?.(code));
  const openLocation = useStableCallback((path: string) => onOpenLocation?.(path));
  const hasInsert = !!onInsertCode;
  const hasOpen = !!onOpenLocation;

  const handlers = useMemo<TurnHandlers>(() => ({
    ask,
    edit,
    followUp: edit,
    openMemory,
    modeUnavailable: unavailable,
    insertCode: hasInsert ? insertCode : undefined,
    openLocation: hasOpen ? openLocation : undefined,
  }), [ask, edit, openMemory, unavailable, hasInsert, insertCode, hasOpen, openLocation]);

  function stopOnEscape(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || event.defaultPrevented || !seymour.running) {
      return;
    }

    // Escape inside a dialog closes the dialog, not the answer.
    if ((event.target as HTMLElement).closest("dialog")) {
      return;
    }

    event.preventDefault();
    void seymour.cancel();
  }

  const answering = seymour.running || seymour.sending;

  useEffect(() => {
    onAnsweringChange?.(answering);
  }, [answering, onAnsweringChange]);

  const canAsk = !seymour.running && !seymour.sending && !seymour.blocked;
  const activeMemories = (memory.items.data ?? []).filter(
    (item) => item.status === "active",
  ).length;

  return (
    <section
      aria-label="Seymour"
      className="flex h-full min-h-0 flex-col bg-card"
      onKeyDown={stopOnEscape}
    >
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <SparklesIcon className="size-4 text-ring" />
        <h2 className="text-sm font-semibold">Seymour</h2>
        <span className="ml-auto" />
        <CollapsePanelButton
          side="right"
          label="Seymour panel"
          onCollapse={onCollapse}
        />
      </header>

      <ConversationBar
        conversations={conversations}
        onOpenMemory={() => setMemoryOpen(true)}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          role="log"
          aria-live="off"
          aria-label="Conversation with Seymour"
          className="h-full space-y-4 overflow-auto p-3 text-sm"
          onScroll={trackScroll}
        >
          {conversations.error && (
            <p className="text-xs text-destructive">
              {toLearnerMessage(conversations.error)}{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={conversations.refresh}
              >
                Try again
              </Button>
            </p>
          )}

          <ConversationSummary conversation={conversations.current} />

          {seymour.hasEarlier && !transcriptLoading && (
            <div className="flex justify-center">
              <Button
                size="sm"
                variant="outline"
                loading={seymour.loadingEarlier}
                onClick={() => void loadEarlier()}
              >
                Load earlier messages
              </Button>
            </div>
          )}

          {transcriptLoading && (
            <div
              aria-busy="true"
              aria-label="Loading conversation"
              className="space-y-3"
            >
              <Skeleton className="ml-8 h-10" />
              <Skeleton className="mr-4 h-20" />
            </div>
          )}

          {!transcriptLoading && turns.length === 0 && (
            <SeymourEmptyState
              step={step}
              activeFile={props.activeFile}
              selection={seymour.selection}
              fileCount={workspaceFiles?.length}
              sources={sources.map((source) => source.filename)}
              memories={activeMemories}
              onSuggest={fillComposer}
            />
          )}

          {!transcriptLoading && turns.length > 0 && (
            <ol className="space-y-4">
              {turns.map((job) => (
                <ChatTurn
                  key={job.id}
                  execution={job}
                  proposal={proposalFor(memory.items.data, job.id)}
                  memory={proposalActions}
                  feedback={feedback.feedbackFor(job.id)}
                  pendingFeedback={feedback.pendingFor(job.id)}
                  clearingFeedback={feedback.clearingFor(job.id)}
                  feedbackError={feedback.errorFor(job.id)}
                  onRate={rateFeedback}
                  onClear={clearFeedback}
                  canAsk={canAsk}
                  handlers={handlers}
                />
              ))}
            </ol>
          )}
        </div>

        {unseen && (
          <Button
            size="sm"
            variant="outline"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card shadow-md"
            onClick={scrollToEnd}
          >
            <ArrowDownIcon />
            Jump to latest
          </Button>
        )}
      </div>

      {seymour.running && seymour.connection === "lost" && (
        <p className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
          Live updates paused.
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={seymour.reconnect}
          >
            Reconnect
          </Button>
        </p>
      )}

      <SeymourComposer
        seymour={seymour}
        textarea={textarea}
        activeFile={props.activeFile}
        targets={targets}
        hasSources={sources.length > 0}
        unsavedChanges={unsavedChanges}
        onSaveChanges={onSaveChanges}
        solution={solution}
        roadmapCompleted={roadmapCompleted}
      />

      <MemoryDialog open={memoryOpen} onOpenChange={setMemoryOpen} />
    </section>
  );
}
