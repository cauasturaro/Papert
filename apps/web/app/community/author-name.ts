export const AUTHOR_NAME_MIN = 2;
export const AUTHOR_NAME_MAX = 40;

const RESERVED = ["papert", "seymour"];

/** Same rule as Core: 2–40 code points of letters, digits, spaces, dots, hyphens or underscores. */
export function authorNameProblem(name: string) {
  const length = Array.from(name).length;

  if (length < AUTHOR_NAME_MIN || length > AUTHOR_NAME_MAX) {
    return "Use 2 to 40 characters.";
  }

  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name)) {
    return "Start with a letter or digit, and use only letters, digits, spaces, dots, hyphens or underscores.";
  }

  const normalized = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

  if (RESERVED.some((reserved) => normalized.includes(reserved))) {
    return "Papert and Seymour are reserved names.";
  }

  return null;
}
