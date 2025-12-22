# Phase 1 Unit Test Specification

Test-driven development plan for the git backend core. Streamlined to focus on behavior, not implementation details.

## Testing Framework

- **Tool**: Vitest
- **Approach**: Write tests first, then implement
- **Test Location**: `tests/git/`
- **Philosophy**: One test per behavior, trust integration test for workflows

---

## 1. Project Operations (`tests/git/project.test.ts`)

### Setup/Teardown
```typescript
beforeEach: async () => {
  // Clean up any existing test projects
}

afterEach: async () => {
  // Delete test projects created during tests
}
```

### Test: "initProject creates complete valid structure"
- Call `initProject("Test Project", "Description")`
- Assert returned ID is valid UUID v4 format
- Assert directory exists at `projects/{id}/`
- Assert `.git` directory exists (git repo initialized)
- Assert `nodes.jsonl` exists and is empty
- Assert `artefact.md` exists and is empty
- Assert `project.json` exists
- Assert `README.md` exists
- Use git log to verify exactly 1 initial commit exists

### Test: "initProject creates valid metadata with and without description"
- Call `initProject("Project A", "Has description")`
- Read `project.json`, assert: id (UUID), name, description, createdAt (recent timestamp)
- Call `initProject("Project B")` (no description)
- Read `project.json`, assert description is undefined

### Test: "listProjects returns empty array when no projects exist"
- Ensure `projects/` directory is clean
- Call `listProjects()`
- Assert result is `[]`

### Test: "listProjects returns all projects with correct metadata"
- Create 3 projects with different names/descriptions
- Call `listProjects()`
- Assert result length is 3
- Assert each project has: id, name, createdAt, description fields

### Test: "getProject returns metadata for existing project"
- Create project, capture ID
- Call `getProject(id)`
- Assert returned metadata matches created project

### Test: "getProject returns null for non-existent project"
- Call `getProject("non-existent-uuid")`
- Assert result is `null`

### Test: "deleteProject removes project directory"
- Create 2 projects, capture IDs
- Call `deleteProject(firstId)`
- Assert directory no longer exists
- Call `listProjects()`
- Assert only second project remains

---

## 2. Node Operations (`tests/git/nodes.test.ts`)

### Setup/Teardown
```typescript
beforeEach: async () => {
  projectId = await initProject("Node Test Project")
}

afterEach: async () => {
  await deleteProject(projectId)
}
```

### Test: "appendNode creates complete node with all fields for each type"
- Append message node: `{ type: 'message', role: 'user', content: 'Hello' }`
  - Assert returned node has: id (UUID), timestamp (recent), parent: null, role, content
- Append state node: `{ type: 'state', artefactSnapshot: 'abc123' }`
  - Assert has: id, timestamp, parent (first node's id), artefactSnapshot
- Append merge node: `{ type: 'merge', mergeFrom: 'branch', mergeSummary: 'summary', sourceCommit: 'hash', sourceNodeIds: ['id1'] }`
  - Assert has: id, timestamp, parent (second node's id), all merge fields

### Test: "appendNode chains parent references correctly"
- Append 3 message nodes sequentially
- Assert node1.parent === null
- Assert node2.parent === node1.id
- Assert node3.parent === node2.id

### Test: "appendNode persists to JSONL and creates git commit"
- Get initial commit count
- Append 2 nodes
- Read `nodes.jsonl` raw content
- Split by newlines, filter empty
- Assert exactly 2 JSON lines
- Parse each line, verify matches appended nodes
- Get new commit count, assert increased by 2

### Test: "getNodes returns empty array for new project"
- Call `getNodes(projectId)`
- Assert result is `[]`

### Test: "getNodes returns all nodes in order"
- Append 3 nodes with different content
- Call `getNodes(projectId)`
- Assert length is 3
- Assert nodes appear in append order
- Assert all fields preserved correctly

### Test: "getNode returns node by ID"
- Append 3 nodes, capture second node's ID
- Call `getNode(projectId, secondNodeId)`
- Assert returned node matches second node

### Test: "getNode returns null for non-existent ID"
- Call `getNode(projectId, "non-existent-uuid")`
- Assert result is `null`

---

## 3. Branch Operations (`tests/git/branches.test.ts`)

### Setup/Teardown
```typescript
beforeEach: async () => {
  projectId = await initProject("Branch Test Project")
  // Append initial node so we have something to branch from
  await appendNode(projectId, { type: 'message', role: 'system', content: 'Initial' })
}

afterEach: async () => {
  await deleteProject(projectId)
}
```

### Test: "getCurrentBranch returns 'main' initially"
- Call `getCurrentBranch(projectId)`
- Assert result is "main"

### Test: "createBranch creates and switches to new branch from trunk"
- Call `createBranch(projectId, "feature")`
- Call `getCurrentBranch(projectId)`
- Assert current branch is "feature"
- Use git to verify branch exists and points to current HEAD

### Test: "createBranch works from any branch (branch-from-branch)"
- Create branch "feature-a" from main
- Append node on "feature-a"
- Create branch "feature-a-variant" from "feature-a"
- Call `getCurrentBranch(projectId)`
- Assert current branch is "feature-a-variant"
- Verify git branch exists

### Test: "createBranch throws error if branch already exists"
- Create branch "duplicate"
- Attempt to create "duplicate" again
- Assert error is thrown

### Test: "switchBranch changes current branch"
- Create branch "feature"
- Switch back to "main"
- Call `getCurrentBranch(projectId)`
- Assert current branch is "main"
- Call `switchBranch(projectId, "feature")`
- Assert current branch is "feature"

### Test: "switchBranch throws error if branch does not exist"
- Call `switchBranch(projectId, "non-existent")`
- Assert error is thrown

### Test: "listBranches returns all branches with complete metadata"
- Append 2 nodes on main (total 3 nodes)
- Create branch "feature-a"
- Append 1 node on "feature-a" (should have 4 total)
- Create branch "feature-b" from main
- Call `listBranches(projectId)`
- Assert result length is 3
- Find main branch:
  - Assert name is "main"
  - Assert isTrunk is true
  - Assert nodeCount >= 3
  - Assert headCommit is valid hash
- Find feature-a:
  - Assert isTrunk is false
  - Assert nodeCount >= 4
- Find feature-b:
  - Assert isTrunk is false

### Test: "mergeBranch creates merge node on current branch"
- Create branch "feature" from main, append node
- Switch back to main
- Call `mergeBranch(projectId, "feature", "Merged feature")`
- Get nodes on main
- Assert last node has type 'merge'

### Test: "mergeBranch merge node contains correct metadata"
- Append 2 nodes on main
- Create branch "feature"
- Append 3 nodes on "feature" (capture their IDs)
- Switch to main
- Call `mergeBranch(projectId, "feature", "Test merge summary")`
- Get merge node (last node)
- Assert mergeFrom === "feature"
- Assert mergeSummary === "Test merge summary"
- Assert sourceCommit is valid git hash
- Assert sourceNodeIds is array of 3 IDs (the branch-specific nodes)
- Assert sourceNodeIds matches the 3 node IDs from feature branch

### Test: "mergeBranch works when merging to non-trunk branch"
- Create branch "feature-a" from main
- Append node on "feature-a"
- Create branch "feature-a-variant" from "feature-a"
- Append node on "feature-a-variant"
- Switch back to "feature-a"
- Call `mergeBranch(projectId, "feature-a-variant", "Merge variant back to feature-a")`
- Assert no error thrown
- Get nodes on "feature-a"
- Assert last node is merge node with mergeFrom "feature-a-variant"

### Test: "mergeBranch preserves git DAG structure"
- Create branch "feature", append node
- Switch to main, append node
- Merge "feature" to main
- Use `git log --graph --all --oneline` to get graph
- Assert graph shows merge commit with 2 parents

### Test: "mergeBranch preserves branch history after merge"
- Create branch "feature"
- Append 3 nodes on "feature" (capture IDs)
- Switch to main, merge "feature"
- Switch back to "feature"
- Call `getNodes(projectId)`
- Assert all 3 original nodes still present
- Assert nodes.jsonl on branch unchanged by merge

### Test: "mergeBranch uses git merge -s ours strategy (trunk files unchanged)"
- Append node on main: "Main content"
- Create branch "feature"
- Append node on "feature": "Feature content"
- Switch to main
- Merge "feature"
- Read nodes.jsonl on main
- Assert main's nodes.jsonl contains main's node and merge node only
- Assert "Feature content" appears in sourceNodeIds metadata, not as direct node

---

## 4. Artefact Operations (`tests/git/artefact.test.ts`)

### Setup/Teardown
```typescript
beforeEach: async () => {
  projectId = await initProject("Artefact Test Project")
}

afterEach: async () => {
  await deleteProject(projectId)
}
```

### Test: "getArtefact returns empty string for new project"
- Call `getArtefact(projectId)`
- Assert result is `""`

### Test: "getArtefact returns current content"
- Update artefact with "Version 1"
- Call `getArtefact(projectId)`
- Assert result is "Version 1"
- Update artefact with "Version 2"
- Call `getArtefact(projectId)`
- Assert result is "Version 2"

### Test: "updateArtefact updates file and creates state node on trunk"
- Verify current branch is "main"
- Call `updateArtefact(projectId, "Artefact content")`
- Read `artefact.md` directly
- Assert file content is "Artefact content"
- Get all nodes
- Assert last node has type 'state'
- Assert state node has artefactSnapshot (valid 40-char git hash)
- Get latest git commit
- Assert commit includes both 'artefact.md' and 'nodes.jsonl'

### Test: "updateArtefact throws error if not on trunk"
- Create branch "feature"
- Switch to "feature"
- Attempt `updateArtefact(projectId, "Should fail")`
- Assert error is thrown
- Assert error message mentions "trunk" or "main"

### Test: "updateArtefact works after switching back to trunk"
- Create branch "feature"
- Switch back to "main"
- Call `updateArtefact(projectId, "Content")`
- Assert no error thrown
- Assert artefact updated

### Test: "getArtefact on branch shows trunk content (read-only)"
- Update artefact on main: "Main artefact"
- Create branch "feature"
- Switch to "feature"
- Call `getArtefact(projectId)`
- Assert content is "Main artefact" (inherited from trunk)
- Switch back to main
- Update artefact: "Updated main"
- Switch to "feature"
- Call `getArtefact(projectId)`
- Assert content is still "Main artefact" (branch point snapshot)

---

## 5. Integration Test (`tests/git/integration.test.ts`)

### Test: "complete branching and merging workflow"

Single comprehensive end-to-end test:

```typescript
// Setup
const projectId = await initProject("Integration Test")

// Initial state verification
assert((await getNodes(projectId)).length === 0)
assert((await getArtefact(projectId)) === "")
assert((await getCurrentBranch(projectId)) === "main")

// Build main conversation
await appendNode(projectId, { type: 'message', role: 'system', content: 'System prompt' })
await appendNode(projectId, { type: 'message', role: 'user', content: 'Hello' })
await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Hi there' })
await updateArtefact(projectId, "# Output\n\nGreeting completed")

const mainNodes = await getNodes(projectId)
assert(mainNodes.length === 4) // 3 messages + 1 state
assert(mainNodes[3].type === 'state')

// Create exploration branch
await createBranch(projectId, "explore-alternative")
await appendNode(projectId, { type: 'message', role: 'user', content: 'Alternative question' })
await appendNode(projectId, { type: 'message', role: 'assistant', content: 'Alternative answer' })

const branchNodes = await getNodes(projectId)
assert(branchNodes.length === 6) // inherited 4 + new 2

// Branch sees trunk artefact (read-only)
const branchArtefact = await getArtefact(projectId)
assert(branchArtefact === "# Output\n\nGreeting completed")

// Return to main (unchanged)
await switchBranch(projectId, "main")
const mainNodesAfter = await getNodes(projectId)
assert(mainNodesAfter.length === 4) // branch nodes not visible

// Merge branch back
const mergeNode = await mergeBranch(projectId, "explore-alternative", "Explored alternative approach")
assert(mergeNode.type === 'merge')
assert(mergeNode.mergeFrom === "explore-alternative")
assert(mergeNode.sourceNodeIds.length === 2) // 2 branch-specific nodes

const finalMainNodes = await getNodes(projectId)
assert(finalMainNodes.length === 5) // 4 original + 1 merge

// Verify git DAG structure
const gitLog = await getGitLog(projectId) // helper: git log --graph --all
assert(gitLog.includes('*   ')) // merge commit marker
assert(gitLog.includes('explore-alternative'))

// Branch history preserved
await switchBranch(projectId, "explore-alternative")
const preservedBranchNodes = await getNodes(projectId)
assert(preservedBranchNodes.length === 6) // full history intact
// Verify merge node is NOT on branch (only on trunk)
assert(!preservedBranchNodes.some(n => n.type === 'merge'))

// Cleanup
await deleteProject(projectId)
```

---

## 6. Test Utilities (`tests/git/test-utils.ts`)

Helper functions to keep tests clean:

```typescript
import { simpleGit } from 'simple-git'
import { v4 as uuidv4, validate as uuidValidate } from 'uuid'
import fs from 'fs/promises'
import path from 'path'

export function generateTestProjectName(): string {
  return `test-project-${Date.now()}`
}

export async function cleanupTestProjects(): Promise<void> {
  const projectsDir = path.join(process.cwd(), 'projects')
  // Clean up test projects (optional: only those matching test pattern)
}

export function assertValidUUID(id: string): void {
  if (!uuidValidate(id)) {
    throw new Error(`Invalid UUID: ${id}`)
  }
}

export function assertValidCommitHash(hash: string): void {
  if (!/^[0-9a-f]{40}$/i.test(hash)) {
    throw new Error(`Invalid git commit hash: ${hash}`)
  }
}

export async function getGitLog(projectId: string): Promise<string> {
  const repoPath = path.join(process.cwd(), 'projects', projectId)
  const git = simpleGit(repoPath)
  const log = await git.log(['--graph', '--all', '--oneline'])
  return log.all.map(l => l.hash + ' ' + l.message).join('\n')
}

export async function getCommitCount(projectId: string): Promise<number> {
  const repoPath = path.join(process.cwd(), 'projects', projectId)
  const git = simpleGit(repoPath)
  const log = await git.log()
  return log.total
}

export async function readProjectFile(
  projectId: string,
  filename: string
): Promise<string> {
  const filePath = path.join(process.cwd(), 'projects', projectId, filename)
  return await fs.readFile(filePath, 'utf-8')
}
```

---

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test project.test.ts

# Watch mode during TDD
npm test -- --watch

# Coverage report
npm test -- --coverage

# UI mode (visual test runner)
npm run test:ui
```

---

## Success Criteria

Phase 1 complete when:

- [ ] All 35 unit tests pass
- [ ] Integration test passes
- [ ] No console errors or warnings
- [ ] Test execution time < 30 seconds
- [ ] Can manually inspect created repos with standard git tools
- [ ] `git log --graph` shows correct branch/merge structure
- [ ] Parent chain forms valid linked list (no orphans)
- [ ] Merge provenance is complete (sourceCommit + sourceNodeIds)

---

## Test Count Summary

- **project.test.ts**: 7 tests
- **nodes.test.ts**: 7 tests
- **branches.test.ts**: 11 tests
- **artefact.test.ts**: 6 tests
- **integration.test.ts**: 1 comprehensive test

**Total: 32 focused tests**

---

## Notes

- Tests use real git operations (not mocked) to verify actual behavior
- Each test gets isolated project directory (no cross-contamination)
- Tests verify both API contracts AND git repository state
- Integration test is source of truth for complete workflow
- Test output is programmatic (assertions only, no simulated success messages)
- Follow TDD: write test first, watch it fail, implement, watch it pass
