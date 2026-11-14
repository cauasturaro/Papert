import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { ControlRequest } from '../application/contracts/source.contract.js';
import type { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { controlSchema } from '../application/contracts/source.contract.js';
import { SourceIngestionService } from '../application/source-ingestion.service.js';
import { beginDecision } from '../domain/source.js';
import type { StoredSource } from '../domain/source.js';
import { PrismaSourceRepository } from './prisma-source-repository.js';

type Case = {
  name: string;
  request: ControlRequest;
  response: {
    outcome?: string;
    documentId?: string | null;
    accepted?: boolean;
    deleted?: boolean;
  };
};
type Fixture = {
  valid: Case[];
  invalid: {
    name: string;
    payload: unknown;
    rejection: { service: string; exception: string };
  }[];
};

function fixtures(action: string): Fixture {
  const path = new URL(
    `../../../../../contracts/ingestion-${action}/fixtures.json`,
    import.meta.url,
  );

  return JSON.parse(readFileSync(path, 'utf8'));
}

for (const action of ['begin', 'complete', 'fail', 'removal', 'reindex']) {
  const contract = fixtures(action);

  it.each(contract.valid)(
    `parses shared ingestion ${action} request $name`,
    ({ request }) => {
      expect(controlSchema.parse(request)).toEqual(request);
    },
  );

  it.each(contract.invalid)(
    `rejects shared ingestion ${action} request $name`,
    ({ payload, rejection }) => {
      expect(rejection).toEqual({ service: 'core', exception: 'ZodError' });
      expect(() => controlSchema.parse(payload)).toThrowError(z.ZodError);
    },
  );

  it.each(contract.valid)(
    `builds shared ingestion ${action} answer $name`,
    async ({ request, response }) => {
      const now = new Date('2026-01-01T00:00:00Z');
      const source: StoredSource = {
        id:
          response.documentId ??
          ('documentId' in request ? request.documentId : undefined) ??
          '11111111-1111-4111-8111-111111111111',
        workspaceId: '33333333-3333-4333-8333-333333333333',
        bucket: 'papert-sources',
        objectKey:
          ('key' in request ? request.key : undefined) ??
          'documents/11111111-1111-4111-8111-111111111111/original.md',
        filename: 'original.md',
        format: 'md',
        sizeBytes: 10,
        status: 'processing',
        objectVersionId: 'v1',
        sequencer: '00A1',
        errorCode: null,
        chunkCount: null,
        characterCount: null,
        pageCount: null,
        warnings: [],
        uploadExpiresAt: now,
        createdAt: now,
        updatedAt: now,
        readyAt: null,
      };
      let row: StoredSource | null = source;

      if (
        response.outcome === 'reject' ||
        response.outcome === 'skip' ||
        response.documentId === null ||
        (response.accepted === false && !response.deleted)
      ) {
        row = null;
      } else if (response.outcome === 'deleted' || response.deleted) {
        source.status = 'deleted';
      } else if (response.outcome === 'stale') {
        source.sequencer = '00A2';
      } else if (response.outcome === 'duplicate') {
        source.status = 'ready';
      } else if (response.outcome === 'invalid') {
        source.sizeBytes = 11;
      }

      const tx = {
        $queryRaw: async () => [],
        sourceDocument: {
          findUnique: async () => row,
          update: async () => row,
        },
      };
      const db = {
        ...tx,
        $transaction: async (run: (client: typeof tx) => unknown) => run(tx),
      };
      const repository = new PrismaSourceRepository(
        db as unknown as PrismaService,
      );
      let answer: unknown;

      if (request.action === 'begin') {
        answer = await repository.begin(request, (stored) =>
          beginDecision(stored, request, source.bucket),
        );
      } else if (request.action === 'complete') {
        answer = await repository.complete(request);
      } else if (request.action === 'fail') {
        answer = await repository.fail(request);
      } else if (request.action === 'reindex') {
        answer = await repository.reindex(request.documentId);
      } else {
        const service = new SourceIngestionService(
          repository,
          { bucket: source.bucket } as never,
          () => now,
        );
        answer = await service.control(request);
      }

      expect(answer).toEqual(response);
    },
  );
}
