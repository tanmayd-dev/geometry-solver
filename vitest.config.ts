import { defineConfig } from 'vitest/config';

// The node environment is deliberate (pure state logic, no DOM/canvas).
// Future App/React tests will need jsdom or happy-dom plus merging
// vite.config.ts (@vitejs/plugin-react) via mergeConfig.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
