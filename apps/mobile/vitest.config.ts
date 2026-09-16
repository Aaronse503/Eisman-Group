import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Covers the parts of the app that are plain logic — the offline queue, the
 * deep-link map — without a simulator. Screens are checked by driving the app
 * itself; see MOBILE.md.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
});
