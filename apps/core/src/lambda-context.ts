import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from './app.module.js';

let context: Promise<INestApplicationContext> | undefined;

// Built on the first invocation and reused while the Lambda container stays warm.
export function applicationContext() {
  context ??= NestFactory.createApplicationContext(AppModule);

  return context;
}
