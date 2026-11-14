import { z } from 'zod';
import { citationLocation } from '../../../common/application/contracts/citation-location.contract.js';
import { generatedRoadmapProblem } from '../../domain/roadmap-draft.js';
import type { GeneratedRoadmap } from '../../domain/roadmap-draft.js';
import { roadmapSchema } from './study.contract.js';

// Wire format of the `roadmap` field on Seymour's completed generation event.
const candidateSchema = z.strictObject({
  definition: roadmapSchema,
  evidence: z
    .array(
      z.strictObject({
        stepId: z.string().regex(/^[a-z0-9-]+$/),
        sourceId: z.guid(),
        cite: z.string().min(1).max(400),
        location: citationLocation,
      }),
    )
    .max(20),
});

/** Valid JSON is not enough: the definition must also meet the generated-roadmap rules. */
export function parseGeneratedRoadmap(value: unknown): GeneratedRoadmap | null {
  const parsed = candidateSchema.safeParse(value);

  if (!parsed.success) {
    return null;
  }

  if (generatedRoadmapProblem(parsed.data.definition) !== null) {
    return null;
  }

  return parsed.data;
}
