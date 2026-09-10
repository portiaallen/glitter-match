# Match Rules

This document is the contract for the Glitter Match **Match Rule & Pattern Engine**.

**Matching is graph-authoritative.** Matches are decided from cell ids, authored edges, edge semantics, occupant identity/state, and registered match rules. The engine never infers a match from x/y coordinates, rectangular rows or columns, screen distance, or visual proximity.

**640 levels, Level 1, Level 80, production puzzles, Land-specific production match rules, and production Special Matches are not part of this implementation.** Fixtures under `data/lab/match/` are engine tests only.

## Pipeline

Cascade still consumes `detectMatches()`. The match engine itself stops here:

```
Detect
  → Group
  → Resolve Overlaps
  → Identify Special-Match Candidates
  → Mark Matched Cells
  → Emit Match Events
```

The board is **not** mutated in this pipeline. Special Match *candidates* are metadata only; they are not inventory Special Icons and are not created as board occupants here.

The Special Match Engine (see `SPECIAL_MATCH_ENGINE.md`) continues:

```
Resolve Candidate Conflicts
  → Create Special Matches
  → Mark Resolved Cells
  → Emit Match Events
  → Settle
  → Activate Triggered Special Matches
  → Resolve Effects
  → Settle
  → Detect Again
```

## Registries and contracts

| Registry | Role |
|---|---|
| `MatchRuleRegistry` | Author-facing vocabulary (`standard-3+`, `L`, `path`, `ring`, `land-registered`, …). |
| `MatchEngineRuleRegistry` | Executable rules (size, connectivity, traversal, states, pattern id, wildcard contract, a11y, search bounds). |
| `PatternRegistry` | Registerable pattern handlers. Future shapes register; the core does not `switch (shape)`. |
| `WildcardRegistry` | Explicit compatibility. Levels cannot invent wildcards. |

Rules validate on registration and **fail loudly**. Invalid ids, unknown patterns, unknown direction labels, impossible size ranges, contradictory constraints, unknown cell/occupant states, and unknown wildcard behavior are rejected. The engine does not repair malformed rules.

Built-in engine rules: `standard-cluster`, `cluster`, `directional-aligned`, `pattern-L`, `pattern-T`, `pattern-cross`, `cycle-ring`, `graph-path`, `directional-sequence`, `authored-pattern`.

## Standard matching

`standard-cluster` finds connected components of compatible occupants on the authored graph, size ≥ `minGroupSize` (default 3). Compatibility uses the existing icon/match contract. Irregular topology is the normal case. There is no row or column scan.

## Directional matching

Aligned walks follow a **single authored `direction` label** on graph edges. Standardized compass labels are `n`, `e`, `s`, `w` with logical rotation vocabulary:

`n → e → s → w → n`

Direction is edge metadata. Scrambling presentation coordinates does not change the walk. Diagonal-looking labels (`ne`, …) remain valid authored vocabulary from earlier prompts; they are never inferred from screen axes.

## Pattern framework

Patterns are registered handlers, not a hardcoded catalog inside detect/cascade. Each pattern may declare:

- pattern id
- required topology (`rays`, `cluster`, `cycle`, `path`, `authored-walk`)
- min/max cells
- relative/graph relationships
- directional requirements
- symmetry metadata
- allowed transformations
- wildcard positions
- required icon relationships (compatible occupants)
- search constraints

Shipped ids: `straight`, `L`, `T`, `cross`, `path`, `cluster`, `ring`, `directional-sequence`, `authored`.

`directional-sequence` and `authored` walk explicit step lists of authored directions. They exist so future content can register shapes without a core rewrite.

## Pattern walks

A walker starts at a candidate cell, traverses authored edges, follows allowed directions, tests occupant compatibility, maintains a visited set, and prevents invalid cycles. It returns matched cell ids and an explanation of success or failure. Coordinates are ignored.

## Symmetry

Symmetry on a pattern is **metadata**: `none`, `horizontal`, `vertical`, `rotational`, `reflective`, `graph-defined`.

The engine does not assume geometric symmetry exists for every graph. Junction L/T/cross use ray counts on authored directions (`graph-defined`). The authored graph remains authoritative.

## Clusters, cycles, paths

- **Cluster:** connected region of compatible occupants; min size required; optional max; blocked edges (`allowsMatch: false`) and cell-state restrictions apply; detection is deterministic (sorted cell ids, sorted neighbor visits).
- **Cycle / ring:** simple cycles on graph topology. A cycle does not have to look like a circle. Min/max length, optional allowed directions, occupant compatibility.
- **Path:** simple path with optional start/end cell filters, length bounds, occupant constraints, blocked-edge handling, and a repeated-cell flag (default: simple paths only).

Path and cycle modes are **opt-in**. Default cluster/lab modes do not enable them, so existing irregular fixtures do not grow extra groups.

## Wildcards and the Glitter Icon

Wildcard behavior is a registered contract. The shipped contract is `universal-glitter`:

- icon id `glitter`
- may join ordinary/dev colors
- must not form a solo glitter group
- not inventable per level
- no extra Glitter powers in this phase

Future wildcard rules must register here. A level cannot declare an ad-hoc wild.

## Match Groups

Each group includes: group id, rule id, matched cell ids, occupant identities, pattern metadata, trigger move (if supplied), cascade index, optional special-match candidate, explainability, and accessibility. Group ids are deterministic.

## Overlap resolution

Overlapping matches are **not** silently discarded.

Configurable policies:

- `keep-all` (default) — retain every group; record shared cells.
- `prefer-largest` — keep larger groups first; fully covered groups are **deferred** (still listed on the overlap record).
- `prefer-special-priority` — keep by special-candidate priority, then size, then rule id, then sorted cell ids.

Competing special-match candidates on the same cell are ranked by priority, then rule id, then anchor, then affected cells. The ranking is inspectable in match events. Tie-breaking does not invent Special Matches.

## Special Match candidates

Detection is separate from Special Match creation. A candidate records `candidateType`, affected cells, anchor, trigger move, rule, and priority. Gameplay-created Special Matches (future) remain distinct from inventory Special Icons.

## Events

Serializable events: `match-detected`, `match-group-created`, `pattern-recognized`, `overlap-resolved`, `special-match-candidate-created`, `matched-cells-marked`, `match-resolution-complete`.

Each event carries an accessibility description. Presentation decides audio/haptics.

## Explainability

The engine can answer:

- **Why did this match count?** — `whyMatchCount(group)` / `group.explain`
- **Why did this candidate fail?** — `whyCandidateFailed(resolution, startCell)`

Debug output includes rule, starting cell, traversed cells, edges, directions, occupant compatibility decisions, rejected candidates, and final matched cells.

## Determinism

Identical board definition, board state, and rule set produce identical groups, overlaps, candidates, and events. Match detection does not use RNG.

## Accessibility

Detection does not depend on color. Groups expose match type, cell ids, pattern explanation, state-change notes, a non-color indicator, and optional audio/haptic cue names. The presentation layer communicates them.

## Performance

Pattern rules declare search bounds (`maxWalks`, `maxCycleLength`, `maxPathLength`, `maxVisitedPerWalk`). Walks are counted; exceeding the budget truncates search and records `search.truncated`. This protects against pathological cycles and exponential walks. Correctness comes first; there is no match-result cache in this phase (invalidation risk is higher than the benefit on current board sizes).

## Fixtures

`data/lab/match/` holds development-only graphs: irregular standard, directional, L, T, cross, cluster, cycle, path, overlapping, wildcard, failed pattern, blocked edge, disconnected. They are not production levels and are not in the visual Board Lab catalog.

## Boundaries

Do not: build the Special Match inventory system here, create campaign content, hardcode Land match rules, or scan a grid.
