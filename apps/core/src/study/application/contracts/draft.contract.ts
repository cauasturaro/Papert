import { z } from 'zod';
import { GOAL_MAX, GOAL_MIN } from '../../domain/roadmap-draft.js';
import { levelSchema } from './study.contract.js';

export const createDraftSchema = z.strictObject({
  goal: z.string().trim().min(GOAL_MIN).max(GOAL_MAX),
  level: levelSchema,
});

export const emptyBodySchema = z.strictObject({});
