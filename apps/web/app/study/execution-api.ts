export type Quota = {
  limit: number;
  used: number;
  reserved: number;
  reservation: number;
  period: string;
  resetsAt: number;
};

export async function executionRequest<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/executions/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message ?? "Execution service unavailable.");
  }

  return result;
}
