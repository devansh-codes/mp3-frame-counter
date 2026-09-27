import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'], // process entry point: covered by the end-to-end smoke test
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
});
