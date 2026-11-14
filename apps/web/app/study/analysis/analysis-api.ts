import { createJsonRequest } from "@/lib/api/request";
import type { Execution } from "../execution/execution-state";
import type { SyntaxReport } from "../study-api";

export type AnalysisExecution = Execution & { attemptId?: string | null };

export type SyntaxRejection = { status: "syntax_error"; syntax: SyntaxReport };

const executions = createJsonRequest({
  base: "/api/executions",
  unauthorized: "Your session ended. Sign in again to continue.",
  unavailable: "Analysis is unavailable right now. Try again in a moment.",
});

export function startAnalysis(workspaceId: string, revision: number) {
  const body = { requestKey: crypto.randomUUID(), kind: "analysis", revision };

  return executions<AnalysisExecution | SyntaxRejection>(
    `workspaces/${workspaceId}`,
    "POST",
    body,
  );
}

export function readAnalysis(executionId: string) {
  return executions<AnalysisExecution>(executionId);
}

export function cancelAnalysis(executionId: string) {
  return executions<AnalysisExecution>(`${executionId}/cancel`, "POST", {});
}

export function workspaceExecutions(workspaceId: string) {
  return executions<AnalysisExecution[]>(`workspaces/${workspaceId}`);
}



export function isSyntaxRejection(
  response: AnalysisExecution | SyntaxRejection,
): response is SyntaxRejection {
  return response.status === "syntax_error" && "syntax" in response;
}
