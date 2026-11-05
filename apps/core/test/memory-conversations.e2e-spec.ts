import { ExecutionError } from '../src/executions/domain/execution.js';
import { DELETED_SOURCE_ANSWER } from '../src/executions/domain/conversation-window.js';
import { citedGuide, memoryHarness, summary } from './support/memory.js';

describe.skipIf(!process.env.AUTH_TEST_DATABASE_URL)(
  'Tutor conversations + PostgreSQL',
  () => {
    const {
      context,
      services,
      admit,
      complete,
      conversation,
      storedConversation,
      storedExecution,
      sevenTurns,
      item,
      source,
    } = memoryHarness();

    it('creates a conversation automatically and reuses its completed history and first title', async () => {
      const alice = await context.student();

      const first = await admit(alice, undefined, 'Explain request validation');
      await complete(first.id);
      const second = await admit(alice, undefined, 'What comes next?');

      expect(first.conversationId).toBe(first.input.conversationId);
      expect(second.conversationId).toBe(first.conversationId);
      expect(second.input.recentTurns).toEqual([
        {
          prompt: 'Explain request validation',
          answer: `Answer for ${first.id}`,
        },
      ]);
      expect(
        await storedConversation(first.input.conversationId),
      ).toMatchObject({ title: 'Explain request validation' });
    });

    it('starts fresh and rejects conversations of another workspace or learner without inserting executions', async () => {
      const alice = await context.student();
      const bob = await context.student();
      const first = await admit(alice);
      await complete(first.id);
      const fresh = await conversation(alice);
      const otherWorkspace = await context.db.workspace.create({
        data: { userId: alice.userId, files: {} },
      });
      const otherConversation = await conversation({
        ...alice,
        workspaceId: otherWorkspace.id,
      });
      const bobConversation = await conversation(bob);

      const next = await admit(alice, fresh.id);

      expect(next.input.recentTurns).toEqual([]);
      await complete(next.id);

      const before = await context.db.execution.count();
      for (const id of [otherConversation.id, bobConversation.id]) {
        const rejected = admit(alice, id);

        await expect(rejected).rejects.toBeInstanceOf(ExecutionError);
        await expect(rejected).rejects.toMatchObject({ kind: 'not_found' });
      }

      expect(await context.db.execution.count()).toBe(before);
    });

    it('folds the oldest three turns, persists a fenced summary and ignores duplicate completion', async () => {
      const alice = await context.student();
      const turns = await sevenTurns(alice);
      const conversationId = turns[0].input.conversationId;

      const eighth = await admit(alice, conversationId);

      expect(eighth.input.foldTurns.map((turn) => turn.prompt)).toEqual([
        'Prompt 1',
        'Prompt 2',
        'Prompt 3',
      ]);
      expect(eighth.input.recentTurns.map((turn) => turn.prompt)).toEqual([
        'Prompt 4',
        'Prompt 5',
        'Prompt 6',
        'Prompt 7',
      ]);
      expect(eighth.input.summaryFold?.throughId).toBe(turns[2].id);

      const event = await complete(eighth.id, { summary });
      const stored = await storedConversation(conversationId);
      await services().worker.accept(event);

      expect(stored.summary).toEqual({
        ...summary,
        stepId: eighth.input.stepId,
      });
      expect(stored.summaryThroughId).toBe(turns[2].id);
      expect(await storedConversation(conversationId)).toEqual(stored);

      const ninth = await admit(alice, conversationId);

      expect(ninth.input.summary).toEqual(stored.summary);
      expect(ninth.input.recentTurns.map((turn) => turn.prompt)).toEqual([
        'Prompt 5',
        'Prompt 6',
        'Prompt 7',
        'Explain this step',
      ]);
    });

    it('ignores malformed memory while still completing chats without storing a summary', async () => {
      const alice = await context.student();
      const turns = await sevenTurns(alice);
      const conversationId = turns[0].input.conversationId;
      const malformedPayloads = [
        { summary: { covered: ['x'.repeat(500)] } },
        'nope',
      ];

      for (const memory of malformedPayloads) {
        const chat = await admit(alice, conversationId);

        expect(chat.input.summaryFold).toBeDefined();

        await complete(chat.id, memory);
        const completed = await storedExecution(chat.id);

        expect(completed.status).toBe('completed');
        expect((await storedConversation(conversationId)).summary).toBeNull();
      }
    });

    it('redacts answers citing deleted sources and drops summaries derived from them', async () => {
      const alice = await context.student();
      const guide = await source(alice);
      const first = await admit(alice, undefined, 'Explain the guide');
      const grounding = citedGuide(guide.id);

      await complete(first.id, undefined, grounding);
      const stored = await storedExecution(first.id);

      expect(stored.grounding).toMatchObject({
        citations: [expect.objectContaining({ sourceId: guide.id })],
      });

      await context.db.tutorConversation.update({
        where: { id: first.input.conversationId },
        data: {
          summary: { ...summary, stepId: first.input.stepId },
          summarySourceIds: [guide.id],
        },
      });
      await context.db.sourceDocument.update({
        where: { id: guide.id },
        data: { status: 'deleted', deletedAt: context.now },
      });

      const next = await admit(alice, first.input.conversationId);

      expect(next.input.recentTurns).toEqual([
        { prompt: 'Explain the guide', answer: DELETED_SOURCE_ANSWER },
      ]);
      expect(next.input.summary).toBeUndefined();
      expect(
        (await storedConversation(first.input.conversationId)).summary,
      ).toBeNull();
    });

    it('includes only active notes newest first and rechecks deletions at claim without rewriting the snapshot', async () => {
      const alice = await context.student();
      const older = await item(alice.userId, 'Prefers short answers', {
        updatedAt: new Date(context.now.getTime() - 2000),
      });
      const newer = await item(alice.userId, 'Prefers Python examples', {
        updatedAt: context.now,
      });
      await item(alice.userId, 'Proposed difficulty', {
        status: 'proposed',
        origin: 'seymour',
        expiresAt: new Date(context.now.getTime() + 86400000),
      });

      const queued = await admit(alice);

      expect(queued.input.memory.map((note) => note.id)).toEqual([
        newer.id,
        older.id,
      ]);

      await context.db.memoryItem.delete({ where: { id: newer.id } });
      const claim = await services().worker.claim(queued.id);
      const stored = await storedExecution(queued.id);

      expect(claim.input).toMatchObject({
        memory: [expect.objectContaining({ id: older.id })],
      });
      expect(stored.input).toEqual(queued.input);

      await services().worker.accept(context.event(queued.id, claim.lease!));
      const next = await admit(alice, queued.input.conversationId);

      expect(next.input.memory.map((note) => note.id)).toEqual([older.id]);
    });

    it('stores expiring Seymour proposals once, skips active duplicates and excludes proposals from context', async () => {
      const alice = await context.student();
      const first = await admit(alice);
      const proposal = { kind: 'preference', text: 'Prefers Python examples' };

      const event = await complete(first.id, { proposal });
      await services().worker.accept(event);
      const proposals = await context.db.memoryItem.findMany({
        where: { userId: alice.userId },
      });

      expect(proposals).toHaveLength(1);
      expect(proposals[0]).toMatchObject({
        ...proposal,
        status: 'proposed',
        origin: 'seymour',
        executionId: first.id,
      });
      expect(proposals[0].expiresAt!.getTime()).toBe(
        context.now.getTime() + 14 * 86400000,
      );

      const active = await item(alice.userId, 'Prefers concise answers');
      const next = await admit(alice, first.input.conversationId);

      expect(next.input.memory.map((note) => note.id)).toEqual([active.id]);

      await complete(next.id, {
        proposal: { kind: 'preference', text: 'PREFERS CONCISE ANSWERS' },
      });

      expect(
        await context.db.memoryItem.count({ where: { userId: alice.userId } }),
      ).toBe(2);
      expect(
        await context.db.memoryItem.count({ where: { executionId: next.id } }),
      ).toBe(0);
    });

    it('reopens at the current step while preserving the summary’s original step', async () => {
      const alice = await context.student();
      const first = await admit(alice);
      await complete(first.id);
      const oldSummary = { ...summary, stepId: first.input.stepId };
      await context.db.tutorConversation.update({
        where: { id: first.input.conversationId },
        data: { summary: oldSummary },
      });

      // Arrange trusted progress directly; evaluation behavior is covered by its own suites.
      await context.db.workspace.update({
        where: { id: alice.workspaceId },
        data: { currentStep: 1 },
      });

      const reopened = await admit(alice, first.input.conversationId);

      expect(first.input.stepId).toBe('validate-input');
      expect(reopened.input.stepId).toBe('separate-rules');
      expect(reopened.input.summary).toEqual(oldSummary);
      expect(
        (await storedConversation(first.input.conversationId)).summary,
      ).toEqual(oldSummary);
    });

    it('reloads conversation history and a settled summary in independent service instances', async () => {
      const alice = await context.student();
      const turns = await sevenTurns(alice);
      const conversationId = turns[0].input.conversationId;
      const eighth = await admit(alice, conversationId);
      await complete(eighth.id, { summary });
      const stored = await storedConversation(conversationId);

      const restarted = services();
      const next = await admit(
        alice,
        conversationId,
        'After restart',
        restarted,
      );
      const claimed = await restarted.worker.claim(next.id);

      expect(next.input.summary).toEqual(stored.summary);
      expect(next.input.recentTurns).toHaveLength(4);
      expect(next.input.recentTurns[3]).toEqual({
        prompt: 'Explain this step',
        answer: `Answer for ${eighth.id}`,
      });
      expect(claimed.input).toEqual(next.input);
    });
  },
);
