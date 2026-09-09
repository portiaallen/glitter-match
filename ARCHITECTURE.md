# Architecture

This document records foundation decisions for Glitter Match. The game design already exists; this phase only builds the engine that can host it.

## Why a graph, not a grid

The board is not required to be rectangular. Shape and connectivity are puzzle content. A matrix engine with “irregular holes” would still assume 4-way x/y adjacency and would have to be rewritten for rings, portals, chambers, and rotating sections.

**Decision:** `BoardTopology` is an explicit cell graph. Coordinates are presentation. Matching walks `adjacency`. Cascade movement walks a separate `flow` DAG.

If a later Land wants hex, radial, or organic connectivity, it authors edges. The match engine does not change.

## Topology kinds are labels

`topology.kind` (`linear`, `circular`, `hub-and-spoke`, `portal-connected`, …) is authoring vocabulary and a hook for light validation (for example, circular should contain a cycle). It is not a family of mini-engines.

## Matching is connectivity-first

Default match mode is **cluster**: connected components of compatible icons, size ≥ `minGroupSize`.

Aligned / L / T / cross modes exist for boards that author **direction labels** on edges. They are optional. Irregular boards are not forced through horizontal/vertical rules.

**Glitter Icon:** universal wild that may join an ordinary/dev color group. Pure-glitter groups are ignored so we do not invent extra Glitter behavior in this phase.

**Special Matches** (pattern-created power tiles) are not implemented. They must stay distinct from **Special Icons** (inventory items).

## Cascade pipeline vs presentation

Logic pipeline, always in this order:

1. Detect matches
2. Resolve (clear occupants, score, collection stats)
3. Obstacle effects
4. Remaining-piece movement (`along-flow` or `none`)
5. Refill
6. Repeat until stable
7. Complete

`CascadeReport.steps` is the animation contract. The UI must not be required to advance game state.

A combo cap (`maxCombos`, default 64) prevents infinite refill loops.

## Randomness and fairness

Gameplay RNG implements `RandomSource`. The shipped algorithm is mulberry32, snapshotable for later server-side validation. A different implementation can be substituted if it honors the interface.

Dead-board detection: no current matches and no swap that would create one.

Recovery: shuffle movable occupants (`shuffle`) or fail closed (`fail`). Levels choose. This is architecture for fairness, not a promise that every shuffle finds a solution.

Solvability: bounded BFS (`estimateSolvability`). It is a helper for authors, not a proof. Extra Hard content must still be designed solvable without Special Icons.

## Level data

Zod schema is strict (unknown keys fail). Semantic validation lives in `validateLevel` so error messages are loud and path-specific.

Two profiles:

- `development` — allows `dev.*` fixture icons and `status: "development"` levels.
- `production` — rejects development icons/levels, requires ordinary icons to belong to the level’s Land.

`data/dev/branching-smoke.json` is the only fixture. It is not a campaign level.

## Icon and Land canon

Ordinary match icons belong to exactly one Land. Duplicate ids are rejected at registration. Duplicate display names across Lands fail integrity validation.

The Glitter Icon id is `glitter`, `kind: "glitter"`, `landId: null`.

The eight Lands are fixed in `LAND_IDS`. No additional Lands are allowed. Families are empty until content authoring.

Special Icons are catalogued as universal inventory (`glitter-bomb`, `glitter-hammer`, `prism`, `wild-card`, `magic-swap`, `glitter-lightning`) with `implemented: false`. Using one as a move fails loudly.

## Objectives and obstacles

Objectives evaluate `GameStats` and board occupancy. They do not read sprites, tweens, or DOM.

Obstacles are handlers registered by type. The board stores instances (`type`, `durability`, `config`). Implemented now: `lock`, `ice`. Reserved types fail validation until implemented so levels cannot smuggle unimplemented content.

## Authoritative state vs presentation

`AuthoritativeGameState` is the session. `PresentationState` holds selection, highlights, pending cascade steps, and accessibility settings.

Accessibility is a contract from day one: pattern+label (not color-only), text scale, reduced motion, large hit targets, audio/haptics controls. No full settings UI yet.

## What we deliberately did not do

- No 640 levels, no production icon art, no Land-specific mechanics.
- No monetization.
- No rectangular “temporary” engine.
- No hard-coded Lumina or Level 80 rules.
- No copy of Glitter Casino architecture.
- No React/game-view layer — presentation is a future consumer of this package.

## Adding Land-specific behavior later

Preferred extension points:

- Match `modes` and optional direction labels
- Obstacle handlers
- Mechanic registry
- Movement/refill rules
- Cell `tags`, sections, portals

Avoid: `if (land === "lumina")` inside detect/cascade.

## Board documents vs levels

Levels still require a Land, objectives, and campaign metadata. The Board Laboratory uses `BoardDocument` instead:

- `purpose: "engine-fixture"`
- no `land`, no rewards, no level numbers
- `shape` is optional documentation
- `connections` is the designer-facing alias for adjacency
- `chambers` compile into sections
- portals listed once are merged into the graph as `kind: "portal"` edges

Pipeline: **Board Definition → Graph → Generic Engine**. Named silhouettes (heart, spiral, …) are fixtures, not code paths.

## Serialization

`serializeBoardDefinition` writes canonical JSON (sorted cells/edges). Deserialize through the Zod board schema. Round-trip must preserve ids, positions, adjacency, topology metadata, terrain, blockers, portals, and movement.

## Validation

`validateBoardDefinition` reports designer-facing issues: duplicate ids, bad references, self-edges, missing portals, unreachable cells when connectivity is required, flow cycles, isolated cells. Topology kind mismatches are warnings so authors are not forced into a closed set of shapes.

