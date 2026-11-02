import type { Handler } from 'aws-lambda';
import { NestFactory } from '@nestjs/core';
import { configure as serverlessExpress } from '@vendia/serverless-express';
import { AppModule } from './app.module.js';
import { configureHttp } from './http.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  await app.init();

  return serverlessExpress({ app: app.getHttpAdapter().getInstance() });
}

let server: ReturnType<typeof bootstrap> | undefined;

export const handler: Handler = async (event, context, callback) => {
  server ??= bootstrap();
  const proxy = await server;

  return proxy(event, context, callback);
};
