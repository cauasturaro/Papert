import type { ShowcaseRoadmap } from '../showcase-roadmaps.js';

export const postgresqlSchemaDesign: ShowcaseRoadmap = {
  id: 'postgresql-schema-design',
  definition: {
    title: 'Designing Relational Schemas in PostgreSQL',
    description:
      'Model workshop registrations using tables, relationships, and SQL constraints. Add query-focused indexes and reversible migration files.',
    level: 'beginner',
    steps: [
      {
        id: 'identify-relations',
        title: 'Give each fact a clear home',
        content:
          'A relational model starts with the facts the system must remember. A workshop has a title and a capacity; a registration links one attendee address to one workshop. Keeping workshop details out of registration rows prevents a title change from requiring many coordinated edits. A primary key identifies a row independently of a display label, which may change or be repeated. Choose explicit column types and nullability rather than relying on assumptions in application code. Write down the relationship in plain language first, then make the SQL express the same structure.',
        concepts: ['tables', 'primary keys', 'nullability'],
        requires: [],
        challenge: {
          instructions:
            'Define workshops and registrations tables in sql/001_create.sql with explicit primary keys, suitable column types, and required columns. Describe their one-to-many relationship in docs/schema.md.',
          criteria: [
            {
              id: 'table-shapes',
              description:
                'sql/001_create.sql defines workshops and registrations with separate primary keys and explicit NOT NULL columns for required facts.',
            },
            {
              id: 'normalized-facts',
              description:
                'Workshop title and capacity live in workshops rather than being copied into registrations, and docs/schema.md describes the relationship.',
            },
          ],
        },
      },
      {
        id: 'enforce-invariants',
        title: 'Let constraints protect relationships',
        content:
          'Application validation can explain an error early, but a database constraint protects data written through every entry point. A foreign key prevents a registration from referring to an absent workshop. A unique constraint on workshop and attendee address prevents duplicate enrollment for that pair. A check constraint can require positive capacity, although a simple row check cannot safely enforce a total registration count across rows. Decide what deleting a workshop should mean for registrations rather than accepting an accidental default. Keep that deletion policy visible in both the SQL and the accompanying explanation.',
        concepts: ['foreign keys', 'unique constraints', 'check constraints'],
        requires: ['identify-relations'],
        challenge: {
          instructions:
            'Extend sql/001_create.sql with a workshop foreign key, a unique workshop/address pair, a positive capacity check, and an explicit deletion policy. Explain the capacity-count limitation in docs/schema.md.',
          criteria: [
            {
              id: 'relationship-constraints',
              description:
                'sql/001_create.sql declares the workshop foreign key with an explicit ON DELETE policy and a unique workshop/address pair.',
            },
            {
              id: 'capacity-rule',
              description:
                'sql/001_create.sql checks positive workshop capacity; docs/schema.md explains why limiting total registrations requires coordination beyond a row CHECK.',
            },
          ],
        },
      },
      {
        id: 'index-a-query',
        title: 'Choose an index from a lookup pattern',
        content:
          'An index is a second structure maintained alongside table data. It can reduce the rows inspected by a lookup, but it adds storage and work to writes. Start with a concrete query: list registrations for one workshop ordered by creation time and identifier. A composite index beginning with workshop identity can support the equality filter before the ordering columns. Check the primary and unique constraints before adding another index, because they already create supporting structures. An explanation of the intended access pattern is stronger than a claim that every query becomes faster merely because an index exists.',
        concepts: ['composite indexes', 'query patterns', 'write cost'],
        requires: ['enforce-invariants'],
        challenge: {
          instructions:
            'Add created_at to registrations and write the ordered workshop lookup in docs/schema.md. Define a matching composite index in sql/002_indexes.sql and explain its column order and write cost.',
          criteria: [
            {
              id: 'lookup-index',
              description:
                'sql/002_indexes.sql indexes registrations by workshop identifier, created_at, and registration identifier in the lookup order.',
            },
            {
              id: 'query-rationale',
              description:
                'docs/schema.md contains the filtered ordered SELECT, explains the equality-first index order, and acknowledges maintenance cost without duplicating an existing constraint index.',
            },
          ],
        },
      },
      {
        id: 'plan-migrations',
        title: 'Write changes with an explicit reverse path',
        content:
          'A migration is an ordered change to an existing schema, so both its starting assumptions and its reverse operation matter. Adding a nullable note column is a small change with a straightforward reverse path; removing that column discards any notes already stored. Separate forward and reverse SQL files instead of hiding both directions in one ambiguous script. Keep initial table creation distinct from later changes so another reader can follow the schema history. Document the data-loss consequence of reversal and the required file order. The exercise is to make the migration reviewable, without requiring a live database.',
        concepts: ['migrations', 'reversibility', 'data loss'],
        requires: ['index-a-query'],
        challenge: {
          instructions:
            'Create sql/003_add_note.sql and sql/003_remove_note.sql for adding and removing an optional registration note. Document forward order, reverse order, and the loss of note data in docs/schema.md.',
          criteria: [
            {
              id: 'migration-pair',
              description:
                'sql/003_add_note.sql adds a nullable registration note and sql/003_remove_note.sql drops that same column.',
            },
            {
              id: 'migration-history',
              description:
                'docs/schema.md lists creation, index, and note changes in forward order, explains reverse ordering, and warns that dropping the note loses its stored values.',
            },
          ],
        },
      },
    ],
    starterFiles: {
      'sql/001_create.sql': '-- TODO: Model workshops and registrations.\n',
      'sql/002_indexes.sql': '-- TODO: Support the documented lookup.\n',
      'docs/schema.md':
        '# Workshop schema\n\nTODO: Explain relationships and migration choices.\n',
    },
  },
};
