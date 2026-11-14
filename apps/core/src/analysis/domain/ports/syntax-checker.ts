import type { Language, Position } from '../syntax.js';

export interface SyntaxChecker {
  check(language: Language, source: string): Promise<Position[]>;
}
