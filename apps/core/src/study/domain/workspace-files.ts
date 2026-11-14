export function workspaceFilesProblem(files: Record<string, string>): string[] {
  const problems: string[] = [];
  const paths = Object.keys(files);

  for (const entry of paths) {
    const directory = entry.endsWith('/');
    const name = directory ? entry.slice(0, -1) : entry;
    const parts = name.split('/');
    const ancestors = parts
      .slice(0, -1)
      .map((_, index) => parts.slice(0, index + 1).join('/'));
    const collides =
      ancestors.some((ancestor) => Object.hasOwn(files, ancestor)) ||
      (directory && Object.hasOwn(files, name));

    if (collides || (directory && files[entry] !== '')) {
      problems.push(
        'Directories must be empty markers and cannot overlap files.',
      );
    }
  }

  return problems;
}
