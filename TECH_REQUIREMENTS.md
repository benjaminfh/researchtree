
# Technical Requirements Document
Technical Requirements & Data Architecture


# 1 Core data structure: the reasoning DAG

The system is a graph of nodes connected by edges.

## 1.1 Node types

Every interaction creates a generic node, distinguishable by type:

* **Message node:** standard user prompt or model completion.
* **State node:** a silent checkpoint representing a change in the artefact (e.g. user edit or model edit).
* **Merge node:** a system-generated node representing the reintegration of a branch, containing summary metadata and diffs but no conversational text.
* **Prune node:** a marker indicating that a compliance-driven history rewrite has occurred. The prune node records scope, reason, and timestamp, but does not itself perform deletion. Underlying deletion is executed via repository-level history rewriting.

## 1.2 Append-only constraint

Database operations are insert-only under normal operation. Editing, undoing, and restructuring create new nodes and update active references.

Irreversible deletion for security or compliance is treated as an exceptional administrative history-rewrite event and may invalidate prior object identities.

# 2 State layer (artefact versioning)

The artefact is versioned independently of, but linked to, the reasoning graph. Each node is associated with an artefact snapshot or diff, enabling rebase operations without duplicating full artefact blobs.

# 3 Translation matrix (system vs user view)

The backend must support a projection layer that renders the graph into a linear user experience while preserving structural truth. Divergence points, merges, and hidden branches are represented explicitly in the UI.

# 4 Context window management

The prompt sent to the model is assembled via controlled traversal of the graph from root to current head. Sibling branches are excluded to prevent reasoning bleed. When a merge node is encountered, only its summary is injected unless the user explicitly expands it.

# 5 High-level API sketch

* `POST /branch` — create a named branch from a specific node.
* `POST /rebase` — apply a future artefact state onto an earlier reasoning point as a squash operation.
* `POST /prune` — perform irreversible deletion with tombstoning to maintain graph integrity (may trigger repository-level history rewriting and require client resynchronisation).

Good question — this belongs **primarily in the Technical Requirements**, with a **light framing hook in the PRD**.

Reasoning:

* The *need* for multi-branch visibility is a **user problem / product capability** → PRD.
* The *mechanism* (graph projection, collapse rules, refs vs topology) is an **architectural/UI-system concern** → Technical Requirements.

Below is a **clean section you can drop into the Technical Requirements**, plus a **1–2 sentence PRD addition**.

# 6 Graph-Based Reasoning Visualization & Projection

## 6.1 Requirement: simultaneous visibility of parallel reasoning

The system must support a user interface that renders multiple branches of reasoning **simultaneously**, without duplicating full chat transcripts per branch. Users must be able to perceive divergence, convergence, and relative position in time at a glance.

This visualization is not a linear chat view, but a **graph projection** over the underlying reasoning DAG.

---

## 6.2 Graph vs projection distinction

The system distinguishes between:

* **Physical topology**: the immutable commit / node DAG (parent–child relationships).
* **Logical views**: user-defined interpretations of that DAG (trunk, branches, review branches), represented via references and annotations.

The UI must render **both**:

* topology (edges and ancestry), and
* view membership (classification, intent, stance),

without conflating the two.

---

## 6.3 Graph pane (structural overview)

The UI must provide a persistent **graph pane**, analogous to a Git commit graph, with the following properties:

* Nodes represent reasoning events (or collapsed groups of events).
* Edges represent parent–child relationships in the DAG.
* Multiple branch heads may be visible simultaneously.
* Merge nodes are rendered distinctly from linear nodes.

Each node must display:

* a compact semantic label (derived from metadata or summaries),
* node type (message, state change, merge),
* optional intent markers (e.g. explore, review, commit).

Hover or focus interactions should reveal a brief summary card.

---

## 6.4 Node collapsing and abstraction

To maintain legibility at scale, the UI must support **structural compression**:

* Linear sequences of low-variance nodes may be collapsed into a single *supernode*.
* Supernodes expand on demand to reveal underlying events.
* Merge nodes are never silently collapsed; they form explicit reintegration points.

Collapse rules must be deterministic and reversible, and must not alter the underlying graph.

---

## 6.5 Detail pane (contextual inspection)

Selection of a node or supernode populates a **detail pane**, which may render:

* the full chat transcript for that segment,
* the artefact state or diff associated with the node,
* merge summaries and reintegration metadata,
* review outputs and required follow-up actions.

At no point should the system render multiple full chat transcripts side-by-side by default.

---

## 6.6 View-driven styling and filtering

Graph rendering must be **view-aware**:

* Branch colouring, badges, or lanes may reflect view membership (e.g. trunk vs exploratory branch vs review branch).
* Filtering by view must be possible without altering graph topology.
* Reclassification of views must update styling and grouping without rewriting history.

This ensures that reinterpretation of history affects **presentation**, not structure.

---

## 6.7 Performance and data source

The graph view must be computable directly from the reasoning DAG and reference metadata, without requiring LLM inference at render time.

Precomputed summaries or labels may be cached per node or segment to ensure responsive interaction at scale.

