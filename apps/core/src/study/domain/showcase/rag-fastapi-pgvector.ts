import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const ragFastapiPgvector: ShowcaseRoadmap = {
  id: 'rag-fastapi-pgvector',
  definition: {
    title: 'Grounded Answers with FastAPI and pgvector',
    description:
      'Build the file-level design of a retrieval-augmented answer service. Preserve source identity through chunking, vector retrieval, and citation assembly.',
    level: 'advanced',
    steps: [
      {
        id: 'preserve-source-locations',
        title: 'Chunk documents without losing provenance',
        content:
          'Retrieval returns fragments, but a useful citation must lead back to the source. Treat chunk identity, source identity, and location as separate pieces of data. Split text using a bounded window with a smaller overlap, and retain character offsets into the original input rather than offsets into a normalized copy. Empty documents should produce no chunks. Validate window settings before entering a loop so malformed overlap cannot prevent forward progress. Stable chunk identifiers should also include a source revision, because a later edit can move the passage behind an otherwise unchanged citation.',
        concepts: ['chunking', 'overlap', 'source provenance'],
        requires: [],
        challenge: {
          instructions:
            'Implement bounded overlapping character chunks in app/chunking.py with source revision, chunk identifier, and start/end offsets. Reject invalid window or overlap settings.',
          criteria: [
            {
              id: 'chunk-progress',
              description:
                'app/chunking.py validates positive window size and 0 <= overlap < window, advances each window, and handles empty text.',
            },
            {
              id: 'source-offsets',
              description:
                'Each chunk retains its original text slice, source identifier, revision, and matching start/end character offsets.',
            },
          ],
        },
      },
      {
        id: 'store-embeddings',
        title: 'Align vectors with the storage schema',
        content:
          'An embedding represents text in a numerical space chosen by a specific model. Vectors from different models or dimensions cannot be mixed just because both are arrays of numbers. Make the dimension a shared contract between the embedding boundary and the SQL column. Store the chunk text and provenance beside the vector so retrieval can return evidence without guessing where it came from. A uniqueness constraint on source revision and chunk identity supports replacement without accidental duplicates. Keep SQL values parameterized; source text and identifiers are external data rather than pieces of query syntax.',
        concepts: ['embeddings', 'pgvector', 'schema contracts'],
        requires: ['preserve-source-locations'],
        challenge: {
          instructions:
            'Define a 384-dimensional embedding boundary and insertion function in app/retrieval.py. Write sql/001_chunks.sql with the vector extension, chunk provenance, vector(384), and a uniqueness constraint.',
          criteria: [
            {
              id: 'vector-contract',
              description:
                'app/retrieval.py checks embedding length against 384 and sql/001_chunks.sql declares vector(384).',
            },
            {
              id: 'chunk-storage',
              description:
                'sql/001_chunks.sql stores chunk text, source revision, offsets, and a uniqueness constraint; app/retrieval.py uses bound insertion parameters.',
            },
          ],
        },
      },
      {
        id: 'retrieve-evidence',
        title: 'Rank evidence before writing an answer',
        content:
          'Similarity is a ranking signal rather than proof that a passage answers a question. Embed the question with the same model used for stored chunks, order candidates by cosine distance, and apply a documented distance cutoff. Bound the number of selected chunks and the amount of text admitted to the answer context. A source filter must be part of the database query rather than a later cosmetic filter on citations. Return an empty evidence list when nothing qualifies. This gives the next stage a clear way to abstain instead of filling the gap with unrelated material.',
        concepts: ['cosine distance', 'retrieval bounds', 'abstention'],
        requires: ['store-embeddings'],
        challenge: {
          instructions:
            'Extend app/retrieval.py with parameterized cosine-distance retrieval using <=>, a source filter, a maximum of five chunks, a distance cutoff, and a total context character budget.',
          criteria: [
            {
              id: 'bounded-retrieval',
              description:
                'app/retrieval.py applies source filtering and ordered cosine distance in SQL with bound values and LIMIT at most five.',
            },
            {
              id: 'evidence-budget',
              description:
                'The retrieval function excludes results beyond its documented cutoff, enforces a total character budget, and returns an empty list for no qualifying evidence.',
            },
          ],
        },
      },
      {
        id: 'assemble-citations',
        title: 'Expose an answer that names its evidence',
        content:
          'A grounded response needs both an answer and an auditable connection to the passages that support it. Give selected chunks local citation labels and ask the generation boundary to return only those labels. Validate the returned references against the admitted evidence before building the public response. Retrieved text remains untrusted content, even when it contains instructions that look authoritative. Keep those passages separate from the instruction that governs answer generation. When no evidence survives retrieval, return an explicit insufficient-evidence result and avoid calling the answer generator. Citation metadata should preserve the revision and offsets established during chunking.',
        concepts: ['FastAPI', 'citation validation', 'untrusted context'],
        requires: ['retrieve-evidence'],
        challenge: {
          instructions:
            'Complete app/api.py with a typed POST /answers request and response. Validate question length, pass evidence as untrusted context, verify citation labels, and include source revision and offsets in citations.',
          criteria: [
            {
              id: 'answer-contract',
              description:
                'app/api.py validates a nonblank bounded question and returns an insufficient-evidence response without generation when retrieval is empty.',
            },
            {
              id: 'citation-integrity',
              description:
                'app/api.py rejects unknown citation labels and maps accepted labels to retrieved source identifiers, revisions, and offsets.',
            },
            {
              id: 'context-boundary',
              description:
                'The generation request separates governing instructions from retrieved text and explicitly treats passage instructions as untrusted content.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'app/chunking.py':
        '# TODO: Split source text while preserving source locations.\n',
      'app/retrieval.py':
        '# TODO: Define embedding and retrieval boundaries.\n',
      'app/api.py': '# TODO: Describe the grounded answer endpoint.\n',
      'sql/001_chunks.sql':
        '-- TODO: Define source chunks and their vectors.\n',
    },
  },
};
