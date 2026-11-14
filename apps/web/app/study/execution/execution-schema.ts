import { z } from "zod";
import type { Execution } from "./execution-state";

const citationLocation = z.union([
  z.object({ page: z.number() }),
  z.object({
    lineStart: z.number(),
    lineEnd: z.number(),
    headings: z.array(z.string()).optional(),
  }),
  z.object({
    paragraphStart: z.number(),
    paragraphEnd: z.number(),
    heading: z.string().nullable().optional(),
  }),
]);

const grounding = z.object({
  support: z.enum(["cited", "unsupported"]),
  citations: z.array(
    z.object({
      sourceId: z.string(),
      cite: z.string(),
      location: citationLocation,
      excerpt: z.string(),
      quote: z.string().nullable(),
    }),
  ),
});

// Fields Core may add later pass through; the ones the UI reads must have their types.
export const executionSchema = z.looseObject({
  id: z.string(),
  workspaceId: z.string(),
  kind: z.enum(["chat", "analysis", "generation"]),
  prompt: z.string().nullable(),
  conversationId: z.string().nullable().optional(),
  memoryUsed: z.number().optional(),
  mode: z.string().nullable().optional(),
  effort: z.string().nullable().optional(),
  status: z.string(),
  text: z.string(),
  grounding: grounding.nullable().optional(),
  sequence: z.number().int(),
  charged: z.number(),
  reserved: z.number(),
  createdAt: z.string().optional(),
  finishedAt: z.string().nullable().optional(),
});

const streamMessageSchema = executionSchema.extend({
  // Set on frames trimmed to fit the socket limit; the full snapshot is read over HTTP.
  requiresRefresh: z.boolean().optional(),
});

export type StreamMessage = {
  snapshot: Execution;
  requiresRefresh: boolean;
};

/**
 * The snapshot carried by a stream message, or null when the message is not valid JSON,
 * does not match the execution shape or belongs to another execution.
 */
export function parseExecutionMessage(
  data: unknown,
  executionId: string,
): StreamMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  let payload: unknown;

  try {
    payload = JSON.parse(data);
  } catch {
    return null;
  }

  const parsed = streamMessageSchema.safeParse(payload);

  if (!parsed.success || parsed.data.id !== executionId) {
    return null;
  }

  const { requiresRefresh = false, ...snapshot } = parsed.data;

  return { snapshot, requiresRefresh };
}
