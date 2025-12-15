# Phase 1: Git Backend Core - Implementation Plan

## Goal
Build the core git-backed storage layer that proves the concept works. No UI - just a TypeScript library with comprehensive tests.

## Architecture Overview

### Key Design Decisions
1. **nodes.jsonl is append-only** - No merge conflicts ever possible
2. **artefact.md only editable on trunk** - Branches have read-only access
3. **Merge uses `git merge -s ours`** - Preserves git DAG without merging file contents
4. **Explicit parent tracking** - Each node tracks its parent for provenance
5. **Rich merge metadata** - Merge nodes track sourceCommit and sourceNodeIds for full traceability

### Repository Structure (per project)
```
project-repo/
├── .git/                          # Standard git metadata
├── nodes.jsonl                    # Reasoning nodes (one JSON per line, append-only)
├── artefact.md                    # Current artefact state (trunk-only edits)
├── project.json                   # Project metadata
└── README.md                      # User-facing description
```

---

## Project Structure

```
researchtree/
├── src/
│   ├── lib/
│   │   ├── git/
│   │   │   ├── index.ts           # Main exports
│   │   │   ├── project.ts         # Project operations (init, list, delete)
│   │   │   ├── nodes.ts           # Node operations (append, read history)
│   │   │   ├── branches.ts        # Branch operations (create, switch, merge)
│   │   │   ├── artefact.ts        # Artefact operations (read, update)
│   │   │   └── types.ts           # TypeScript interfaces
│   │   └── index.ts               # Library entry point
│   └── app/                       # Next.js app (Phase 2)
├── scripts/
│   └── test-git-backend.ts        # Manual testing script
├── tests/
│   └── git/
│       ├── project.test.ts
│       ├── nodes.test.ts
│       ├── branches.test.ts
│       ├── artefact.test.ts
│       └── integration.test.ts
├── projects/                      # Where project repos are stored (gitignored)
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Core Types (`src/lib/git/types.ts`)

```typescript
export interface Node {
  id: string;                      // UUID
  type: 'message' | 'state' | 'merge';
  timestamp: number;               // Unix ms
  parent: string | null;           // Parent node ID (null for first node)

  // Message node fields
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  interrupted?: boolean;

  // State node fields (artefact change)
  artefactSnapshot?: string;       // Git commit hash at time of change

  // Merge node fields
  mergeFrom?: string;              // Source branch name
  mergeSummary?: string;           // User-provided summary
  sourceCommit?: string;           // Branch HEAD commit hash at merge time
  sourceNodeIds?: string[];        // Node IDs from branch that were compressed

  // Metadata
  modelUsed?: string;
  tokensUsed?: number;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  description?: string;
}

export interface BranchInfo {
  name: string;
  isTrunk: boolean;
  headCommit: string;
  nodeCount: number;
}
```

---

## API Reference

### Project Operations (`src/lib/git/project.ts`)

```typescript
// Initialize a new project repo
async function initProject(name: string, description?: string): Promise<string>
// - Create directory in projects/{uuid}
// - git init
// - Create initial files: nodes.jsonl (empty), artefact.md (empty), project.json
// - Initial commit
// - Return project ID

// List all projects
async function listProjects(): Promise<ProjectMetadata[]>
// - Scan projects/ directory
// - Read project.json from each

// Get project by ID
async function getProject(projectId: string): Promise<ProjectMetadata | null>

// Delete project
async function deleteProject(projectId: string): Promise<void>
// - rm -rf the project directory
```

### Node Operations (`src/lib/git/nodes.ts`)

```typescript
// Append a node to current branch
async function appendNode(projectId: string, node: Omit<Node, 'id' | 'timestamp' | 'parent'>): Promise<Node>
// - Generate UUID and timestamp
// - Read nodes.jsonl to determine parent (last node's ID, or null if first)
// - Append new node as JSON line to nodes.jsonl
// - git add + commit with message "[{type}] {summary}"
// - Return complete node

// Get all nodes for current branch
async function getNodes(projectId: string): Promise<Node[]>
// - Read nodes.jsonl
// - Parse JSONL (one JSON object per line)
// - Return array

// Get node by ID
async function getNode(projectId: string, nodeId: string): Promise<Node | null>
```

### Branch Operations (`src/lib/git/branches.ts`)

```typescript
// Get current branch
async function getCurrentBranch(projectId: string): Promise<string>

// List all branches
async function listBranches(projectId: string): Promise<BranchInfo[]>

// Create new branch from current HEAD
async function createBranch(projectId: string, branchName: string): Promise<void>
// - git checkout -b {branchName}

// Switch to branch
async function switchBranch(projectId: string, branchName: string): Promise<void>
// - git checkout {branchName}

// Merge branch to trunk
async function mergeBranch(projectId: string, branchName: string, summary: string): Promise<Node>
// - Must be on main/trunk (error otherwise)
// - Get branch HEAD commit hash
// - Walk git log to get all node IDs on branch since divergence
// - Create merge node with: summary, sourceCommit, sourceNodeIds
// - Append merge node to trunk's nodes.jsonl
// - Commit on trunk
// - Execute `git merge -s ours {branchName}` to record merge in git DAG
// - Return merge node
//
// NOTE: Uses `git merge -s ours` strategy which:
//   - Records the merge in git history (preserves DAG structure)
//   - Keeps trunk's files unchanged (we already added what we want)
//   - Branch's full nodes.jsonl remains on that branch for inspection
```

### Artefact Operations (`src/lib/git/artefact.ts`)

```typescript
// Get current artefact content
async function getArtefact(projectId: string): Promise<string>
// - Read artefact.md

// Update artefact (trunk only)
async function updateArtefact(projectId: string, content: string): Promise<Node>
// - Check we're on main branch (throw error if not)
// - Write content to artefact.md
// - Get current commit hash
// - Create state node with artefactSnapshot
// - Append state node to nodes.jsonl
// - Commit both files
// - Return state node
```

---

## Dependencies

```json
{
  "dependencies": {
    "simple-git": "^3.x",
    "uuid": "^9.x"
  },
  "devDependencies": {
    "@types/uuid": "^9.x",
    "vitest": "^1.x",
    "tsx": "^4.x"
  }
}
```

---

## Implementation Checklist

### Setup & Infrastructure
- [ ] Initialize Next.js project with TypeScript
  ```bash
  npx create-next-app@latest researchtree --typescript --app --no-tailwind
  ```
- [ ] Install dependencies
  ```bash
  npm install simple-git uuid
  npm install -D vitest @types/uuid tsx
  ```
- [ ] Configure vitest in `package.json`
  ```json
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
  ```
- [ ] Create directory structure
  ```bash
  mkdir -p src/lib/git tests/git scripts projects
  ```
- [ ] Update `.gitignore` to exclude `projects/` directory
- [ ] Configure TypeScript paths in `tsconfig.json` for clean imports

### Core Types
- [ ] Create `src/lib/git/types.ts`
- [ ] Define `Node` interface with all fields
  - [ ] Message node fields (role, content, interrupted)
  - [ ] State node fields (artefactSnapshot)
  - [ ] Merge node fields (mergeFrom, mergeSummary, sourceCommit, sourceNodeIds)
  - [ ] Metadata fields (modelUsed, tokensUsed)
- [ ] Define `ProjectMetadata` interface
- [ ] Define `BranchInfo` interface
- [ ] Export all types

### Project Operations (`src/lib/git/project.ts`)
- [ ] Implement `initProject(name, description?)` function
  - [ ] Generate UUID for project using `uuid` package
  - [ ] Create directory in `projects/{uuid}/`
  - [ ] Initialize git repo with `simple-git`
  - [ ] Create `nodes.jsonl` (empty file)
  - [ ] Create `artefact.md` (empty file)
  - [ ] Create `project.json` with metadata (id, name, createdAt, description)
  - [ ] Create `README.md`
  - [ ] Make initial commit
  - [ ] Return project ID
- [ ] Implement `listProjects()` function
  - [ ] Scan `projects/` directory using fs.readdir
  - [ ] For each subdirectory, read and parse `project.json`
  - [ ] Return array of ProjectMetadata
- [ ] Implement `getProject(projectId)` function
  - [ ] Check if directory exists at `projects/{projectId}/`
  - [ ] Read and parse `project.json`
  - [ ] Return metadata or null if not found
- [ ] Implement `deleteProject(projectId)` function
  - [ ] Recursively delete `projects/{projectId}/` directory
- [ ] Write unit tests in `tests/git/project.test.ts`
  - [ ] Test initProject creates repo with correct structure
  - [ ] Test initProject creates valid project.json
  - [ ] Test listProjects returns empty array for no projects
  - [ ] Test listProjects returns all projects
  - [ ] Test getProject returns null for non-existent
  - [ ] Test deleteProject removes directory

### Node Operations (`src/lib/git/nodes.ts`)
- [ ] Implement `appendNode(projectId, node)` function
  - [ ] Generate UUID with `uuid.v4()`
  - [ ] Add timestamp with `Date.now()`
  - [ ] Read existing `nodes.jsonl` file
  - [ ] Determine parent: last node's ID if exists, null if first
  - [ ] Create complete node with id, timestamp, parent
  - [ ] Append new node as JSON line to `nodes.jsonl`
  - [ ] Stage file with `git.add('nodes.jsonl')`
  - [ ] Commit with message `[{type}] {truncated content}`
  - [ ] Return complete node
- [ ] Implement `getNodes(projectId)` function
  - [ ] Read `nodes.jsonl` file
  - [ ] Split by newlines and filter empty lines
  - [ ] Parse each line as JSON
  - [ ] Return array of nodes
  - [ ] Handle empty file case (return [])
- [ ] Implement `getNode(projectId, nodeId)` function
  - [ ] Call getNodes to get all nodes
  - [ ] Find node with matching ID
  - [ ] Return node or null
- [ ] Write unit tests in `tests/git/nodes.test.ts`
  - [ ] Test appendNode creates node with UUID and timestamp
  - [ ] Test appendNode sets parent to null for first node
  - [ ] Test appendNode sets parent to previous node ID
  - [ ] Test appendNode creates git commit
  - [ ] Test getNodes returns empty array for new project
  - [ ] Test getNodes returns nodes in order
  - [ ] Test getNode returns null for non-existent

### Branch Operations (`src/lib/git/branches.ts`)
- [ ] Implement `getCurrentBranch(projectId)` function
  - [ ] Use `git.branch()` to get current branch
  - [ ] Return current branch name
- [ ] Implement `listBranches(projectId)` function
  - [ ] Use `git.branch()` to get all branches
  - [ ] For each branch: get HEAD commit using `git.revparse`
  - [ ] For each branch: count nodes by reading nodes.jsonl at that ref
  - [ ] Return array of BranchInfo
- [ ] Implement `createBranch(projectId, branchName)` function
  - [ ] Use `git.checkoutBranch(branchName, 'HEAD')`
  - [ ] Handle errors (e.g., branch already exists)
- [ ] Implement `switchBranch(projectId, branchName)` function
  - [ ] Use `git.checkout(branchName)`
  - [ ] Handle errors (e.g., branch doesn't exist)
- [ ] Implement `mergeBranch(projectId, branchName, summary)` function
  - [ ] Verify current branch is 'main' (throw error if not)
  - [ ] Get branch HEAD commit hash with `git.revparse(branchName)`
  - [ ] Walk git log to find merge-base between main and branch
  - [ ] Get all node IDs on branch since divergence
  - [ ] Create merge node with:
    - [ ] type: 'merge'
    - [ ] mergeFrom: branchName
    - [ ] mergeSummary: summary
    - [ ] sourceCommit: branch HEAD hash
    - [ ] sourceNodeIds: array of node IDs from branch
  - [ ] Append merge node to trunk's nodes.jsonl using appendNode
  - [ ] Execute `git merge -s ours {branchName}` to record in DAG
  - [ ] Return merge node
- [ ] Write unit tests in `tests/git/branches.test.ts`
  - [ ] Test getCurrentBranch returns "main" for new project
  - [ ] Test createBranch creates new branch
  - [ ] Test switchBranch changes current branch
  - [ ] Test listBranches shows all branches with correct info
  - [ ] Test mergeBranch appends merge node to trunk
  - [ ] Test mergeBranch errors if not on trunk
  - [ ] Test mergeBranch preserves git DAG structure

### Artefact Operations (`src/lib/git/artefact.ts`)
- [ ] Implement `getArtefact(projectId)` function
  - [ ] Read `artefact.md` file with fs.readFile
  - [ ] Return content as string
  - [ ] Handle file not exists case (return empty string)
- [ ] Implement `updateArtefact(projectId, content)` function
  - [ ] Check current branch is 'main' using getCurrentBranch
  - [ ] Throw error if not on main
  - [ ] Write content to `artefact.md`
  - [ ] Get current commit hash with `git.revparse('HEAD')`
  - [ ] Create state node with artefactSnapshot = commit hash
  - [ ] Use appendNode to add state node
  - [ ] Both artefact.md and nodes.jsonl will be committed together
  - [ ] Return state node
- [ ] Write unit tests in `tests/git/artefact.test.ts`
  - [ ] Test getArtefact returns empty string for new project
  - [ ] Test updateArtefact writes content
  - [ ] Test updateArtefact creates state node with snapshot
  - [ ] Test updateArtefact errors if not on trunk
  - [ ] Test updateArtefact on branch throws error

### Library Exports
- [ ] Create `src/lib/git/index.ts`
  - [ ] Export all functions from project.ts
  - [ ] Export all functions from nodes.ts
  - [ ] Export all functions from branches.ts
  - [ ] Export all functions from artefact.ts
  - [ ] Export all types from types.ts
- [ ] Create `src/lib/index.ts`
  - [ ] Re-export everything from git/index.ts

### Integration Testing
- [ ] Create `tests/git/integration.test.ts`
- [ ] Test full conversation workflow:
  - [ ] Create project with initProject
  - [ ] Verify initial state (empty nodes.jsonl, empty artefact.md)
  - [ ] Add system message node on main
  - [ ] Add user message node on main
  - [ ] Add assistant message node on main
  - [ ] Update artefact on main
  - [ ] Verify artefact content persisted
  - [ ] Create branch "explore-idea" from current HEAD
  - [ ] Add user message node on branch
  - [ ] Add assistant message node on branch
  - [ ] Switch back to main
  - [ ] Merge branch with summary
  - [ ] Verify trunk's nodes.jsonl contains merge node
  - [ ] Verify merge node has correct metadata (sourceCommit, sourceNodeIds)
  - [ ] Verify git history shows proper merge with `git log --graph`
  - [ ] Checkout branch and verify full history preserved
  - [ ] Verify branch's nodes.jsonl unchanged by merge

### Manual Testing Script
- [ ] Create `scripts/test-git-backend.ts`
- [ ] Implement test functions:
  - [ ] `createTestProject()` - create project and print ID
  - [ ] `addSampleNodes()` - add system, user, assistant messages
  - [ ] `updateSampleArtefact()` - write test content to artefact
  - [ ] `testBranching()` - create branch, add nodes, merge
  - [ ] `printGitLog()` - show git log with graph
  - [ ] `printNodes()` - cat nodes.jsonl with pretty formatting
  - [ ] `inspectBranch()` - checkout branch and show nodes
- [ ] Add main function that runs all tests in sequence
- [ ] Add CLI output with colors/formatting for readability
- [ ] Test script runs with `tsx scripts/test-git-backend.ts`

### Final Validation
- [ ] Run all unit tests: `npm test`
  - [ ] All project.test.ts tests pass
  - [ ] All nodes.test.ts tests pass
  - [ ] All branches.test.ts tests pass
  - [ ] All artefact.test.ts tests pass
- [ ] Run integration test and verify all assertions pass
- [ ] Run manual testing script
  - [ ] Verify git log shows proper branch/merge structure
  - [ ] Manually inspect nodes.jsonl on trunk (should have merge node)
  - [ ] Manually inspect nodes.jsonl on branch (should have full history)
  - [ ] Use `git show` to inspect specific commits
- [ ] Verify Phase 1 success criteria:
  - [ ] Git repo structure matches specification
  - [ ] Branch/merge creates correct git DAG
  - [ ] Artefact updates restricted to trunk (errors on branch)
  - [ ] No merge conflicts possible (nodes.jsonl is append-only)
  - [ ] Parent tracking works correctly (forms linked list)
  - [ ] Merge provenance is complete (sourceCommit + sourceNodeIds)

### Documentation
- [ ] Add JSDoc comments to all public functions
  - [ ] Document parameters and return types
  - [ ] Document error conditions
  - [ ] Add usage examples
- [ ] Document merge strategy in code comments
  - [ ] Explain `git merge -s ours` approach
  - [ ] Document why branch nodes stay on branch
  - [ ] Explain provenance preservation
- [ ] Create `tests/README.md` explaining:
  - [ ] How to run tests
  - [ ] What each test file covers
  - [ ] How to run manual testing script
- [ ] Add inline comments for complex logic
  - [ ] Parent determination in appendNode
  - [ ] Node ID collection in mergeBranch
  - [ ] Merge-base calculation

---

## Testing Strategy

### Unit Tests
Each module has focused unit tests covering:
- Happy paths
- Error conditions
- Edge cases (empty files, first node, etc.)

### Integration Test
Single comprehensive test that exercises the full workflow end-to-end, verifying:
- Git commits are created correctly
- Branch history is preserved
- Merge creates proper DAG structure
- Parent relationships are correct

### Manual Testing
Script for human verification:
- Inspect git repo with standard git commands
- Verify nodes.jsonl structure
- Confirm merge behavior matches expectations

---

## Success Criteria

Phase 1 is **complete** when:

1. All unit tests pass (`npm test`)
2. Integration test passes
3. Manual testing script runs successfully
4. Can create project and inspect with `git log`, `git branch`, `cat nodes.jsonl`
5. Branch/merge flow creates correct git DAG (visible in `git log --graph`)
6. Artefact updates only work on trunk (error on branch)
7. No merge conflicts are possible (append-only nodes.jsonl)
8. Parent tracking forms correct linked list
9. Merge nodes have complete provenance (sourceCommit, sourceNodeIds)
10. All code has JSDoc comments and is well-documented

---

## Time Estimate

**Total: 6-7 hours**

- Setup: 30 min
- Types: 15 min
- Project operations: 1 hr
- Node operations: 1 hr
- Branch operations: 1.5 hr
- Artefact operations: 45 min
- Integration test: 1 hr
- Manual testing script: 30 min
- Documentation & polish: 30 min

---

## Next Steps (Phase 2)

After Phase 1 is complete, Phase 2 will add:
- Next.js API routes
- Basic chat UI
- LLM integration
- Artefact display pane

The git backend from Phase 1 will be used as-is, demonstrating clean separation of concerns.
