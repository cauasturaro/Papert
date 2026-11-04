export type Challenge = {
  instructions: string;
  criteria: { id: string; description: string }[];
};

export type Level = "beginner" | "intermediate" | "advanced";

type Roadmap = {
  id: string;
  authorName: string;
  // Null for Papert's own roadmaps; set on roadmaps a learner generated.
  authorUserId: string | null;
  definition: {
    title: string;
    description: string;
    level?: Level;
    steps: {
      id: string;
      title: string;
      content: string;
      // Generated roadmaps name concepts and earlier prerequisite steps.
      concepts?: string[];
      requires?: string[];
      challenge: Challenge;
    }[];
  };
};

export type SyntaxDiagnostic = {
  path: string;
  language: string;
  line: number;
  column: number;
  message: string;
};

export type SyntaxReport = {
  status: "passed" | "failed";
  coverage: "complete" | "partial" | "none";
  checked: { path: string; language: string }[];
  unchecked: string[];
  diagnostics: SyntaxDiagnostic[];
};

export type Evaluation = {
  summary: string;
  criteria: { id: string; status: "met" | "not_met"; feedback: string }[];
  findings: {
    category: "logic" | "contract" | "structure" | "security";
    severity: "info" | "warning" | "error";
    path: string | null;
    message: string;
  }[];
  hints: string[];
};

export type AttemptResult = {
  status:
    | "not_evaluated"
    | "syntax_error"
    | "evaluating"
    | "needs_work"
    | "approved"
    | "analysis_failed";
  syntax?: SyntaxReport;
  evaluation?: Evaluation;
  reason?: string;
};

export type Workspace = {
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
    result: AttemptResult;
    createdAt: string;
  }[];
};

export class StudyRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function studyRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/study/${path}`, {
    method,
    cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new StudyRequestError(
      response.status,
      response.status === 401
        ? "Please sign in to start or resume your study."
        : (data.message ?? "Unable to load your study. Please try again."),
    );
  }

  return data;
}

export type { Roadmap };
