import { NestFactory } from '@nestjs/core';
import { configureHttp } from './http.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureHttp(app);
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
