import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="font-semibold">{title}</h4>
      {children}
    </section>
  );
}
