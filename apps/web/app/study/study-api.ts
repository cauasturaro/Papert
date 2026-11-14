import { createJsonRequest, RequestError } from "@/lib/api/request";
import type { Challenge, Level } from "@/lib/roadmap";

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
  // Solution guidance progress for the current step; absent from older responses.
  solution?: {
    analyzedAttempts: number;
    required: number;
    eligible: boolean;
  };
};

// Study callers already catch this name; it is the shared request error.
export { RequestError as StudyRequestError };

export const studyRequest = createJsonRequest({
  base: "/api/study",
  unauthorized: "Please sign in to start or resume your study.",
  unavailable: "Unable to load your study. Please try again.",
});

export type { Roadmap };

/** Core includes these newest attempts plus the latest per step; history pages through the rest. */
export const RECENT_ATTEMPT_LIMIT = 20;

export function readWorkspace(workspaceId: string) {
  return studyRequest<Workspace>(`workspaces/${workspaceId}?attempts=recent`);
}
