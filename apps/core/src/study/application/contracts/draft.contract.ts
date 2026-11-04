import { z } from 'zod';
import { GOAL_MAX, GOAL_MIN } from '../../domain/roadmap-draft.js';
import { levelSchema } from './study.contract.js';

export const createDraftSchema = z
  .object({
    goal: z.string().trim().min(GOAL_MIN).max(GOAL_MAX),
    level: levelSchema,
  })
  .strict();

export const emptyBodySchema = z.object({}).strict();
