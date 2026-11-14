import { workspaceFilesProblem } from './workspace-files.js';

it.each<Record<string, string>>([
  { src: '', 'src/main.ts': '' },
  { src: '', 'src/': '' },
  { 'src/': 'content' },
])('rejects a file/directory collision or a nonempty marker: %j', (files) => {
  const problems = workspaceFilesProblem(files);

  expect(problems).toContain(
    'Directories must be empty markers and cannot overlap files.',
  );
});

it('allows empty markers with nested files', () => {
  const files = { 'src/': '', 'src/main.ts': 'export {};' };

  const problems = workspaceFilesProblem(files);

  expect(problems).toEqual([]);
});
