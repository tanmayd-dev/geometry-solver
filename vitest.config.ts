import { defineConfig } from 'vitest/config';

// Tests target the pure state/construction logic in src/state.ts,
// which has no DOM dependencies, so a node environment suffices.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
