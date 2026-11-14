/** Roadmap vocabulary shared by study, generation and the community catalog. */

export type Level = "beginner" | "intermediate" | "advanced";

export type Challenge = {
  instructions: string;
  criteria: { id: string; description: string }[];
};

export const LEVELS: { value: Level; label: string; hint: string }[] = [
  {
    value: "beginner",
    label: "Beginner",
    hint: "New to this stack; small steps and explained vocabulary.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "Writes basic code here; focus on structure and contracts.",
  },
  {
    value: "advanced",
    label: "Advanced",
    hint: "Fluent with the basics; focus on design trade-offs.",
  },
];

export function levelLabel(level: Level | null | undefined) {
  return LEVELS.find((option) => option.value === level)?.label ?? null;
}
