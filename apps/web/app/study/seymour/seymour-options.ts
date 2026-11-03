export type SeymourOption = {
  value: string;
  label: string;
  description: string;
};

// Short labels fit the composer pills; descriptions explain the choice below it.
export const tutorModes: SeymourOption[] = [
  { value: "doubt", label: "Doubt", description: "a focused hint" },
  { value: "teaching", label: "Teaching", description: "step by step" },
  {
    value: "review",
    label: "Review",
    description: "logic, contracts, structure and security",
  },
  {
    value: "solution",
    label: "Solution guidance",
    description: "after three saved attempts",
  },
];

export const reasoningEfforts: SeymourOption[] = [
  { value: "low", label: "Low", description: "direct response" },
  { value: "medium", label: "Medium", description: "balanced reasoning" },
  { value: "high", label: "High", description: "thinking enabled" },
];

export function describe(options: SeymourOption[], value: string) {
  const option = options.find((item) => item.value === value);

  return option ? `${option.label} — ${option.description}` : value;
}
