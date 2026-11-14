import type { Evaluation, Workspace } from "./study-api";

export type Finding = Evaluation["findings"][number] & {
  line?: number | null;
};

export type SolutionProgress = NonNullable<Workspace["solution"]>;
