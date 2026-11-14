import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The theme adds control heights to the spacing scale; without them a caller's
// `h-auto` would not replace a component's `h-control-sm`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["control-sm", "control-md", "control-lg"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
