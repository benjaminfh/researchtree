import path from 'path';

export let PROJECTS_ROOT = process.env.RESEARCHTREE_PROJECTS_ROOT
  ? path.resolve(process.env.RESEARCHTREE_PROJECTS_ROOT)
  : path.join(process.cwd(), 'data', 'projects');
export function setProjectsRoot(rootPath: string): void {
  if (!rootPath) {
    throw new Error('projectsRoot must be a non-empty path');
  }
  PROJECTS_ROOT = path.resolve(rootPath);
}
export const INITIAL_BRANCH = 'main';

export const PROJECT_FILES = {
  nodes: 'nodes.jsonl',
  artefact: 'artefact.md',
  stars: 'stars.json',
  metadata: 'project.json',
  readme: 'README.md'
} as const;

export const DEFAULT_USER = {
  name: 'ResearchTree',
  email: 'researchtree@example.com'
};

export const COMMIT_SUMMARY_LIMIT = 72;
