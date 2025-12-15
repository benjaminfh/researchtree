import path from 'path';
import { mkdirSync } from 'fs';
import { defineConfig } from 'vitest/config';

const testProjectsRoot = path.join(process.cwd(), '.test-projects');
mkdirSync(testProjectsRoot, { recursive: true });

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    watch: false,
    threads: false,
    sequence: {
      concurrent: false
    },
    env: {
      RESEARCHTREE_PROJECTS_ROOT: testProjectsRoot
    }
  }
});
