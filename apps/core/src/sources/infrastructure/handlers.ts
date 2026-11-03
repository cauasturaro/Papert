import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../../app.module.js';
import { SourceService } from '../application/source.service.js';

let context: Promise<INestApplicationContext> | undefined;

async function sources() {
  context ??= NestFactory.createApplicationContext(AppModule);
  const app = await context;

  return app.get(SourceService);
}

// This Lambda has no HTTP event. Only the ingestion role may invoke it through IAM.
export async function sourceControl(event: unknown) {
  const service = await sources();

  return service.control(event);
}

export async function maintenance() {
  const service = await sources();

  const result = await service.maintenance();
  console.info(JSON.stringify({ metric: 'source_maintenance', ...result }));

  return result;
}
