// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  appendNode,
  createBranch,
  deleteProject,
  getArtefact,
  getCurrentBranch,
  getNodes,
  initProject,
  mergeBranch,
  switchBranch,
  updateArtefact
} from '../../src/git';
import { setProjectsRoot } from '../../src/git/constants';
import { ensureTestProjectsRoot, generateTestProjectName, getGitLog, clearAllTestProjects, getTestProjectsRoot } from './test-utils';

const TEST_ROOT = getTestProjectsRoot('integration');

describe('Integration workflow', () => {
  beforeAll(async () => {
    await clearAllTestProjects(TEST_ROOT);
    await ensureTestProjectsRoot(TEST_ROOT);
  });

  afterAll(async () => {
    // keep projects root intact
  });

  it('complete branching and merging workflow', async () => {
    setProjectsRoot(TEST_ROOT);
    const project = await initProject(generateTestProjectName());
    const projectId = project.id;

    try {
      expect((await getNodes(projectId)).length).toBe(0);
      expect(await getArtefact(projectId)).toBe('');
      expect(await getCurrentBranch(projectId)).toBe('main');

      await appendNode(projectId, { type: 'message', role: 'system', content: 'System prompt' });
      await appendNode(projectId, { type: 'message', role: 'user', content: 'Hello' });
      await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Hi there' });
      await updateArtefact(projectId, '# Output\n\nGreeting completed');

      const mainNodes = await getNodes(projectId);
      expect(mainNodes.length).toBe(4);
      expect(mainNodes[3].type).toBe('state');

      await createBranch(projectId, 'explore-alternative');
      await appendNode(projectId, { type: 'message', role: 'user', content: 'Alternative question' });
      await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Alternative answer' });

      const branchNodes = await getNodes(projectId);
      expect(branchNodes.length).toBe(6);

      expect(await getArtefact(projectId)).toBe('# Output\n\nGreeting completed');

      await switchBranch(projectId, 'main');
      const mainNodesAfter = await getNodes(projectId);
      expect(mainNodesAfter.length).toBe(4);

      const mergeNode = await mergeBranch(projectId, 'explore-alternative', 'Explored alternative approach');
      expect(mergeNode.type).toBe('merge');
      expect(mergeNode.sourceNodeIds.length).toBe(2);
      expect(mergeNode.mergedAssistantContent).toBe('Alternative answer');

      const finalMainNodes = await getNodes(projectId);
      expect(finalMainNodes.length).toBe(5);

      const log = await getGitLog(projectId);
      expect(log.includes('*   ')).toBe(true);
      expect(log.includes('explore-alternative')).toBe(true);

      await switchBranch(projectId, 'explore-alternative');
      const preservedBranchNodes = await getNodes(projectId);
      expect(preservedBranchNodes.length).toBe(6);
      expect(preservedBranchNodes.some((n) => n.type === 'merge')).toBe(false);
    } finally {
      await deleteProject(projectId).catch(() => undefined);
    }
  });
});
