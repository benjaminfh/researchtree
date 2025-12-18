import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import {
  appendNode,
  createBranch,
  deleteProject,
  getCurrentBranch,
  getNodes,
  initProject,
  listBranches,
  mergeBranch,
  switchBranch
} from '../../src/git';
import { setProjectsRoot } from '../../src/git/constants';
import {
  assertValidCommitHash,
  ensureTestProjectsRoot,
  generateTestProjectName,
  getGitLog,
  readProjectFile,
  clearAllTestProjects,
  getTestProjectsRoot
} from './test-utils';

let projectId: string;
const TEST_ROOT = getTestProjectsRoot('branches');

beforeAll(async () => {
  await clearAllTestProjects(TEST_ROOT);
  await ensureTestProjectsRoot(TEST_ROOT);
});

beforeEach(async () => {
  setProjectsRoot(TEST_ROOT);
  const project = await initProject(generateTestProjectName());
  projectId = project.id;
  await appendNode(projectId, { type: 'message', role: 'system', content: 'Initial' });
});

afterEach(async () => {
  if (projectId) {
    await deleteProject(projectId).catch(() => undefined);
  }
});

afterAll(async () => {
  // keep projects root intact
});

describe('Branch operations', () => {
  it('getCurrentBranch returns main initially', async () => {
    const current = await getCurrentBranch(projectId);
    expect(current).toBe('main');
  });

  it('createBranch creates and switches to new branch from trunk', async () => {
    await createBranch(projectId, 'feature');
    const current = await getCurrentBranch(projectId);
    expect(current).toBe('feature');

    const nodes = await getNodes(projectId);
    expect(nodes[nodes.length - 1].content).toBe('Initial');
  });

  it('createBranch works from any branch', async () => {
    await createBranch(projectId, 'feature-a');
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Feature A' });
    await createBranch(projectId, 'feature-a-variant');
    const current = await getCurrentBranch(projectId);
    expect(current).toBe('feature-a-variant');
  });

  it('createBranch throws error if branch already exists', async () => {
    await createBranch(projectId, 'duplicate');
    await expect(createBranch(projectId, 'duplicate')).rejects.toThrow();
  });

  it('switchBranch changes current branch', async () => {
    await createBranch(projectId, 'feature');
    await switchBranch(projectId, 'main');
    expect(await getCurrentBranch(projectId)).toBe('main');
    await switchBranch(projectId, 'feature');
    expect(await getCurrentBranch(projectId)).toBe('feature');
  });

  it('switchBranch throws error if branch does not exist', async () => {
    await expect(switchBranch(projectId, 'non-existent')).rejects.toThrow();
  });

  it('listBranches returns all branches with complete metadata', async () => {
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Second' });
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Third' });
    await createBranch(projectId, 'feature-a');
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Feature Node' });
    await switchBranch(projectId, 'main');
    await createBranch(projectId, 'feature-b');

    const branches = await listBranches(projectId);
    expect(branches).toHaveLength(3);

    const main = branches.find((b) => b.name === 'main');
    const featureA = branches.find((b) => b.name === 'feature-a');
    const featureB = branches.find((b) => b.name === 'feature-b');

    expect(main?.isTrunk).toBe(true);
    expect((main?.nodeCount ?? 0) >= 3).toBe(true);
    assertValidCommitHash(main?.headCommit ?? '');

    expect(featureA?.isTrunk).toBe(false);
    expect((featureA?.nodeCount ?? 0) >= 4).toBe(true);

    expect(featureB?.isTrunk).toBe(false);
  });

  it('mergeBranch creates merge node on current branch', async () => {
    await createBranch(projectId, 'feature');
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Feature work' });
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Feature answer' });
    await switchBranch(projectId, 'main');
    const mergeNode = await mergeBranch(projectId, 'feature', 'Merged feature');

    expect(mergeNode.type).toBe('merge');
    expect(mergeNode.mergedAssistantContent).toBe('Feature answer');
    const nodes = await getNodes(projectId);
    expect(nodes[nodes.length - 1].type).toBe('merge');
  });

  it('mergeBranch merge node contains correct metadata', async () => {
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Main second' });
    await createBranch(projectId, 'feature');
    const nodeIds: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const node = await appendNode(projectId, { type: 'message', role: 'user', content: `Feature ${i}` });
      nodeIds.push(node.id);
    }
    const payload = await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Final feature payload' });
    nodeIds.push(payload.id);
    await switchBranch(projectId, 'main');
    const mergeNode = await mergeBranch(projectId, 'feature', 'Test merge summary');

    expect(mergeNode.mergeFrom).toBe('feature');
    expect(mergeNode.mergeSummary).toBe('Test merge summary');
    assertValidCommitHash(mergeNode.sourceCommit);
    expect(mergeNode.sourceNodeIds).toEqual(nodeIds);
    expect(mergeNode.mergedAssistantNodeId).toBe(payload.id);
    expect(mergeNode.mergedAssistantContent).toBe('Final feature payload');
  });

  it('mergeBranch works when merging to non-trunk branch', async () => {
    await createBranch(projectId, 'feature-a');
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Feature A' });
    await createBranch(projectId, 'feature-a-variant');
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Variant work' });
    await switchBranch(projectId, 'feature-a');

    const mergeNode = await mergeBranch(projectId, 'feature-a-variant', 'Merge variant');
    expect(mergeNode.mergeFrom).toBe('feature-a-variant');
  });

  it('mergeBranch preserves git DAG structure', async () => {
    await createBranch(projectId, 'feature');
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Feature work' });
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Feature answer' });
    await switchBranch(projectId, 'main');
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Main work' });
    await mergeBranch(projectId, 'feature', 'Merge feature');

    const log = await getGitLog(projectId);
    expect(log.includes('*   ')).toBe(true);
  });

  it('mergeBranch preserves branch history after merge', async () => {
    await createBranch(projectId, 'feature');
    const createdNodes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const node = await appendNode(projectId, { type: 'message', role: 'user', content: `Feature ${i}` });
      createdNodes.push(node.id);
    }
    const payload = await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Feature payload' });
    createdNodes.push(payload.id);
    await switchBranch(projectId, 'main');
    await mergeBranch(projectId, 'feature', 'Merge feature');
    await switchBranch(projectId, 'feature');

    const nodes = await getNodes(projectId);
    expect(nodes.map((n) => n.id).slice(-4)).toEqual(createdNodes);
    expect(nodes.some((n) => n.type === 'merge')).toBe(false);
  });

  it('mergeBranch uses git merge -s ours strategy', async () => {
    await appendNode(projectId, { type: 'message', role: 'user', content: 'Main content' });
    await createBranch(projectId, 'feature');
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Feature content' });
    await switchBranch(projectId, 'main');
    await mergeBranch(projectId, 'feature', 'Merge feature');

    const nodes = await getNodes(projectId);
    const merge = nodes.find((n) => n.type === 'merge');
    expect(merge?.type).toBe('merge');
    expect(merge && merge.type === 'merge' ? merge.mergedAssistantContent : null).toBe('Feature content');
    expect(nodes.some((n) => n.type === 'message' && n.content === 'Feature content')).toBe(false);
  });
});
