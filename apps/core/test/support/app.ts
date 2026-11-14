import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureHttp } from '../../src/http.js';

export async function createTestApp(
  configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (
    builder,
  ) => builder,
) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  const module = await configure(builder).compile();

  const app = module.createNestApplication();
  configureHttp(app);
  await app.init();

  return { app, module };
}
