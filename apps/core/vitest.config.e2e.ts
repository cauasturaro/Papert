import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Suites share one database; global sweeps must not see another file's rows mid-test.
    fileParallelism: false,
  },
});
