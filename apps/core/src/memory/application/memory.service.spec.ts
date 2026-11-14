import { describe, expect, it, vi } from 'vitest';
import type { Conversation } from '../domain/memory.js';
import type { ConversationRepository } from '../domain/ports/conversation-repository.js';
import type { MemoryRepository } from '../domain/ports/memory-repository.js';
import { MemoryService } from './memory.service.js';

const NOW = new Date('2026-11-06T12:00:00Z');

function conversation(id: string, title: string | null = null): Conversation {
  return {
    id,
    workspaceId: 'workspace',
    title,
    summary: null,
    summaryThrough: null,
    summarySourceIds: [],
    createdAt: NOW,
    lastActiveAt: NOW,
  };
}

function setup(conversations: Partial<ConversationRepository> = {}) {
  // Plain mocks, so assertions do not read methods off the repository object.
  const repository = {
    list: vi.fn(),
    create: vi.fn(async () => conversation('created')),
    latestEmpty: vi.fn(async () => null as Conversation | null),
    rename: vi.fn(
      async (_user: string, _workspace: string, id: string, title: string) =>
        conversation(id, title),
    ),
    remove: vi.fn(async () => 'removed' as const),
    ...conversations,
  } as const;
  const workspaces = { owns: vi.fn(async () => true) };

  const service = new MemoryService(
    {} as MemoryRepository,
    repository as ConversationRepository,
    workspaces,
    () => NOW,
  );

  return { service, repository, workspaces };
}

describe('MemoryService conversations', () => {
  it('reuses an empty conversation instead of creating another one', async () => {
    const { service, repository } = setup({
      latestEmpty: vi.fn(async () => conversation('empty')),
    });

    const started = await service.startConversation('user', 'workspace', {});

    expect(started.id).toBe('empty');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('creates a conversation when every existing one has messages', async () => {
    const { service, repository } = setup();

    const started = await service.startConversation('user', 'workspace', {});

    expect(started.id).toBe('created');
    expect(repository.create).toHaveBeenCalledWith('user', 'workspace', NOW);
  });

  it('renames with a normalized title and rejects blank or unknown conversations', async () => {
    const { service, repository } = setup();

    const renamed = await service.renameConversation(
      'user',
      'workspace',
      'chat',
      { title: '  Loops   and\nrecursion ' },
    );

    expect(renamed.title).toBe('Loops and recursion');
    expect(repository.rename).toHaveBeenCalledWith(
      'user',
      'workspace',
      'chat',
      'Loops and recursion',
    );

    await expect(
      service.renameConversation('user', 'workspace', 'chat', { title: ' ' }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    const missing = setup({ rename: vi.fn(async () => null) });

    await expect(
      missing.service.renameConversation('user', 'workspace', 'chat', {
        title: 'Loops',
      }),
    ).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('deletes a conversation unless an answer is still running', async () => {
    const { service, repository } = setup();

    await service.removeConversation('user', 'workspace', 'chat', {});

    expect(repository.remove).toHaveBeenCalledWith('user', 'workspace', 'chat');

    const running = setup({ remove: vi.fn(async () => 'active' as const) });
    const missing = setup({ remove: vi.fn(async () => 'not_found' as const) });

    await expect(
      running.service.removeConversation('user', 'workspace', 'chat', {}),
    ).rejects.toMatchObject({ kind: 'conflict' });
    await expect(
      missing.service.removeConversation('user', 'workspace', 'chat', {}),
    ).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('checks workspace ownership before touching conversations', async () => {
    const { service, repository, workspaces } = setup();
    workspaces.owns.mockResolvedValue(false);

    await expect(
      service.removeConversation('user', 'workspace', 'chat', {}),
    ).rejects.toMatchObject({ kind: 'not_found' });
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
