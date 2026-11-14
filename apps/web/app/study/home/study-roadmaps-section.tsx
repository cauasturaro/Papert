"use client";

import { StudyRoadmapCard } from "./study-roadmap-card";
import type { useStudyHome } from "./use-study-home";

export function StudyRoadmapsSection({ home }: { home: ReturnType<typeof useStudyHome> }) {
  const { others, recent, start, startingFor, errorFor } = home;

  if (others.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="roadmaps-title" className="space-y-3">
      <h2
        id="roadmaps-title"
        className="text-sm font-medium text-muted-foreground"
      >
        {recent ? "Your other roadmaps" : "Your roadmaps"}
      </h2>

      {others.map((item) => (
        <StudyRoadmapCard
          key={item.roadmap.id}
          item={item}
          starting={startingFor(item.roadmap.id)}
          error={errorFor(item.roadmap.id)}
          onStart={() => start(item.roadmap.id)}
        />
      ))}
    </section>
  );
}
