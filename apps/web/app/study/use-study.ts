import { useEffect, useState } from "react";

type Challenge = {
  instructions: string;
  criteria: { id: string; description: string }[];
};

type Roadmap = {
  id: string;
  authorName: string;
  definition: {
    title: string;
    description: string;
    steps: {
      id: string;
      title: string;
      content: string;
      challenge: Challenge;
    }[];
  };
};

type Workspace = {
  id: string;
  roadmap: Roadmap;
  currentStep: number;
  revision: number;
  notes: string;
  files: Record<string, string>;
  session: { id: string };
  attempts: {
    id: string;
    stepId: string;
    revision: number;
    files: Record<string, string>;
    challenge: Challenge;
    result: { status: string };
    createdAt: string;
  }[];
};

async function studyRequest(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/study/${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Please sign in to start or resume your study."
        : (data.message ?? "Unable to load your study. Please try again."),
    );
  }

  return data;
}

export function useStudy() {
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await studyRequest("roadmaps/fixture");

        if (mounted) {
          setRoadmap(data);
        }
      } catch (error) {
        if (mounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your study.",
          );
        }
      } finally {
        if (mounted) {
          setBusy(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  async function start() {
    if (!roadmap) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const data: Workspace = await studyRequest(
        `roadmaps/${roadmap.id}/start`,
        "POST",
        {},
      );

      setWorkspace(data);
      setNotes(data.notes);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to resume your study.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(recordAttempt = false) {
    if (!workspace) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const saved: Workspace = await studyRequest(
        `workspaces/${workspace.id}`,
        "PUT",
        {
          revision: workspace.revision,
          files: workspace.files,
          notes,
        },
      );

      setWorkspace(saved);

      if (recordAttempt) {
        await studyRequest(`workspaces/${saved.id}/attempts`, "POST", {
          revision: saved.revision,
          stepId: saved.roadmap.definition.steps[saved.currentStep].id,
        });

        const updated: Workspace = await studyRequest(`workspaces/${saved.id}`);

        setWorkspace(updated);
      }

      setMessage(
        recordAttempt
          ? "Attempt saved. Evaluation is not available yet."
          : "Study notes saved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save. Your notes are still here.",
      );
    } finally {
      setBusy(false);
    }
  }

  return { roadmap, workspace, notes, setNotes, busy, message, start, save };
}
