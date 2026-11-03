import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  studyRequest,
  StudyRequestError,
  type Roadmap,
  type Workspace,
} from "./study-api";
import { sameFiles, validateTree, type Files } from "./workspace-tree";

type Draft = { files: Files; notes: string };
type Recovery = Draft & { revision: number };

export function useStudy() {
  const queryClient = useQueryClient();
  const roadmapQuery = useQuery({
    queryKey: ["study", "fixture"],
    queryFn: () => studyRequest<Roadmap>("roadmaps/fixture"),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [draft, setDraft] = useState<Draft>({ files: {}, notes: "" });
  const [status, setStatus] = useState("All changes saved.");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [online, setOnline] = useState(true);
  const current = useRef({ workspace, draft, conflict });
  const pending = useRef<Promise<Workspace | null> | null>(null);
  const mounted = useRef(true);
  current.current = { workspace, draft, conflict };

  const dirty =
    workspace !== null &&
    (!sameFiles(draft.files, workspace.files) ||
      draft.notes !== workspace.notes);
  const key = (id: string) => `papert:workspace:${id}`;

  useEffect(() => {
    mounted.current = true;

    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    return () => {
      mounted.current = false;
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function remember(next: Draft, saved: Workspace) {
    try {
      const recovery: Recovery = { ...next, revision: saved.revision };
      sessionStorage.setItem(key(saved.id), JSON.stringify(recovery));
    } catch {
      setMessage(
        "Browser recovery storage is unavailable. Keep this tab open or download your draft.",
      );
    }
  }

  function updateDraft(next: Draft) {
    const saved = current.current.workspace;
    current.current.draft = next;

    setDraft(next);
    setStatus("Unsaved changes.");
    setMessage("");

    if (saved) {
      remember(next, saved);
    }
  }

  const startMutation = useMutation({
    mutationFn: async () => {
      const roadmap = roadmapQuery.data;
      if (!roadmap) {
        throw new Error("Load the roadmap before starting.");
      }

      return studyRequest<Workspace>(
        `roadmaps/${roadmap.id}/start`,
        "POST",
        {},
      );
    },
    onSuccess: (saved) => {
      let recovered: Recovery | null = null;

      try {
        const stored = sessionStorage.getItem(key(saved.id));
        if (stored) {
          const value: Recovery = JSON.parse(stored);
          if (
            !value.files ||
            typeof value.files !== "object" ||
            Array.isArray(value.files) ||
            !Object.values(value.files).every(
              (content) => typeof content === "string",
            ) ||
            typeof value.notes !== "string" ||
            value.notes.length > 8000 ||
            !Number.isInteger(value.revision) ||
            value.revision < 0
          ) {
            throw new Error("Invalid recovery data.");
          }

          recovered = value;
        }
      } catch {
        setMessage(
          "Could not read the browser draft. Download any open draft before closing this tab.",
        );
      }

      const next: Draft = {
        files: recovered?.files ?? saved.files,
        notes: recovered?.notes ?? saved.notes,
      };
      const differs =
        !sameFiles(next.files, saved.files) || next.notes !== saved.notes;
      const hasConflict =
        !!recovered && differs && recovered.revision !== saved.revision;

      current.current = {
        workspace: saved,
        draft: next,
        conflict: hasConflict,
      };

      setWorkspace(saved);
      setDraft(next);
      setConflict(hasConflict);
      setStatus(differs ? "Recovered unsaved draft." : "All changes saved.");
      queryClient.setQueryData(["study", saved.id], saved);
    },
    onError: (error) => setMessage(error.message),
  });

  async function flush(): Promise<Workspace | null> {
    if (pending.current) {
      try {
        await pending.current;
      } catch {
        return null;
      }

      return flush();
    }

    const {
      workspace: saved,
      draft: next,
      conflict: blocked,
    } = current.current;
    if (!saved || blocked) {
      return null;
    }

    if (sameFiles(next.files, saved.files) && next.notes === saved.notes) {
      return saved;
    }

    try {
      validateTree(next.files);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid files.");
      return null;
    }

    setStatus("Saving changes…");

    const operation = studyRequest<Workspace>(`workspaces/${saved.id}`, "PUT", {
      revision: saved.revision,
      files: next.files,
      notes: next.notes,
    });
    pending.current = operation;

    try {
      const result = await operation;
      if (!mounted.current) {
        return result;
      }

      // Only advance the saved revision; typing during the request stays in the draft.
      current.current.workspace = result;
      setWorkspace(result);
      queryClient.setQueryData(["study", result.id], result);
      setStatus("All changes saved.");
      setMessage("");

      remember(current.current.draft, result);

      return result;
    } catch (error) {
      if (mounted.current) {
        if (error instanceof StudyRequestError && error.status === 409) {
          current.current.conflict = true;
          setConflict(true);
        }

        setStatus("Changes not saved.");
        setMessage(
          error instanceof Error
            ? error.message
            : "Save failed. Your draft is still here.",
        );
      }

      return null;
    } finally {
      pending.current = null;
    }
  }

  // A failed save pauses automatic retries until another edit, reconnection or explicit retry.
  useEffect(() => {
    if (!dirty || conflict || !online) {
      return;
    }

    const timer = window.setTimeout(() => void flush(), 700);

    return () => window.clearTimeout(timer);
    // flush reads current refs; only new draft/revision/connection changes schedule a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, workspace, conflict, online, dirty]);

  async function reload() {
    const saved = current.current.workspace;
    if (
      !saved ||
      !window.confirm(
        "Replace this draft with the server version? Download your draft first to keep a copy.",
      )
    ) {
      return;
    }

    const draftBeforeReload = current.current.draft;

    try {
      const result = await queryClient.fetchQuery({
        queryKey: ["study", saved.id],
        queryFn: () => studyRequest<Workspace>(`workspaces/${saved.id}`),
        staleTime: 0,
      });
      if (current.current.draft !== draftBeforeReload) {
        setMessage(
          "Reload cancelled because you edited the draft. Download it before loading the server version.",
        );
        return;
      }

      const next = { files: result.files, notes: result.notes };
      current.current = { workspace: result, draft: next, conflict: false };

      setWorkspace(result);
      setDraft(next);
      setConflict(false);
      setMessage("");
      setStatus("Server version loaded.");

      remember(next, result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to reload.");
    }
  }

  async function save(recordAttempt = false) {
    setMessage("");

    const saved = await flush();
    if (!saved || !recordAttempt) {
      return;
    }

    try {
      // The attempt belongs to the acknowledged revision, never to unsaved editor text.
      await studyRequest(`workspaces/${saved.id}/attempts`, "POST", {
        revision: saved.revision,
        stepId: saved.roadmap.definition.steps[saved.currentStep].id,
      });
      const updated = await studyRequest<Workspace>(`workspaces/${saved.id}`);
      if (current.current.workspace?.revision === updated.revision) {
        current.current.workspace = updated;
        setWorkspace(updated);
      }

      setMessage("Attempt saved. Use Analyze to evaluate it.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to record the attempt.",
      );
    }
  }

  // Analysis always targets an acknowledged revision, never unsaved editor text.
  async function prepareAnalysis() {
    setMessage("");

    const saved = await flush();

    return saved ? saved.revision : null;
  }

  // Results and progression change attempts and the current step, not the saved revision.
  async function refresh() {
    const saved = current.current.workspace;
    if (!saved) {
      return;
    }

    try {
      const result = await studyRequest<Workspace>(`workspaces/${saved.id}`);

      if (current.current.workspace?.revision === result.revision) {
        current.current.workspace = result;
        setWorkspace(result);
        queryClient.setQueryData(["study", result.id], result);
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to refresh results.",
      );
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(current.current.draft, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "papert-workspace.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const signedOut = [roadmapQuery.error, startMutation.error].some(
    (error) => error instanceof StudyRequestError && error.status === 401,
  );

  return {
    roadmap: roadmapQuery.data,
    workspace,
    files: draft.files,
    notes: draft.notes,
    setFiles: (files: Files) =>
      updateDraft({ ...current.current.draft, files }),
    setNotes: (notes: string) =>
      updateDraft({ ...current.current.draft, notes }),
    busy: roadmapQuery.isPending || startMutation.isPending,
    message: message || roadmapQuery.error?.message || "",
    status:
      dirty && status === "All changes saved." ? "Unsaved changes." : status,
    conflict,
    online,
    dirty,
    signedOut,
    start: () => startMutation.mutate(),
    retryLoad: () => void roadmapQuery.refetch(),
    save,
    reload,
    download,
    prepareAnalysis,
    refresh,
  };
}
