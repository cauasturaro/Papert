export type SeymourOption = {
  value: string;
  label: string;
  description: string;
};

/** Core's count of analyzed attempts toward Solution guidance for the current step. */
export type SolutionProgress = {
  analyzedAttempts: number;
  required: number;
  eligible: boolean;
};

// "doubt" stays the wire value; learners see it as Question.
export const tutorModes: SeymourOption[] = [
  {
    value: "doubt",
    label: "Question",
    description: "A focused hint for what you ask, without the full answer.",
  },
  {
    value: "teaching",
    label: "Teaching",
    description: "Explains the idea step by step, checking you follow.",
  },
  {
    value: "review",
    label: "Review",
    description: "Reviews your saved code: logic, structure and security.",
  },
  {
    value: "solution",
    label: "Solution",
    description: "Walks through a solution once you have tried on your own.",
  },
];

export const reasoningEfforts: SeymourOption[] = [
  { value: "low", label: "Quick", description: "A fast, direct reply." },
  {
    value: "medium",
    label: "Balanced",
    description: "Thinks a little longer before replying.",
  },
  {
    value: "high",
    label: "Thorough",
    description: "Thinks carefully; takes the longest.",
  },
];

export function optionLabel(options: SeymourOption[], value: string) {
  const option = options.find((item) => item.value === value);

  return option?.label ?? value;
}

export function describe(options: SeymourOption[], value: string) {
  const option = options.find((item) => item.value === value);

  return option ? `${option.label}: ${option.description}` : value;
}

/** Why a mode cannot be chosen right now, or null when it can. */
export function modeUnavailable(
  mode: string,
  {
    solution,
    roadmapCompleted,
  }: { solution?: SolutionProgress | null; roadmapCompleted?: boolean },
) {
  if (roadmapCompleted && (mode === "solution" || mode === "review")) {
    return "Not available after the roadmap is complete.";
  }

  if (mode !== "solution" || !solution || solution.eligible) {
    return null;
  }

  return `Unlocks after ${solution.required} analyzed attempts · ${solution.analyzedAttempts} so far`;
}
