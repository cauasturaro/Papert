// Pure helpers for @-mentions of workspace sources and saved code files in the Seymour composer.

// Sources are uploaded documents; files are saved workspace paths Seymour reads by name.
export type MentionTarget = {
  id: string;
  filename: string;
  kind?: "source" | "file";
};

export type MentionQuery = { start: number; query: string };

export const MAX_MENTIONS = 5;

/** The `@query` being typed right before the caret, if any. */
export function mentionAt(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)@([^\n@]{0,60})$/.exec(before);

  if (!match) {
    return null;
  }

  return { start: caret - match[1].length - 1, query: match[1] };
}

/** Like `mentionAt`, but a token that already names a target is complete, not open. */
export function openMention(
  text: string,
  caret: number,
  targets: MentionTarget[],
) {
  const mention = mentionAt(text, caret);

  if (!mention) {
    return null;
  }

  const complete = targets.some((target) =>
    mention.query.startsWith(target.filename),
  );

  return complete ? null : mention;
}

export function matchingTargets<T extends MentionTarget>(
  targets: T[],
  query: string,
) {
  const needle = query.trim().toLowerCase();

  return targets.filter((target) =>
    target.filename.toLowerCase().includes(needle),
  );
}

/** Replaces the typed `@query` with `@filename ` and returns the new caret. */
export function insertMention(
  text: string,
  mention: MentionQuery,
  caret: number,
  filename: string,
) {
  const token = `@${filename} `;
  const updated = text.slice(0, mention.start) + token + text.slice(caret);

  return { text: updated, caret: mention.start + token.length };
}

/** Saved code files as mention targets; folders cannot be mentioned. */
export function fileTargets(paths: string[]): MentionTarget[] {
  return paths
    .filter((path) => !path.endsWith("/"))
    .map((path) => ({ id: `file:${path}`, filename: path, kind: "file" }));
}

/** Sources still referenced in the text; deleting the token removes the mention. */
export function mentionedTargets<T extends MentionTarget>(
  text: string,
  targets: T[],
) {
  return targets
    .filter((target) => text.includes(`@${target.filename}`))
    .slice(0, MAX_MENTIONS);
}
