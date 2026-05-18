import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // PGlite is single-process; spinning multiple parallel workers each
    // with their own PGlite instance can hit resource contention. Keep
    // tests serial within this small repo. Consumers with large suites
    // can override.
    fileParallelism: false,
  },
});
