function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

/** Tab titles; files sharing a name also show their folder, such as "index.ts · src/api". */
export function tabTitles(tabs: string[]) {
  const counts = new Map<string, number>();

  for (const path of tabs) {
    const name = fileName(path);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return new Map(
    tabs.map((path) => {
      const name = fileName(path);
      const folder = path.split("/").slice(0, -1).join("/");
      const ambiguous = (counts.get(name) ?? 0) > 1;

      return [path, { name, folder: ambiguous ? folder || "/" : null }];
    }),
  );
}
