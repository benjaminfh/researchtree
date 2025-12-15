# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**researchtree** is a git-backed reasoning DAG system for human-centered deep research workflows. The product enables branching, context-controlled exploration, and provenance-preserving reintegration of reasoning threads while working with LLMs.

**Current Status**: Planning phase - PRD, technical requirements, and implementation plans exist but no code has been written yet.

## Core Architecture Principles

### Git as Primary Database
- Each project is a git repository storing reasoning nodes, artefacts, and metadata
- Git branches map directly to reasoning branches (trunk = main, other branches = explorations/reviews)
- Immutable append-only history - never rewrite, always create new states
- `nodes.jsonl` is append-only (no merge conflicts possible)
- `artefact.md` is only editable on trunk (branches have read-only access)

### Merge Strategy
- Uses `git merge -s ours` to preserve DAG structure without file-level merging
- Merge nodes contain compressed summaries, not full branch history
- Branch nodes remain on the branch for full provenance
- Merge nodes track: `sourceCommit`, `sourceNodeIds`, and `mergeSummary`

### Data Model
```
project-repo/
├── .git/                 # Standard git metadata
├── nodes.jsonl          # Reasoning nodes (one JSON per line, append-only)
├── artefact.md          # Current artefact state (trunk-only edits)
├── project.json         # Project metadata
└── README.md            # User-facing description
```

### Node Types
- **message**: user/assistant/system messages
- **state**: artefact change checkpoints (snapshot hash)
- **merge**: reintegration from branch with summary and provenance

## Planned Tech Stack (MVP)

### Backend
- TypeScript + Node.js
- `simple-git` for git operations
- No external database for MVP (git + filesystem only)
- No auth for MVP (local single-user)

### Frontend
- Next.js 14+ (App Router)
- Tailwind CSS
- React Flow for DAG visualization
- Markdown rendering for artefact pane

### LLM Integration
- Direct API calls to OpenAI/Anthropic
- Simple streaming responses
- Environment variables for API keys

## Key Implementation Rules

### Immutability & Branching
- **NEVER** modify or delete existing nodes/commits under normal operation
- Editing any message creates a new branch automatically
- Interrupted LLM responses are saved as-is with `interrupted: true` flag
- Parent tracking forms explicit linked list through node IDs

### Artefact Editing Constraints
- `updateArtefact()` MUST verify current branch is 'main'
- Throw error if attempting to update artefact on non-trunk branch
- Branches can read artefacts but not modify them

### Merge Behavior
- Only allowed when on trunk (main branch)
- Requires explicit user summary of what to reintegrate
- User chooses whether to apply branch's artefact changes
- Creates merge node, then executes `git merge -s ours {branchName}`

### Context Assembly
- Walk git history from current HEAD to build LLM prompt
- Exclude sibling branches (prevent context pollution)
- Merge nodes inject only their summary (not full branch history)
- Interrupted responses included in context as-is

## Implementation Phases (Planned)

### Phase 1: Git Backend Core
- TypeScript library with comprehensive tests
- Project/node/branch/artefact operations
- No UI - just backend with test scripts
- Located in `src/lib/git/`

### Phase 2: Basic Chat UI
- Next.js API routes
- Simple chat interface with streaming
- Artefact display pane
- End-to-end LLM integration

### Phase 3: Branch Support
- Branch creation UI
- Ref switching
- Context isolation per branch

### Phase 4: Merge & Edit Semantics
- Merge UI with diff preview
- Message editing (auto-creates branches)
- Interrupt handling

### Phase 5: Graph Visualization
- React Flow integration
- Visual DAG matching git commit graph
- Color-coded by intent/branch

### Phase 6: Polish & Deploy
- Vercel deployment
- Project management UI
- Basic error handling

## Development Guidelines

### Testing Structure
```
tests/
├── git/
│   ├── project.test.ts       # Project CRUD operations
│   ├── nodes.test.ts         # Node append/retrieve
│   ├── branches.test.ts      # Branch create/switch/merge
│   ├── artefact.test.ts      # Artefact read/update
│   └── integration.test.ts   # Full workflow end-to-end
```

### Test Scripts
- Manual testing scripts go in `scripts/test-git-backend.ts`
- Use `tsx` to run TypeScript scripts directly
- Test outputs should be programmatic, not simulated

### Important Constraints
- Git repos stored in `projects/` directory (gitignored)
- Each project has unique UUID as directory name
- Commits use structured messages: `[{type}] {summary}`
- Parent field in nodes tracks explicit lineage (not just git ancestry)

## Key Documents

- **PRD.md**: Product requirements, principles, user workflow patterns
- **TECH_REQUIREMENTS.md**: Data architecture, API design, graph visualization
- **MVP_IMPL_PLAN.md**: Full implementation plan with stack decisions
- **MVP_P1_PLAN.md**: Detailed Phase 1 checklist (git backend)

## Non-Goals for MVP

- Multi-user/auth
- 3-way merge conflict resolution
- Node collapsing/supernodes
- Rebase operations
- Advanced context control (token budgeting, selective inheritance)
- Multiple artefact types
- Search across nodes
- Mobile responsive design

## Critical Invariants

1. `nodes.jsonl` is strictly append-only (prevents merge conflicts)
2. `artefact.md` only modified on trunk (branches read-only)
3. Edits always create branches (preserves immutability)
4. Parent tracking must form valid linked list
5. Merge nodes must preserve provenance (`sourceCommit` + `sourceNodeIds`)
6. Context assembly excludes sibling branches (prevents reasoning bleed)

## Success Criteria (MVP)

The MVP is complete when Ben (CTO) can dogfood it for real research work:
- Create projects and chat with streaming LLM responses
- Interrupt responses mid-stream (preserves partial)
- Edit messages (auto-branches)
- Create exploration branches with custom prompts
- Switch between trunk and branches
- Merge branches with summaries and optional artefact changes
- Visualize reasoning graph (nodes, branches, merges)
- Inspect with standard git tools (`git log --graph`, `git show`)
- Deploy to Vercel for browser access
