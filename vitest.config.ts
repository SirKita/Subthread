import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Phase 0 tests are pure logic; switch a file to happy-dom with
    // `// @vitest-environment happy-dom` once DOM-dependent tests arrive.
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
