# Architecture

This document records foundation decisions for Glitter Match. The game design already exists; this phase only builds the engine that can host it.

## Why a graph, not a grid

The board is not required to be rectangular. Shape and connectivity are puzzle content. A matrix engine with “irregular holes” would still assume 4-way x/y adjacency and would have to be rewritten for rings, portals, chambers, and rotating sections.

**Decision:** `BoardTopology` is an explicit cell graph. Coordinates are presentation. Matching walks `adjacency`. Cascade movement walks a separate `flow` DAG.

If a later Land wants hex, radial, or organic connectivity, it authors edges. The match engine does not change.

## Topology kinds are labels

`topology.kind` (`linear`, `circular`, `hub-and-spoke`, `portal-connected`, …) is authoring vocabulary and a hook for light validation (for example, circular should contain a cycle). It is not a family of mini-engines.

## Matching is connectivity-first

**Matching is graph-authoritative.** Default match mode is **cluster**: connected components of compatible icons, size ≥ `minGroupSize`.

Aligned / L / T / cross / path / cycle modes exist for boards that author **direction labels** or opt into topology matchers. They are optional. Irregular boards are not forced through horizontal/vertical rules. Coordinates, rows, columns, and screen distance never decide a match.

See `MATCH_RULES.md` for the Match Rule Registry, pattern framework, overlap policy, and Special Match candidate separation.

**Glitter Icon:** universal wild that may join an ordinary/dev color group. Pure-glitter groups are ignored so we do not invent extra Glitter behavior in this phase. Levels cannot invent additional wildcards.

**Special Matches** (pattern-created board occupants) are implemented as a generic engine layer. The Match Engine still emits **candidate metadata only**. The Special Match Engine turns approved candidates into serializable board instances. Candidates stay distinct from **Special Icons** (inventory items). See `SPECIAL_MATCH_ENGINE.md`.

The match pipeline (detect → group → overlap → special-candidate → mark → events) does not mutate the board. Cascade creates instances, activates registered triggers, and reuses the Prompt #6 effect system.

## Cascade pipeline vs presentation

Logic pipeline, always in this order:

1. Detect matches
2. Identify / conflict-resolve Special Match candidates
3. Create Special Match instances (creation policy)
4. Resolve (clear non-preserved occupants, score, collection stats)
5. Obstacle effects
6. Remaining-piece movement (`along-flow` or `none`)
7. Activate triggered Special Matches and apply primitive effect batches
8. Refill
9. Repeat until stable or an explicit safety termination
10. Complete

`CascadeReport.steps` is the animation contract. The UI must not be required to advance game state.

Safety terminations are explicit: `CASCADE_COMPLETED`, `CASCADE_LIMIT_REACHED`, `CASCADE_STATE_REPEAT`, `CASCADE_INVALID`. Configurable limits are not a solvability proof.

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

`data/dev/branching-smoke.json` is the only engine-level fixture. It is not a campaign level.

**640 levels are future content. They are not part of this implementation.** See `CONTENT_ARCHITECTURE.md` for Level DNA and `LAND_DNA.md` for Land mechanical identities. Land DNA describes vocabulary; it does not define individual puzzles.

## Icon and Land canon

Ordinary match icons belong to exactly one Land. Each of the eight Lands has a registered eight-icon family. Duplicate ids are rejected at registration. Duplicate display names across Lands fail integrity validation. Reassignment requires an explicit content-version change.

The Glitter Icon id is `glitter`, `kind: "glitter"`, `landId: null`.

The eight Lands are fixed in `LAND_IDS` with canonical questions, mechanical verbs, and reserved unimplemented handlers (`land.lumina` … `land.infinity-isles`). No additional Lands are allowed. The engine asks the mechanic registry and collects explicit effects. It must not branch on `land === ...`.

Special Icons are catalogued as universal inventory (`glitter-bomb`, `glitter-hammer`, `prism`, `wild-card`, `magic-swap`, `glitter-lightning`) with `implemented: false`. Using one as a move fails loudly. They are not Special Matches.

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

- Match `modes` / registered match rules and optional direction labels
- Obstacle handlers
- Mechanic registry
- Movement/refill rules
- Cell `tags`, sections, portals

Avoid: `if (land === "lumina")` inside detect/cascade.

Primitives (`src/primitives/`) are the reusable operations Land handlers will compose: state transitions, cell/occupant/edge overlays, topology mutation, pairing, regions, paths, thresholds, and transactional effect batches. See `MECHANIC_PRIMITIVES.md`. They are not Land mechanics.

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

## Why Glitter Match Does Not Use a Grid Engine

Visual positions are presentation and authoring information. Graph connectivity is gameplay truth.

A rectangular matrix would encode “neighbor” as x±1 / y±1. Heart clefts, rings, portals, chambers, and authored one-way paths are then special cases, holes, or second engines. Glitter Match has one engine: cells and authored edges. Moving a cell on screen never creates or destroys a match relationship. Only an explicit connection, flow edge, or portal does.

Coordinates remain useful for layout, the Board Lab, snapping while editing, and debug labels. Matching, swapping, cascade settlement, rotation, and solvability search never derive legality from them.

## Directional edges

Edges may author `direction`, `orientation`, `label`, `traversal` (`both` | `forward`), `allowsMatch`, and `allowsSwap`. `bidirectional: false` is the legacy spelling of forward-only traversal.

Direction labels are designer vocabulary (`n`, `cw`, `along`, …). They are never inferred from screen axes. Aligned / L / T / cross detection walks those labels. Cluster matching walks connectivity and ignores labels.

## Flow model

`flow` edges are a DAG of where a piece may move after a match. Branching, bottlenecks, chambers, and future portal/teleport flow are all authored `from → to` links with an optional `kind` (`gravity` | `branch` | `portal` | `teleport`). Visual “down” is presentation only. The engine never assumes `y + 1 = gravity`. Cycles and missing cell references fail validation loudly and are not repaired.

## Rotation abstraction

Rotation is a graph transformation of a section, not a bitmap spin.

- Cell ids (sockets), terrain, portals, and adjacency stay put.
- Occupants, movable flags, and obstacles advance along authored `occupantCycles`.
- Optional `remapDirections` remaps direction labels with an authored map (default 90° compass vocabulary).
- `board.rotation[sectionId] = { steps, visualAngle }` is logical state. Animation is a future presentation concern.

Boundary: the engine will not invent a cycle from a bounding box or screen-space angle. Lands that want a spinner author the cycles.

## Authoring helper

`GraphAuthoringSession` (`src/lab/authoring.ts`) plus Board Lab **Graph authoring** mode. Designers add/move/rename/delete cells, author edges/flow/portals, import/export JSON, and see validation. Nearby-connect is an explicit optional command that writes real edges. Snap is a visual placement aid.

## Solvability search

`searchSolvability` enumerates legal moves, simulates swap + cascade, evaluates an objective callback, and runs bounded BFS (`maxDepth`, `maxNodes`). Statuses are exactly:

- `SOLVED`
- `NOT_FOUND_WITHIN_SEARCH_LIMIT`
- `INVALID_BOARD_RULE_DEFINITION`

A truncated or exhausted search is not a proof of unsolvability. `estimateSolvability` remains a lighter swap-only helper.

## Deterministic replay

A `ReplayTape` stores seed, board definition, initial occupants, and events (player-move, match-detection, cascade, board-movement, rng-decision, rotation, objective, special-match). Replaying seed + moves recomputes logic, including Special Match creation and activation. This is an engine/debug hook, not an online replay service.

## Validation philosophy

Malformed authoring fails loudly. Errors name the cell, edge, and property when possible:

`BoardValidationError: flow edge "cell_14 → cell_22" references missing cell "cell_22".`

The engine does not silently repair duplicate ids, self-edges, bad types, flow cycles, illegal rotation cycles, duplicate portals, or unknown icon references.

## Accessibility principles

Board Lab controls use large hit targets, high-contrast text, focus rings, keyboard activation, and pattern+letter icon marks. Graph relationships use stroke style, markers, and labels — not color alone. Reduced motion is optional. Authoring tools are radio groups, not drag-only gestures.

## Architecture boundaries

| System | Responsibility |
|---|---|
| Board Graph | What exists and what connects |
| Match Engine | What constitutes a match (graph-authoritative rules and patterns) |
| Special Match Engine | Candidate → instance → activation → primitive effects |
| Cascade Engine | What happens after a match, including specials |
| Flow Engine | How pieces move through the graph |
| Rotation Engine | How graph regions transform |
| Objective System | What the player must accomplish |
| Obstacle System | What blocks or modifies interaction |
| Land DNA | Mechanical vocabulary of each Land |
| Land Mechanic Registry | Handler contracts, effects, composition |
| Mechanic Primitives | Reusable Land-neutral building blocks |
| Level Definition | Data describing a puzzle |
| Presentation | Animation, sound, camera |

No gameplay-critical behavior depends on UI animation.


