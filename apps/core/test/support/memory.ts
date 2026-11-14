import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Prisma } from '@prisma/client';
import { ParserSyntaxChecker } from '../../src/analysis/infrastructure/parser-syntax-checker.js';
import { PrismaConversationRepository } from '../../src/memory/infrastructure/prisma-conversation-repository.js';
import { executionsHarness, noCatalog } from './executions-http.js';
import { createExecutions } from './executions.js';

export type MemoryStudent = { userId: string; workspaceId: string };
export type ChatInput = {
  conversationId: string;
  stepId: string;
  recentTurns: { prompt: string; answer: string }[];
  foldTurns: { prompt: string; answer: string }[];
  summaryFold?: { throughId: string; throughAt: string; sourceIds: string[] };
  summary?: {
    covered: string[];
    pending: string[];
    struggles: string[];
    stepId: string;
  };
  memory: { id: string; kind: string; text: string }[];
};

export const summary = { covered: ['a'], pending: ['b'], struggles: [] };

export function citedGuide(sourceId: string) {
  return {
    support: 'cited',
    citations: [
      {
        sourceId,
        cite: 'guide.pdf, p. 1',
        location: { page: 1 },
        excerpt: 'Private guide text',
        quote: 'Private guide text',
      },
    ],
  };
}

export function memoryHarness() {
  const context = executionsHarness();

  function api(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    cookie: string,
  ) {
    return request(context.app.getHttpServer())
      [method](`/memory${path}`)
      .set('Cookie', cookie)
      .set('Origin', context.origin)
      .set('Content-Type', 'application/json');
  }

  function services() {
    const sources = {
      ready: (userId: string, workspaceId: string) =>
        context.db.sourceDocument.findMany({
          where: { workspaceId, workspace: { userId }, status: 'ready' },
          select: { id: true, filename: true, format: true },
        }),
    };

    return createExecutions(
      context.db,
      context.queue,
      new ParserSyntaxChecker(),
      sources,
      noCatalog,
      () => context.now,
    );
  }

  async function admit(
    student: MemoryStudent,
    conversationId?: string,
    prompt = 'Explain this step',
    built = services(),
  ) {
    context.now = new Date(context.now.getTime() + 1000);

    const execution = await built.service.create(
      student.userId,
      student.workspaceId,
      {
        ...context.payload(),
        mode: 'doubt',
        prompt,
        ...(conversationId ? { conversationId } : {}),
      },
    );
    const row = await context.db.execution.findUniqueOrThrow({
      where: { id: execution.id },
    });

    return { ...row, input: row.input as unknown as ChatInput };
  }

  async function complete(id: string, memory?: unknown, grounding?: unknown) {
    const built = services();
    const claim = await built.worker.claim(id);
    const event = {
      ...context.event(id, claim.lease!),
      text: `Answer for ${id}`,
      memory,
      grounding,
    };

    await built.worker.accept(event);

    return event;
  }

  function conversation(student: MemoryStudent) {
    return new PrismaConversationRepository(context.db).create(
      student.userId,
      student.workspaceId,
      context.now,
    );
  }

  function storedConversation(id: string) {
    return context.db.tutorConversation.findUniqueOrThrow({ where: { id } });
  }

  function storedExecution(id: string) {
    return context.db.execution.findUniqueOrThrow({ where: { id } });
  }

  async function sevenTurns(student: MemoryStudent) {
    const turns = [];
    let conversationId: string | undefined;

    for (let index = 1; index <= 7; index++) {
      const turn = await admit(student, conversationId, `Prompt ${index}`);

      await complete(turn.id);

      turns.push(turn);
      conversationId = turn.input.conversationId;
    }

    return turns;
  }

  function item(
    userId: string,
    text: string,
    data: Partial<Prisma.MemoryItemUncheckedCreateInput> = {},
  ) {
    return context.db.memoryItem.create({
      data: {
        userId,
        text,
        kind: 'preference',
        status: 'active',
        origin: 'learner',
        ...data,
      },
    });
  }

  function source(student: MemoryStudent) {
    return context.db.sourceDocument.create({
      data: {
        workspaceId: student.workspaceId,
        uploadedByUserId: student.userId,
        bucket: 'papert-sources',
        objectKey: `memory/${randomUUID()}`,
        filename: 'guide.pdf',
        format: 'pdf',
        contentType: 'application/pdf',
        sizeBytes: 42,
        status: 'ready',
        uploadExpiresAt: new Date(context.now.getTime() + 60000),
      },
    });
  }

  return {
    context,
    api,
    services,
    admit,
    complete,
    conversation,
    storedConversation,
    storedExecution,
    sevenTurns,
    item,
    source,
  };
}
