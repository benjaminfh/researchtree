import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['tests/server/**/*.test.{ts,tsx}', 'node'],
      ['tests/git/**/*.test.{ts,tsx}', 'node']
    ],
    setupFiles: ['tests/setup.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      '@git': path.resolve(__dirname, 'src/git')
    }
  }
});
