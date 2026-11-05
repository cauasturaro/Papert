import { ExecutionError } from './execution.js';
import {
  admittedNoteIds,
  assertMentionsReady,
  withLiveNotes,
} from './tutor-context.js';

const ready = [{ id: 'a', filename: 'guide.pdf', format: 'pdf' }];

describe('tutor context rules', () => {
  it('accepts mentions of ready sources only', () => {
    expect(() => assertMentionsReady(undefined, [])).not.toThrow();
    expect(() => assertMentionsReady(['a'], ready)).not.toThrow();
    expect(() => assertMentionsReady(['b'], ready)).toThrow(ExecutionError);
  });

  it('drops durable notes that no longer exist and leaves other input alone', () => {
    const input = {
      kind: 'chat',
      memory: [
        { id: 'kept', kind: 'preference', text: 'Short answers' },
        { id: 'deleted', kind: 'difficulty', text: 'Closures' },
      ],
    };

    const filtered = withLiveNotes(input, ['kept']);
    const analysis = withLiveNotes({ kind: 'analysis' }, []);

    expect(admittedNoteIds(input)).toEqual(['kept', 'deleted']);
    expect(filtered).toEqual({
      kind: 'chat',
      memory: [{ id: 'kept', kind: 'preference', text: 'Short answers' }],
    });
    expect(analysis).toEqual({ kind: 'analysis' });
  });
});
