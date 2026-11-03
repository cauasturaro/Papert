import { ExecutionError } from './execution.js';
import { assertMentionsReady, recentTurns } from './tutor-context.js';

const ready = [{ id: 'a', filename: 'guide.pdf', format: 'pdf' }];

describe('tutor context rules', () => {
  it('accepts mentions of ready sources only', () => {
    expect(() => assertMentionsReady(undefined, [])).not.toThrow();
    expect(() => assertMentionsReady(['a'], ready)).not.toThrow();
    expect(() => assertMentionsReady(['b'], ready)).toThrow(ExecutionError);
  });

  it('keeps the last three tutor exchanges, oldest first', () => {
    const newestFirst = [
      { input: { kind: 'chat', mode: 'doubt', prompt: 'fourth' }, text: '4' },
      { input: { kind: 'analysis' }, text: 'ignored analysis' },
      { input: { kind: 'chat', mode: 'teaching', prompt: 'third' }, text: '3' },
      { input: { kind: 'chat', prompt: 'transport job' }, text: 'ignored' },
      { input: { kind: 'chat', mode: 'doubt', prompt: 'second' }, text: '2' },
      { input: { kind: 'chat', mode: 'doubt', prompt: 'first' }, text: '1' },
    ];

    const turns = recentTurns(newestFirst);

    expect(turns).toEqual([
      { prompt: 'second', answer: '2' },
      { prompt: 'third', answer: '3' },
      { prompt: 'fourth', answer: '4' },
    ]);
  });
});
