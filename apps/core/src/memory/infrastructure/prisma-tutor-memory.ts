import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { parseTurnMemory } from '../application/contracts/memory.contract.js';
import { conversationTitle, summaryAdvances } from '../domain/conversation.js';
import {
  contextItems,
  proposalDecision,
  proposalExpiry,
} from '../domain/durable-memory.js';
import type { MemoryKind, SummaryContent } from '../domain/memory.js';
import type {
  CompletedTurn,
  MemoryTransaction,
  TutorMemory,
} from '../domain/ports/tutor-memory.js';
import { lockLearner, purgeExpired } from './memory-locks.js';
import { toConversation, toMemoryItem } from './memory-rows.js';

type Transaction = Prisma.TransactionClient;

/** Executions' memory participant; every method runs in the caller's transaction except reads. */
export class PrismaTutorMemory implements TutorMemory {
  constructor(private readonly db: PrismaService) {}

  async conversation(
    context: MemoryTransaction,
    userId: string,
    workspaceId: string,
    conversationId: string | undefined,
    prompt: string,
    now: Date,
  ) {
    const tx = context as Transaction;

    const id =
      conversationId ?? (await this.latest(tx, userId, workspaceId, now));

    const locked = await tx.$queryRaw<{ id: string; title: string | null }[]>`
      SELECT id, title
      FROM core.tutor_conversation
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND workspace_id = ${workspaceId}::uuid
      FOR UPDATE`;
    if (!locked.length) {
      return null;
    }

    const row = await tx.tutorConversation.update({
      where: { id },
      data: {
        lastActiveAt: now,
        title: locked[0].title ?? conversationTitle(prompt),
      },
    });

    return toConversation(row);
  }

  // The most recently active conversation, or a new one for a workspace without any.
  private async latest(
    tx: Transaction,
    userId: string,
    workspaceId: string,
    now: Date,
  ) {
    const current = await tx.tutorConversation.findFirst({
      where: { userId, workspaceId },
      orderBy: [{ lastActiveAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    if (current) {
      return current.id;
    }

    const created = await tx.tutorConversation.create({
      data: { userId, workspaceId, createdAt: now, lastActiveAt: now },
      select: { id: true },
    });

    return created.id;
  }

  async dropSummary(context: MemoryTransaction, conversationId: string) {
    const tx = context as Transaction;

    // The cursor stays: folded turns are not refolded from text that may cite the deleted source.
    await tx.tutorConversation.update({
      where: { id: conversationId },
      data: { summary: Prisma.DbNull, summarySourceIds: [] },
    });
  }

  async notes(context: MemoryTransaction, userId: string, now: Date) {
    const tx = context as Transaction;

    const rows = await tx.memoryItem.findMany({
      where: {
        userId,
        status: 'active',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    return contextItems(rows.map(toMemoryItem));
  }

  async recordTurn(
    context: MemoryTransaction,
    turn: CompletedTurn,
    memory: unknown,
    now: Date,
  ) {
    const tx = context as Transaction;
    const outcome = parseTurnMemory(memory);

    if (outcome.summary && turn.fold) {
      await this.recordSummary(
        tx,
        turn.conversationId,
        turn.stepId,
        turn.fold,
        outcome.summary,
      );
    }

    if (outcome.proposal) {
      await this.recordProposal(
        tx,
        turn.userId,
        turn.executionId,
        outcome.proposal,
        now,
      );
    }
  }

  // Cursor and source ids come from Core's admission snapshot, never from the worker.
  private async recordSummary(
    tx: Transaction,
    conversationId: string,
    stepId: string,
    fold: NonNullable<CompletedTurn['fold']>,
    content: SummaryContent,
  ) {
    await tx.$queryRaw`SELECT id FROM core.tutor_conversation WHERE id = ${conversationId}::uuid FOR UPDATE`;

    const row = await tx.tutorConversation.findUnique({
      where: { id: conversationId },
    });
    if (!row) {
      return;
    }

    const stored = toConversation(row).summaryThrough;
    const candidate = { id: fold.throughId, at: new Date(fold.throughAt) };
    if (!summaryAdvances(stored, candidate)) {
      return;
    }

    await tx.tutorConversation.update({
      where: { id: conversationId },
      data: {
        summary: { ...content, stepId },
        summaryThroughId: candidate.id,
        summaryThroughAt: candidate.at,
        summarySourceIds: fold.sourceIds,
      },
    });
  }

  private async recordProposal(
    tx: Transaction,
    userId: string,
    executionId: string,
    proposal: { kind: MemoryKind; text: string },
    now: Date,
  ) {
    await lockLearner(tx, userId);
    await purgeExpired(tx, userId, now);

    const rows = await tx.memoryItem.findMany({ where: { userId } });
    const accepted = proposalDecision(proposal, rows.map(toMemoryItem), now);
    if (!accepted) {
      return;
    }

    // One proposal per execution; a repeated result or a racing duplicate text is skipped.
    await tx.memoryItem.createMany({
      data: {
        userId,
        kind: accepted.kind,
        text: accepted.text,
        status: 'proposed',
        origin: 'seymour',
        executionId,
        expiresAt: proposalExpiry(now),
        createdAt: now,
        updatedAt: now,
      },
      skipDuplicates: true,
    });
  }
}
