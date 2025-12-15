import path from 'path';

export const PROJECTS_ROOT = path.join(process.cwd(), 'projects');
export const INITIAL_BRANCH = 'main';

export const PROJECT_FILES = {
  nodes: 'nodes.jsonl',
  artefact: 'artefact.md',
  metadata: 'project.json',
  readme: 'README.md'
} as const;

export const DEFAULT_USER = {
  name: 'ResearchTree',
  email: 'researchtree@example.com'
};

export const COMMIT_SUMMARY_LIMIT = 72;
