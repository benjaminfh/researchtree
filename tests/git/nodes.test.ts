// Copyright (c) 2025 Benjamin F. Hall. All rights reserved.

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { appendNode, deleteProject, getNode, getNodes, initProject } from '../../src/git';
import { setProjectsRoot } from '../../src/git/constants';
import type { NodeRecord } from '../../src/git/types';
import {
  assertValidUUID,
  ensureTestProjectsRoot,
  generateTestProjectName,
  getCommitCount,
  readProjectFile,
  clearAllTestProjects,
  getTestProjectsRoot
} from './test-utils';
import { simpleGit } from 'simple-git';
import { getProjectPath } from '../../src/git/utils';

let projectId: string;
const TEST_ROOT = getTestProjectsRoot('nodes');

beforeAll(async () => {
  await clearAllTestProjects(TEST_ROOT);
  await ensureTestProjectsRoot(TEST_ROOT);
});

beforeEach(async () => {
  setProjectsRoot(TEST_ROOT);
  const project = await initProject(generateTestProjectName());
  projectId = project.id;
});

afterEach(async () => {
  if (projectId) {
    await deleteProject(projectId).catch(() => undefined);
  }
});

afterAll(async () => {
  // keep projects root intact
});

describe('Node operations', () => {
  it('appendNode creates complete node with all fields for each type', async () => {
    const messageNode = await appendNode(projectId, {
      type: 'message',
      role: 'user',
      content: 'Hello'
    });

    const stateNode = await appendNode(projectId, {
      type: 'state',
      artefactSnapshot: 'a'.repeat(40)
    });

    const mergeNode = await appendNode(projectId, {
      type: 'merge',
      mergeFrom: 'feature',
      mergeSummary: 'summary',
      sourceCommit: 'b'.repeat(40),
      sourceNodeIds: ['node-123']
    });

    expect(messageNode.parent).toBeNull();
    expect(stateNode.parent).toBe(messageNode.id);
    expect(mergeNode.parent).toBe(stateNode.id);

    [messageNode, stateNode, mergeNode].forEach((node) => {
      assertValidUUID(node.id);
      expect(typeof node.timestamp).toBe('number');
      expect(typeof node.createdOnRefId).toBe('string');
    });

    expect(messageNode.role).toBe('user');
    expect(messageNode.content).toBe('Hello');
    expect(stateNode.artefactSnapshot).toBe('a'.repeat(40));
    expect(mergeNode.mergeFrom).toBe('feature');
    expect(mergeNode.mergeSummary).toBe('summary');
    expect(mergeNode.sourceNodeIds).toEqual(['node-123']);
    expect(mergeNode.mergeFromRefId).toBeUndefined();
  });

  it('appendNode chains parent references correctly', async () => {
    const node1 = await appendNode(projectId, { type: 'message', role: 'system', content: 'one' });
    const node2 = await appendNode(projectId, { type: 'message', role: 'user', content: 'two' });
    const node3 = await appendNode(projectId, { type: 'message', role: 'assistant', content: 'three' });

    expect(node1.parent).toBeNull();
    expect(node2.parent).toBe(node1.id);
    expect(node3.parent).toBe(node2.id);
  });

  it('appendNode writes to the specified ref', async () => {
    await appendNode(projectId, { type: 'message', role: 'user', content: 'main-1' });
    const git = simpleGit(getProjectPath(projectId));
    await git.checkoutLocalBranch('feature');

    await appendNode(projectId, { type: 'message', role: 'user', content: 'feature-1' }, { ref: 'feature' });
    const featureNodes = await getNodes(projectId);
    expect(featureNodes[featureNodes.length - 1].content).toBe('feature-1');

    await git.checkout('main');
    const mainNodes = await getNodes(projectId);
    expect(mainNodes[mainNodes.length - 1].content).toBe('main-1');
  });

  it('appendNode persists to JSONL and creates git commit', async () => {
    const initialCommits = await getCommitCount(projectId);
    await appendNode(projectId, { type: 'message', role: 'user', content: 'first' });
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'second' });

    const raw = await readProjectFile(projectId, 'nodes');
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines).toHaveLength(2);

    const parsed = lines.map((line) => JSON.parse(line) as NodeRecord);
    expect(parsed[0].content).toBe('first');
    expect(parsed[1].content).toBe('second');

    const commitCount = await getCommitCount(projectId);
    expect(commitCount).toBe(initialCommits + 2);
  });

  it('getNodes returns empty array for new project', async () => {
    const nodes = await getNodes(projectId);
    expect(nodes).toHaveLength(0);
  });

  it('getNodes returns all nodes in order', async () => {
    await appendNode(projectId, { type: 'message', role: 'user', content: 'one' });
    await appendNode(projectId, { type: 'message', role: 'assistant', content: 'two' });
    await appendNode(projectId, { type: 'message', role: 'user', content: 'three' });

    const nodes = await getNodes(projectId);
    expect(nodes.map((n) => n.content)).toEqual(['one', 'two', 'three']);
  });

  it('getNode returns node by ID', async () => {
    const first = await appendNode(projectId, { type: 'message', role: 'user', content: 'one' });
    const second = await appendNode(projectId, { type: 'message', role: 'assistant', content: 'two' });
    await appendNode(projectId, { type: 'message', role: 'user', content: 'three' });

    const found = await getNode(projectId, second.id);
    expect(found?.id).toBe(second.id);
    expect(found?.parent).toBe(first.id);
    expect(found?.content).toBe('two');
  });

  it('getNode returns null for non-existent ID', async () => {
    const found = await getNode(projectId, 'non-existent');
    expect(found).toBeNull();
  });
});
