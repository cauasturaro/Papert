import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../app.module.js';
import { FeedbackService } from '../application/feedback.service.js';

let context: Promise<INestApplicationContext> | undefined;

/** Scheduled delivery of learner verdicts that Langfuse has not received yet. */
export async function maintenance() {
  context ??= NestFactory.createApplicationContext(AppModule);
  const app = await context;

  const result = await app.get(FeedbackService).deliverDue();
  console.info(JSON.stringify({ metric: 'feedback_delivery', ...result }));

  return result;
}
