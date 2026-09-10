# Glitter Match

Glitter Match is an unconventional match-puzzle game in the Glitter Universe. The board is a **graph of playable cells**, not a rectangular matrix. Board shape and topology are part of the puzzle.

This repository currently contains the **engine, Board Laboratory, content-architecture contracts, and Land DNA**. There is no campaign. **640 levels are future content and are not part of this implementation.**

Core philosophy: *Simple to understand. Difficult to master. Impossible to completely predict.*

## Why Glitter Match Does Not Use a Grid Engine

Visual positions are presentation/authoring information. Graph connectivity is gameplay truth. A matrix engine would still assume x/y adjacency and would have to be rewritten for rings, portals, one-way paths, and rotating sections. Glitter Match authors those relationships explicitly. Dragging a cell in the Board Lab never creates a neighbor.

## Architectural philosophy

- **Data-driven.** Levels, Lands, icons, objectives, and obstacles are definitions. The engine interprets them.
- **Graph-native.** Adjacency, direction, and flow are authored. Coordinates are for layout, never for match or gravity logic. **Matching is graph-authoritative.**
- **Modular.** New mechanics, obstacles, and match modes register without rewriting the board engine.
- **Testable.** Cascade resolution, matching, and fairness run with no renderer.
- **Deterministic when seeded.** Gameplay RNG is `SeededRandom`. `Math.random()` is not used for board logic.
- **Fair.** Dead boards are detected and can be recovered. Special Icons are inventory assistance, not required clear conditions.
- **No premature campaign.** Canonical Lands and icon families are registered as identity data. One development fixture exists only to verify the engine. See `CONTENT_ARCHITECTURE.md` and `LAND_DNA.md`.

## Project structure

```
src/
  board/          Graph cells, topology, directional edges, flow, rotation
  matching/       Graph-authoritative match rules, patterns, walks, overlap, events
  cascade/        Detect → resolve → effects → move → refill
  random/         Seeded, snapshotable RNG
  fairness/       Valid moves, dead boards, recovery
  solvability/    Legal-move simulation, bounded objective search
  replay/         Deterministic seed + move tapes
  icons/          Icon registry, Glitter Icon identity, Icon Law
  lands/          Eight Land DNA registry (questions, verbs, vocabulary)
  dna/            Rule of Three, pacing, movement model
  difficulty/     Thirteen-axis difficulty (not easy/medium/hard)
  twists/         Optional twist contracts
  secrets/        Optional discovery/secret references
  gates/          Future Gate reference contract
  universe/       Sanctuary / Museum / Personal Story references
  obstacles/      Obstacle handlers
  objectives/     Objective framework
  special-icons/  Universal Special Icon inventory (not Special Matches)
  economy/        Reward definitions
  progression/    Player unlock/completion state
  mechanics/      Land mechanic contracts (placeholders unimplemented)
  primitives/     Reusable Land-neutral gameplay primitives
  levels/         Zod schema + validation
  state/          Authoritative session vs presentation state
  ui/             Accessibility + presentation contracts
  audio/          Audio identity/control contracts
  debug/          Topology inspection + CLI
  content/        Production vs development packs
  lab/            Playground + graph authoring session
data/dev/         Development-only level fixture (not campaign content)
data/lab/         Board Laboratory topology fixtures (not levels)
data/lab/match/   Match-engine test fixtures (not levels, not in the visual catalog)
LAND_DNA.md       Eight Land mechanical identities (not puzzles)
MATCH_RULES.md    Match Rule & Pattern Engine (graph-authoritative)
MECHANIC_PRIMITIVES.md  Reusable engine primitives (not Land mechanics)
lab/              Developer Board Laboratory visualizer + authoring helper
tests/            Engine tests (no UI)
```

## How the board graph works

A level lists **cells** and **edges**. Matching, swapping, and cascade movement never scan a 2D array.

- `adjacency` / `connections` edges define neighbors. Optional `direction`, `orientation`, `traversal`, `allowsMatch`, and `allowsSwap` are authored. They are never inferred from x/y.
- `flow` edges define how remaining pieces move after a match. Flow must be a DAG. Visual down is not gravity.
- `portals` can connect islands. Whether they conduct matches or swaps is authored.
- Rotating sections transform occupant cycles on the graph. The engine does not rotate a bitmap.
- `topology.kind` is authoring language (`circular`, `hub-and-spoke`, `maze`, …). The graph is the source of truth.

Positions (`x`, `y`, optional `z`) are for presentation and debug, not legality.

## How level definitions work

Levels are JSON documents validated by `src/levels/schema.ts` (unknown fields fail) and then by `validateLevel()` (connectivity, icons, objectives, obstacles, rewards).

Use `status: "development"` or `"production"`. The production profile rejects `dev.*` icons and development fixtures.

Load a level:

```ts
import { createDevelopmentPack, loadAndValidateLevel, startLevel } from "glitter-match";

const pack = createDevelopmentPack();
const level = loadAndValidateLevel(json, { ...pack, profile: "development" });
const session = startLevel({ level, registries: pack, seed: "my-seed" });
session.swap("hub", "left");
```

## How tests are run

```bash
npm test
npm run build
```

Tests cover board graphs, irregular topology, adjacency, matching, cascade sequencing, seeded RNG, dead-board recovery, schema validation, icon ownership, Lands, and objectives.

## How deterministic seeds work

`SeededRandom` is mulberry32 keyed by a string seed. It can `snapshot()` / `restore`, `fork(salt)` for placement vs recovery streams, and shuffle with Fisher–Yates.

The same seed and authored start state must produce the same swaps, refills, and scores. Do not call `Math.random()` in engine code.

## Board Laboratory

A developer-only playground that loads irregular graphs into one generic engine:

```bash
npm run lab
```

Open http://localhost:5173. Fixtures: diamond, heart, ring, spiral, twin chambers, irregular islands, plus cascade / dead-board / seeded-fill proofs.

These are **engine fixtures**, not levels. They have no Land, no level number, no story, and no rewards.

Click two cells to see why they can or cannot interact (graph edges, not x±1/y±1). Toggle IDs, adjacency, portals, coordinates, matches, legal moves, flow, and direction labels.

**Graph Authoring Helper** (mode: Graph authoring): add/move/rename/delete cells, author edges, flow, and portals, import/export JSON, and read validation errors. Optional “Connect nearby” writes real authored edges you can inspect. Snap is visual only. This helper is not the player-facing game.

Play / inspect can trigger **mechanic primitive recipes** on the current fixture (disable edge, lock, swap, pair, region, path, threshold). That inspects reusable engine blocks. It is not a campaign editor and not a Land mechanic.

## How to author an irregular board

Prefer a `BoardDocument` (see `data/lab/*.json`):

```json
{
  "id": "lab.my-shape",
  "status": "development",
  "purpose": "engine-fixture",
  "title": "My shape",
  "shape": "anything-you-want",
  "topology": { "kind": "custom", "notes": "optional authoring vocabulary" },
  "cells": [{ "id": "a", "position": { "x": 0, "y": 0 } }],
  "connections": [{ "from": "a", "to": "b" }]
}
```

`shape` is a human label. The engine never branches on it. New silhouettes do not require matcher changes.

Serialize with `serializeBoardDefinition` / `deserializeBoardDefinition` (canonical JSON round-trip).

Validate with `validateBoardDefinition` or `npm run debug -- validate data/lab/diamond.json`.

## How to add a new board topology

1. Author cells and edges. Pick a `topology.kind` from the existing list (or `custom`).
2. Add direction labels if you need aligned / L / T / cross matches. Those labels are graph vocabulary, not screen axes.
3. Add `flow` edges if pieces should move after matches. Do not assume gravity follows `y`.
4. If a region should rotate later, author a section with `occupantCycles`. Do not expect the engine to infer a spin from coordinates.
5. Validate with `npm run debug -- validate path/to/level.json`.
6. Inspect with `npm run debug -- inspect path/to/level.json` or `dot` for Graphviz.

You should not add a new match engine for a new shape.

```bash
npm run debug -- inspect data/lab/heart.json
npm run debug -- why data/lab/heart.json --pair lo,ro
```

## How to add a new mechanic safely

1. Register it on `MechanicRegistry` with `implemented: true` only when logic exists.
2. Reference the id from the level `mechanics` array. Unknown or unimplemented ids fail validation loudly.
3. Keep mechanic behavior in its module. Do not special-case a Land or level number in the cascade pipeline.
4. Add tests that run against a graph board with no UI.

Same pattern for obstacles: implement a handler, register it, then allow it in levels.

## Debug CLI

```bash
npm run debug -- inspect data/dev/branching-smoke.json --seed debug-seed
npm run debug -- validate data/dev/branching-smoke.json
npm run debug -- dot data/dev/branching-smoke.json
npm run debug -- force data/dev/branching-smoke.json --cells hub=dev.spark-a,left=dev.spark-a,right=dev.spark-a
```

## Canon this foundation already enforces

- One Land, one ordinary icon family, zero duplicates.
- The Glitter Icon is universal and belongs to no Land.
- Special Icons ≠ Special Matches.
- Exactly eight Lands: Lumina, Glimmer, Bloomara, Transcendia, Quintara, Iridescia, Aurelia, Infinity Isles.
- Extra Hard levels must remain solvable without Special Icons (mastery flag + architecture; no Extra Hard content yet).
- 640 levels are future content. Content contracts live in `CONTENT_ARCHITECTURE.md`. Land DNA lives in `LAND_DNA.md`.
