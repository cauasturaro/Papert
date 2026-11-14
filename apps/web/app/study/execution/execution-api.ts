import { createJsonRequest } from "../../../lib/api/request.ts";

export type Quota = {
  limit: number;
  used: number;
  reserved: number;
  reservation: number;
  period: string;
  resetsAt: number;
};

const request = createJsonRequest({
  base: "/api/executions",
  unauthorized: "Your session ended. Sign in again to continue.",
  unavailable: "Seymour is unavailable right now. Try again in a moment.",
});

/** GET without a body, POST with one. */
export function executionRequest<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, body === undefined ? "GET" : "POST", body);
}
