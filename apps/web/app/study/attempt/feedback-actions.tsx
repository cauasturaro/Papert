export type OpenLocation = (path: string, line?: number) => void;

// `mode` suggests a Seymour mode; callers may ignore it.
export type AskSeymour = (
  prompt: string,
  options?: { mode?: "teaching" },
) => void;

export { Location } from "./location";
export { AskButton } from "./ask-button";
