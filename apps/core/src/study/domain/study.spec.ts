import { fixtureDefinition } from './fixture.js';
import {
  attemptSchema,
  filesSchema,
  roadmapSchema,
  saveSchema,
} from './study.js';

describe('Study contracts', () => {
  it('requires ordered steps, content and uniquely identified acceptance criteria', () => {
    expect(roadmapSchema.safeParse(fixtureDefinition).success).toBe(true);

    const withoutSteps = { ...fixtureDefinition, steps: [] };

    expect(roadmapSchema.safeParse(withoutSteps).success).toBe(false);

    const duplicateSteps = {
      ...fixtureDefinition,
      steps: [fixtureDefinition.steps[0], fixtureDefinition.steps[0]],
    };

    expect(roadmapSchema.safeParse(duplicateSteps).success).toBe(false);

    const duplicateCriteria = structuredClone(fixtureDefinition);
    duplicateCriteria.steps[0].challenge.criteria.push(
      duplicateCriteria.steps[0].challenge.criteria[0],
    );

    expect(roadmapSchema.safeParse(duplicateCriteria).success).toBe(false);
  });

  it('rejects traversal, unsafe path segments and excessive file payloads', () => {
    for (const path of [
      '../secret',
      '/absolute',
      'src//file',
      'src/../file',
      'src\\file',
      '__proto__/file',
    ]) {
      expect(filesSchema.safeParse({ [path]: 'content' }).success).toBe(false);
    }

    const validFile = filesSchema.safeParse({ 'src/hello.ts': 'hello' });

    expect(validFile.success).toBe(true);

    const tooManyFiles = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`file${i}`, '']),
    );

    expect(filesSchema.safeParse(tooManyFiles).success).toBe(false);

    const oversizedFile = { a: 'a'.repeat(16001) };

    expect(filesSchema.safeParse(oversizedFile).success).toBe(false);

    const oversizedWorkspace = Object.fromEntries(
      Array.from({ length: 5 }, (_, i) => [`file${i}`, 'a'.repeat(16000)]),
    );

    expect(filesSchema.safeParse(oversizedWorkspace).success).toBe(false);
  });

  it('validates empty directories and file ancestors without changing existing text limits', () => {
    const tree = {
      'src/': '',
      'src/nested/': '',
      'src/nested/main.ts': 'code',
    };

    expect(filesSchema.safeParse(tree).success).toBe(true);
    expect(filesSchema.safeParse({ 'main.ts': 'é'.repeat(8001) }).success).toBe(
      true,
    );

    for (const files of [
      { 'src/': 'not empty' },
      { src: 'file', 'src/main.ts': 'code' },
      { src: '', 'src/': '' },
      { '/': '' },
      { 'src//': '' },
      { 'src/../': '' },
      { 'main.ts': 'a'.repeat(16001) },
    ]) {
      expect(filesSchema.safeParse(files).success).toBe(false);
    }
  });

  it('rejects client-provided status, ownership, approval and snapshot results', () => {
    const save = { revision: 0, notes: '', files: {} };

    expect(saveSchema.safeParse(save).success).toBe(true);

    for (const field of [
      'currentStep',
      'status',
      'userId',
      'roadmapId',
      'approved',
    ]) {
      const forgedSave = { ...save, [field]: 'forged' };

      expect(saveSchema.safeParse(forgedSave).success).toBe(false);
    }

    const forgedAttempt = {
      revision: 0,
      stepId: 'validate-input',
      result: { approved: true },
    };

    expect(attemptSchema.safeParse(forgedAttempt).success).toBe(false);

    expect(saveSchema.safeParse({ ...save, revision: -1 }).success).toBe(false);
    expect(saveSchema.safeParse({ ...save, revision: 1e20 }).success).toBe(
      false,
    );
  });
});
