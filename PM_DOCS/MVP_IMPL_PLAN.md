# MVP Implementation Plan

## Overview

Build a minimal viable product that proves the core concept: git-backed reasoning DAG with branching, context control, and artefact versioning. Ship fast, validate the model, defer nice-to-haves.

## Core Stack Decisions

### Backend
- **TypeScript + Node.js** - fast iteration, shared types with frontend
- **Git as primary database** - store all reasoning nodes, artefacts, and metadata as commits
- **Simple filesystem structure** - each project is a git repo, no external DB for MVP
- **No auth for MVP** - local/single-user only, easy to add later

### Frontend
- **Next.js 14+ (App Router)** - TypeScript, React, easy deployment to Vercel/Supabase
- **Tailwind CSS** - rapid UI iteration
- **React Flow or similar** - for DAG visualization (graph pane)
- **Markdown rendering** - simple preview pane

### LLM Integration
- **Direct API calls** - OpenAI/Anthropic via environment variables
- **Simple streaming** - show responses as they arrive
- **No complex orchestration** - single-turn conversations only for MVP

### Deployment
- **Vercel** - free tier, easy Next.js deployment
- **Git repos stored in backend filesystem** - one repo per project
- **Environment variables** - for API keys
- **Future-friendly** - architecture allows migration to Supabase storage later

---

## Git-Backed Data Model

### Repository Structure (per project)

```
project-repo/
├── .git/                          # Standard git metadata
├── nodes.jsonl                    # Reasoning nodes (one JSON object per line, append-only)
├── artefact.md                    # Canvas state for this ref (branch-local)
├── project.json                   # Project metadata
└── README.md                      # User-facing project description
```

Git branches handle reasoning branches directly - no need for separate refs tracking.

**Key constraint**: `artefact.md` is edited per ref (branch-local). Merges do not auto-apply Canvas changes; they record a diff snapshot that can be explicitly brought into context as a persisted assistant message.

### Node Schema

```typescript
interface Node {
  id: string;                      // UUID
  type: 'message' | 'state' | 'merge';
  timestamp: number;
  parent: string | null;           // Parent node ID

  // Message node fields
  role?: 'user' | 'assistant' | 'system';
  content?: string;
  interrupted?: boolean;           // True if assistant response was interrupted mid-stream

  // State node fields
  artefactSnapshot?: string;       // Commit hash of artefact state

  // Merge node fields
  mergeFrom?: string;              // Source branch ref
  mergeSummary?: string;           // User-provided summary of what to bring back
  mergedAssistantNodeId?: string;  // Source assistant payload node ID
  mergedAssistantContent?: string; // Snapshot of the assistant payload content
  canvasDiff?: string;             // Snapshot of Canvas diff (not auto-applied)

  // Metadata
  contextWindow?: string[];        // Node IDs included in context
  modelUsed?: string;
  tokensUsed?: number;
}
```

### Git Commit Strategy

- Each user message + assistant response = **1 git commit**
- Commits append new lines to `nodes.jsonl` (never modify existing lines)
- Commits may also update `artefact.md` on the targeted ref when saving the Canvas
- Branch names map to reasoning threads (trunk = main, other branches = feature branches)
- Commit messages are structured: `[node-type] {summary}`

**Merge behavior**: Unlike regular git, merging a branch just appends a merge node to trunk's `nodes.jsonl`. No line-by-line merge conflicts are possible because:
- `nodes.jsonl` is append-only (each branch appends its own lines)
- merges do not auto-apply `artefact.md`; they snapshot a diff and route chat changes through a single “merge payload” assistant message

### Branch Management

Git branches map directly to reasoning branches:
- `main` = trunk
- Other branches = exploration/review branches
- Current HEAD = active context

Branch metadata (intent, creation time) stored in `project.json` or derived from git history. No separate refs tracking needed - git handles it.

---

## MVP Feature Scope

### MUST HAVE (Core Loop)

1. **Create project** - initialize git repo with base structure
2. **Chat interface** - send message, get LLM response (with streaming), append to trunk
3. **Artefact pane** - display current markdown artefact alongside chat
4. **Branch creation** - create named branch from current node (with optional intent/system prompt)
5. **Switch between trunk/branches** - change active context
6. **Merge/reintegration** - bring insights/changes from branch back to trunk
7. **Message editing** - edit any message (creates branch automatically)
8. **Interrupt handling** - stop LLM mid-stream, keep partial response
9. **Basic graph view** - show nodes and branches visually
10. **Context assembly** - walk git history to build LLM prompt

### NICE TO HAVE (Defer to post-MVP)

- Review mode with special UI (MVP: manual adversarial prompting is fine)
- Node collapsing/supernodes
- Multiple artefact types
- Rebase operations
- Advanced context control (selective inheritance)
- Multi-user/auth
- Cloud storage
- Search across nodes
- Conflict resolution UI for merges

---

## Implementation Phases

### Phase 1: Git Backend Core (Week 1)

**Goal**: Prove git-backed storage works for chat + artefacts

- Set up Node.js backend with TypeScript
- Create git wrapper library using `simple-git`
- Implement core operations:
  - `initProject(name)` - create new git repo
  - `appendNode(node)` - add node + commit
  - `getHistory(ref)` - walk commits to retrieve nodes
  - `createBranch(name, fromNodeId)` - create git branch
  - `switchRef(ref)` - checkout branch
- Write tests for basic operations
- No UI yet - test via scripts

**Deliverable**: Backend service that can manage reasoning graph in git

### Phase 2: Basic Chat UI (Week 1-2)

**Goal**: Get end-to-end chat working with real LLM

- Set up Next.js project
- Create simple chat interface (message list + input)
- Implement API routes:
  - `POST /api/chat` - send message, get LLM response
  - `GET /api/history` - fetch chat history
- Connect to OpenAI/Anthropic API
- Wire backend git storage to frontend
- Display current artefact in side pane

**Deliverable**: Working chat interface that persists to git

### Phase 3: Branch Support (Week 2)

**Goal**: Enable branching and switching contexts

- Add branch creation UI (button in chat or graph)
- Implement ref switching (dropdown/tabs)
- Update context assembly to walk correct branch
- Show basic branch indicator in UI
- Test branching flow end-to-end

**Deliverable**: Can create branches and chat in isolated contexts

### Phase 4: Merge & Edit Semantics (Week 2)

**Goal**: Complete the core reasoning loop

- Implement merge UI:
  - Show artefact diff from branch
  - Text box for merge summary
  - Create merge commit on trunk
  - Provide an explicit “Add diff to context” action that appends a persisted assistant node (so later prompts reflect what was included)
- Implement message editing:
  - Edit button on any message
  - If at head: create branch from parent, start new branch with edited message
  - If not at head: same behavior (always branch on edit)
- Implement interrupt handling:
  - Stop button during streaming
  - Save partial response with `interrupted: true` flag
  - Allow continuing from interrupted state

**Deliverable**: Full branch → explore → merge cycle works, editing creates branches

### Phase 5: Graph Visualization (Week 2-3)

**Goal**: Show reasoning structure visually

- Integrate React Flow or similar library
- Render nodes from git history as graph
- Show current position and branch heads
- Click node to view details
- Color-code by branch/intent
- Show merge nodes distinctly

**Deliverable**: Visual DAG that matches git commit graph

### Phase 6: Polish & Deploy (Week 3)

**Goal**: Ship MVP to Vercel

- Add project list/switcher
- Basic error handling
- Environment variable config
- Deploy to Vercel
- Write basic user docs
- Dogfood: Use the tool to create/refine its own documentation

**Deliverable**: Live MVP URL, ready for real research workflows

---

## Technical Decisions & Rationale

### Why Git as Database?

**Pros**:
- Free immutable DAG with perfect provenance
- Branching/merging is native and well-tested
- Content-addressed storage (deduplication)
- Easy to inspect/debug (use regular git tools)
- Can migrate to hosted git (GitHub API) later

**Cons**:
- Not designed for high-frequency writes (fine for chat cadence)
- Query performance (mitigate: cache refs in memory, index in JSON files)
- File size limits (fine for text, problem for large artefacts - defer)

**Verdict**: Perfect fit for MVP, acceptable constraints

### Why No Database for MVP?

- Git handles all the hard parts (versioning, branching, immutability)
- `.research/refs.json` and `.research/views.json` provide fast lookups
- Eliminates deployment dependency (no PostgreSQL/Redis needed)
- Can add traditional DB later for:
  - User accounts
  - API keys
  - Cross-project search
  - Performance-critical queries

### Why Next.js App Router?

- Server components reduce client JS
- API routes colocated with frontend
- Great TypeScript support
- Vercel deployment is one command
- Easy to add auth later (NextAuth.js)

### Why Filesystem-Based Projects?

- Each project = one git repo
- Easy to backup, clone, share
- Can migrate to S3/Supabase storage later
- For MVP, just store in `/tmp` or `/var/researchtree/projects`

---

## API Design (MVP Routes)

### Project Management

```typescript
POST   /api/projects              // Create new project
GET    /api/projects              // List projects
GET    /api/projects/:id          // Get project metadata
DELETE /api/projects/:id          // Delete project
```

### Chat & Nodes

```typescript
POST   /api/projects/:id/chat       // Send message, get response (streaming)
POST   /api/projects/:id/interrupt  // Interrupt ongoing LLM response
GET    /api/projects/:id/history    // Get node history for active ref
POST   /api/projects/:id/branch     // Create branch (with optional intent/prompt)
POST   /api/projects/:id/switch     // Switch active ref
POST   /api/projects/:id/merge      // Merge branch to trunk
POST   /api/projects/:id/edit       // Edit message (creates branch)
```

### Artefact

```typescript
GET    /api/projects/:id/artefact       // Get current artefact
POST   /api/projects/:id/artefact       // Update artefact (manual edit)
```

### Graph

```typescript
GET    /api/projects/:id/graph    // Get full DAG for visualization
```

---

## Edit & Interrupt Semantics

### Message Editing

**Rule**: Any edit to a message creates a new branch.

**Why**: Preserves immutability principle - never rewrite history, always create alternatives.

**Flow**:
1. User clicks "edit" on message with node ID `N`
2. System identifies parent node `P` of node `N`
3. System creates new branch `edit-{timestamp}` from node `P`
4. Edited message becomes first commit on new branch
5. Original branch remains unchanged
6. User is switched to new branch
7. Can continue chatting from edited message

**Applies to**:
- Editing message at HEAD (most recent)
- Editing message in history (not at HEAD)
- Editing user messages or assistant messages

**Cost**: Branches are cheap in git - this is fine.

### Interrupted Responses

**Rule**: Interrupted responses are saved as-is with metadata flag.

**Why**: Preserves what actually happened, might contain useful partial output.

**Flow**:
1. User clicks "stop" during streaming assistant response
2. System saves partial response with `interrupted: true` flag
3. Commit created with user message + partial assistant response
4. User can:
   - Continue chatting (partial response is in context)
   - Edit the interrupted message (creates branch)
   - Switch to different branch

**Context handling**: Interrupted responses included in context assembly like any other message (LLM sees partial response).

### Scenarios

| Scenario | User Action | System Behavior |
|----------|-------------|-----------------|
| a) Edit message, no response yet | Edit | Create branch from parent, new branch with edited message |
| b) Edit message, partial response | Edit user msg | Create branch from before both, new branch with edited message |
| c) Edit message, full response | Edit user msg | Create branch from before both, new branch with edited message |
| d) Edit assistant response | Edit | Create branch from parent, new branch with edited response |
| e) Interrupt streaming | Stop button | Save partial with `interrupted: true`, create commit |

---

## Merge/Reintegration Strategy

### Merge Data Model

When merging source branch → target branch:

```typescript
interface MergeRequest {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  mergeSummary: string;            // Required: what to bring back
  sourceAssistantNodeId?: string;  // Optional override for merge payload selection
}
```

### Merge Behavior

1. **Compute Canvas diff**: Compare `artefact.md` on `targetBranch` vs `sourceBranch`
2. **User reviews**:
   - See diff if Canvas changed
   - Write merge summary (required)
3. **Create merge node on target**:
   - Type: `merge`
   - Contains: merge summary text
   - Canvas: diff is recorded on the merge node, but `artefact.md` is not auto-modified
   - Metadata: link to source branch + chosen payload assistant content snapshot
4. **Context impact**:
   - Future target-branch messages see merge summary and merge payload in context
   - Do NOT traverse branch's full history (would pollute context)
   - Merge summary + payload acts as compressed representation of branch's insights

### Merge Use Cases

All these use the same merge flow, differ only in summary content and artefact changes:

- **Research injection** (no artefact changes): Summary contains findings, toggle off artefact changes
- **Implementation** (with artefact changes): Summary explains what changed, toggle on artefact changes
- **Review output** (action items): Summary lists issues/improvements, toggle off artefact changes (changes come later)
- **Rejected path** (negative knowledge): Summary explains why approach failed, toggle off artefact changes

### MVP Constraints

- **No Canvas auto-merge**: Merges never auto-apply `artefact.md`; they only record a diff snapshot.
- **No conflict resolution UI**: If user wants to bring changes onto the target Canvas, they do it by editing the Canvas on the target branch (optionally after pinning the diff into context).
- **Manual process acceptable**: This is an expert workflow, not a consumer product.

---

## Context Assembly Strategy (MVP)

### Goal
Build LLM prompt by walking git history from current HEAD

### Algorithm

```typescript
function assembleContext(projectRepo, ref) {
  const commits = git.log({ ref, maxCount: 50 }); // Last 50 commits
  const nodes = commits.map(commit => loadNodeFromCommit(commit));

  const messages = nodes
    .filter(n => n.type === 'message')
    .map(n => ({ role: n.role, content: n.content }));

  const currentArtefact = fs.readFileSync('artefacts/current.md', 'utf-8');

  return {
    systemPrompt: buildSystemPrompt(currentArtefact),
    messages: messages,
  };
}

function buildSystemPrompt(artefact) {
  return `You are assisting with research and document creation.

Current artefact state:
---
${artefact}
---

Instructions:
- Help the user refine and develop this artefact
- Provide thoughtful analysis and suggestions
- Ask clarifying questions when needed
`;
}
```

### Limitations (Acceptable for MVP)

- No merge node expansion (merge summary injected as single message, don't traverse merged branch)
- No selective context (include all messages up to limit)
- No token counting (just truncate at message boundary)
- No compression (rely on recency)
- Interrupted responses included as-is (no special handling in context)

**Post-MVP**: Add smart context assembly with merge summaries, token budgets, structural compression

---

## Data Migration Path (Future)

### MVP
```
Local filesystem → Git repos → In-memory refs
```

### Post-MVP (Supabase)
```
Supabase Storage → Git repos → Supabase DB for refs/metadata
```

**Migration strategy**:
- Keep git repos as primary storage (upload to Supabase Storage)
- Move refs, views, project metadata to PostgreSQL
- Add user accounts, API key management
- Keep backend API unchanged (just swap storage layer)

---

## Non-Goals for MVP

These are explicitly OUT OF SCOPE to ship fast:

- Multi-user support
- Real authentication
- Review mode with special UI (manual prompting is fine)
- 3-way merge conflict resolution
- Node collapsing/supernodes
- Rebase operations
- Advanced context control (selective inheritance, token budgeting)
- Multiple artefact types
- Mobile responsive design
- Comprehensive error handling
- Undo/redo (git history provides this, but no UI for it)
- Search across nodes/projects
- Export formats
- Collaboration features
- Performance optimization
- Accessibility compliance
- Rich text editing (plain textarea is fine)

---

## Success Criteria

MVP is successful if you (Ben) can dogfood it for real research work:

1. Can create project and start research session
2. Can chat with LLM (streaming) and see artefact evolve
3. Can interrupt LLM mid-response (keeps partial)
4. Can edit any message (automatically creates branch)
5. Can create branch to explore tangential question (with optional custom prompt)
6. Branch inherits appropriate context from trunk
7. Can switch between trunk and branches
8. Can merge branch back to trunk (with summary and optional artefact changes)
9. Can visualize reasoning graph (nodes, branches, merges)
10. Git repo accurately represents reasoning history (inspectable with git tools)
11. Can deploy to Vercel and use from any browser
12. Architecture is clean enough to add features without rewrite
13. **Dogfooding test**: Use the tool to refine its own PRD or implementation plan

---

## Risk Mitigation

### Risk: Git performance degrades with large histories
**Mitigation**:
- Shallow clones for recent history
- Archive old branches
- Lazy-load node details
- Add DB index post-MVP if needed

### Risk: Context window limits hit quickly
**Mitigation**:
- Start with simple truncation (last N messages)
- Add merge summarization in v2
- Let users manually prune context

### Risk: Artefact conflicts on merge
**Mitigation**:
- MVP: Simple strategy - user chooses to apply branch's artefact or keep trunk's (no 3-way merge)
- Post-MVP: Use git merge strategies or manual resolution UI for complex conflicts

### Risk: Deployment complexity
**Mitigation**:
- Vercel handles Next.js deployment
- Git repos stored in ephemeral filesystem (fine for testing)
- Add persistent storage (Supabase) in v2

---

## Timeline Estimate

**3-4 weeks to MVP** (single developer, full-time)

- Week 1: Git backend + basic chat UI (with streaming)
- Week 2: Branching + merge/edit semantics
- Week 3: Graph visualization + polish
- Week 4: Deploy + dogfooding + iteration

**Stretch goal**: 3 weeks if everything goes smoothly

The extra time accounts for merge UI and edit/interrupt handling, which are critical to the core value prop.

---

## First Steps (Next 48 Hours)

1. Initialize Next.js project with TypeScript
2. Set up basic project structure
3. Install dependencies (`simple-git`, `openai`/`anthropic-sdk`)
4. Implement `initProject()` and `appendNode()`
5. Write test that creates project, adds nodes, retrieves history
6. Build minimal chat UI (no styling)
7. Wire up LLM API call
8. Test end-to-end: message → git commit → response

**Goal**: Prove the core loop works before building features
