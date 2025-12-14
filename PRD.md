# 1 Background Context

ChatGPT 5 and Gemini 3 Pro are incredibly powerful tools for high-skill tasks such as in-depth research, drafting technical documents, reviewing documents, and drafting tight (legalistic) responses. These models have vast pre-training knowledge and can also access external knowledge via web search and document retrieval.

## 1.1 Positioning Summary

This product is a **human-centred deep research chain**.

It is designed to support complex, multi-stage reasoning workflows in which a human expert remains in control of intent, judgment, and commitment over time. Rather than optimising for full automation or conversational fluency, the system focuses on preserving epistemic structure: why lines of inquiry were pursued, how alternatives were explored, and how conclusions were reached.

Agents and automated helpers may be used to accelerate or assist individual steps, but they do not replace human decision-making. The system’s primary role is to provide durable structure for deep work — enabling controlled exploration, principled reintegration, and rigorous review — without collapsing reasoning back into a linear chat or opaque automation.

# 2 Emergent User Pattern

## 2.1 Repeating pattern

A common workflow pattern looks like this and is typically **iterative and recursive**, rather than strictly linear:

1. **Initial context-building session** between a human worker and an LLM chat interface (e.g. ChatGPT or Gemini). The purpose is to:
   i. Set the problem framing and context to the extent known
   ii. Seek advice and feedback from the LLM (from pre-training and/or via web search)
   iii. Create a starting artefact (e.g. first-draft document or research brief)
   iv. Iterate on this artefact until the session becomes unwieldy or side-tasks emerge

2. **Tangential exploration (forking)**: at some point, a tangential or orthogonal question must be answered. Ideally, this exploration should:
   i. Inherit relevant context accumulated in (1)
   ii. Remain isolated enough to avoid contaminating or confusing the main reasoning thread
   iii. Allow deeper or alternative lines of enquiry that would be disruptive if pursued inline
   Conceptually, this is a fork with selective context inheritance.

3. **Structural reintegration (system-assisted, user-authorised):** when a tangential exploration proves fruitful, the user explicitly anchors the resulting artefact state back onto the main trunk. The system assists by collapsing the tangential reasoning into a single provenance-preserving reintegration event (a merge node), applying the artefact changes to the trunk and creating a clean point for forward progress without losing historical context.

4. **Critical review and challenge**: a fresh or lightly contextualised thread is often used to critically review the main artefact or reasoning. This is effectively a specialised fork with adversarial or evaluative intent. As with (2) and (3), the output is a distilled set of critiques or actions that must be reintegrated into the trunk.

This pattern commonly repeats multiple times, with forks spawning sub-forks and reviews occurring at several stages of maturity.

Across all stages, the core underlying tension is **context management**. Carrying too much context forward leads to polluted reasoning, confused outputs, and degraded model performance; carrying too little context leads to shallow analysis, repeated work, or incorrect conclusions. Effective workflows therefore require deliberate control over what context is inherited, what is isolated, and what is explicitly reintegrated.

## 2.2 Challenges with this pattern

**Linear, distinct sessions**
ChatGPT and Gemini chat UIs are fundamentally built around linear, single‑thread conversations.

**Opaque context sharing**
ChatGPT projects group chats and files, but context sharing is opaque, typically via background retrieval (RAG), leaving users unsure what context is actually in scope.

**Forking threads**
Branching chats exist but quickly become hard to track and reason about from the user’s perspective.

**Tracking related sessions**
The sidebar UI makes it difficult to understand lineage or relationships between chats. Titles are weak, ordering is dynamic, and there is no explicit graph of related work.

**Artefact‑centric workflows**
Canvas modes in ChatGPT and Gemini support working on a central artefact alongside chat, similar to code‑assistant tools (e.g. Cursor, Claude Code). However, these canvases do not solve multi‑thread lineage, context control, or re‑integration across forks.

# 3 Pain Points and Failure Modes

This workflow pattern breaks down in predictable and user-visible ways in existing LLM chat interfaces. These failures are not primarily model-capability limitations, but interaction and context-management failures that compound as work progresses.

## 3.1 Context pollution and reasoning drift

As a single chat thread accumulates turns, the effective context becomes noisy. Earlier assumptions, abandoned lines of reasoning, and superseded drafts remain implicitly active. This leads to subtle reasoning drift, contradictory outputs reflecting different stages of thinking, and increased user effort to restate or correct assumptions.

## 3.2 Context starvation in side explorations

When users open fresh threads to explore tangential questions, those threads often lack critical background. The model re-derives facts or produces outputs misaligned with the main artefact, forcing users to manually re-inject context and increasing the risk of inconsistencies.

## 3.3 Loss of provenance and decision rationale

Across multiple chats and forks, there is no durable representation of why particular decisions were made, which assumptions were in scope, or which alternatives were considered and rejected. This makes later review, auditing, or handover difficult.

## 3.4 Lack of provenance-aware merge

Current tools force users to choose between a clean current artefact (which loses the reasoning and decisions that produced it) and a messy conversational history (which preserves the "why" but obscures the present state). The failure is not merely that reintegration is manual, but that it severs provenance: there is no way to retain a clean artefact state while maintaining a traceable, inspectable history of how that state was reached.

## 3.5 Breakdown of critical review

Critical review is most effective when performed with partial detachment from the original reasoning. Existing tools provide no structured way to create evaluative or adversarial contexts or to map review outputs cleanly back to the artefact.

## 3.6 Poor visibility and navigability at scale

As the number of related chats grows, users lose visibility into the overall structure of their work. Chat lists provide no lineage, dependency, or state information, making it difficult to reason about progress or resume work.

# 4 Why Existing LLM Interfaces Do Not Solve These Failures

Although modern LLM products expose features such as projects, branching chats, retrieval-augmented context, and artefact-centric canvases, these features are not designed around the workflow described above and therefore fail to address its core failure modes.

## 4.1 Linear conversation as the primary abstraction

Existing interfaces treat the conversation thread as the fundamental unit of work. This abstraction optimises for continuity and turn-by-turn dialogue, but provides no native representation of forks, merges, or lineage. As a result, users must choose between maintaining continuity and preserving clarity.

## 4.2 Implicit and opaque context management

Context inclusion is largely implicit, whether through long conversation histories or background retrieval from projects and files. Users cannot inspect, constrain, or reason about what context is in scope at any given moment, leading to unpredictable behaviour and reduced trust.

## 4.3 Branching without structure or intent

While branching chats are supported, branches have no explicit semantics. They lack purpose, intent, or relationship metadata, and there is no representation of how branches relate to each other or to a main trunk. Over time, branches become orphaned or unusable.

## 4.4 Artefact-centric canvases address only local iteration

Canvas-style interfaces improve iteration on a single artefact within a single context. However, they do not address multi-thread reasoning, cross-context synthesis, or the provenance of ideas and decisions that inform changes to the artefact.

## 4.5 No first-class support for reintegration or review

Reintegration of insights across threads is treated as an informal summarisation task performed by the user. Similarly, critical review is handled as just another conversation, without explicit support for evaluative stance, bias isolation, or traceable outcomes.

## 4.6 Breakdown at moderate complexity

Because navigation and organisation are primarily temporal and list-based, existing interfaces degrade rapidly as the number of related chats increases. Users lose the ability to understand the global structure and state of their work, even at modest levels of complexity.

# 5 Product Principles

### **Principle 1 — Preserve user intent over time**

The primary value of the system is preserving the user’s intent as it evolves over time, as expressed through decisions to diverge (fork), converge (merge), and revise reasoning. Conversations, artefacts, and outputs are secondary to this temporal intent structure.

---

### **Principle 2 — Forking is a first-class expression of intent**

A fork represents an explicit decision to explore without commitment and without contaminating the main line of reasoning. Forks are not secondary chats; they are first-class representations of exploratory intent that may differ in assumptions, stance, or evaluative posture.

Forks may be created prospectively or retrospectively.

---

### **Principle 3 — History is reclassifiable**

Users must be able to retrospectively identify divergence points in an existing line of reasoning and reclassify subsequent work as belonging to a fork. The system must support reinterpretation of past interaction structure in service of preserving intent and reasoning purity.

---

### **Principle 4 — Context management must preserve both volume and purity**

The system must actively manage context to avoid both overload and contamination. Carrying excessive context degrades reasoning quality; carrying insufficient context leads to shallow or incorrect outputs. Context inheritance, isolation, and reintegration must therefore be deliberate and intelligible.

---

### **Principle 5 — Compression must be structural, not lossy by default**

Because long-running workflows inevitably exceed context limits, compression is unavoidable. Compression should preferentially exploit structural repetition (for example, near-identical artefact states) and canonicalisation, rather than relying solely on abstractive summarisation. Silent loss of important reasoning is unacceptable.

---

### **Principle 6 — Reintegration is an explicit commitment step**

Merging outputs from a fork into the trunk is a deliberate act of commitment. The system must support explicit choices about what is reintegrated and at what level of fidelity, recognising that reintegration is inherently selective and lossy.

---

### **Principle 7 — Review requires deliberate distance**

Effective critical review depends on intentional separation from the original reasoning context. The system must support review modes that provide controlled context, explicit evaluative stance, and structured outputs that map back to concrete decisions and changes.

---

### **Principle 8 — The system must not collapse into linear chat**

The system must not reduce to a single linear conversation abstraction. If reasoning, forks, and decisions are forced back into an undifferentiated chat stream, the system has failed regardless of underlying model capability.

---

### **Principle 9 — Immutable reasoning graph (append-only history)**

The system maintains an immutable, append-only record of reasoning and decisions. Actions such as editing, undoing, or restructuring never delete prior states; instead, they create new states with explicit relationships. This enables fearless exploration while preserving a complete and auditable history of intent.

---

### **Principle 10 — Strict temporal consistency (user-authorised rewind)**

When a user rewinds a line of reasoning to an earlier point in time, the system preserves temporal consistency by treating subsequent work as an alternative branch rather than erasing it. Rewinds are explicit, user-authorised acts that restore a prior state as the basis for continued reasoning, without destroying future context.

---

### **Principle 11 — Artefact mobility across reasoning time**

Artefacts are not bound to a single point in the reasoning timeline. A user may deliberately apply a later artefact state to an earlier reasoning context, with the system recording this as an explicit transformation that preserves provenance while allowing forward progress from a clean conceptual state.

Appendix A — Technical Requirements & Data Architecture (Informative)

This appendix translates the product principles into indicative engineering constraints. It is provided to demonstrate feasibility and to bound the solution space, not to prescribe a final implementation.

## A.1 Core data structure: the reasoning DAG

The system is a graph of nodes connected by edges.

### A.1.1 Node types

Every interaction creates a generic node, distinguishable by type:

* **Message node:** standard user prompt or model completion.
* **State node:** a silent checkpoint representing a change in the artefact (e.g. user edit or model edit).
* **Merge node:** a system-generated node representing the reintegration of a fork, containing summary metadata and diffs but no conversational text.
* **Prune node:** a tombstone marker for data that has been strictly deleted for security or compliance reasons.

### A.1.2 Append-only constraint

Database operations are strictly insert-only. Editing or undoing creates new sibling nodes and updates the active head pointer; prior nodes are never destroyed except via explicit pruning.

## A.2 State layer (artefact versioning)

The artefact is versioned independently of, but linked to, the reasoning graph. Each node is associated with an artefact snapshot or diff, enabling rebase operations without duplicating full artefact blobs.

## A.3 Translation matrix (system vs user view)

The backend must support a projection layer that renders the graph into a linear user experience while preserving structural truth. Divergence points, merges, and hidden branches are represented explicitly in the UI.

## A.4 Context window management

The prompt sent to the model is assembled via controlled traversal of the graph from root to current head. Sibling branches are excluded to prevent reasoning bleed. When a merge node is encountered, only its summary is injected unless the user explicitly expands it.

## A.5 High-level API sketch

* `POST /fork` — create a named branch from a specific node.
* `POST /rebase` — apply a future artefact state onto an earlier reasoning point as a squash operation.
* `POST /prune` — perform irreversible deletion with tombstoning to maintain graph integrity.
