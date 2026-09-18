# Land DNA

Land DNA defines the **language** of each Land. It does not define the individual puzzles.

**640 levels are future content. Level 1, Level 80, and the campaign are not part of this implementation.**

A Land definition describes vocabulary: questions, verbs, board/movement/match/obstacle/objective language, difficulty bias, and accessibility. Registered mechanic handlers provide behavior. The engine never writes `if (land === "lumina")`.

```
Land Registry
    ↓
Mechanic Registry
    ↓
Mechanic Handler
    ↓
Explicit Effects
    ↓
Game State
```

## Eight Lands

| Land | Question | Design principle |
|---|---|---|
| Lumina | Who are you? | Look carefully. |
| Glimmer | How do you express yourself? | Express yourself. |
| Bloomara | What connects you? | Connection changes the board. |
| Transcendia | What are you becoming? | Change creates possibility. |
| Quintara | What do you believe? | Not everything is what it appears to be. |
| Iridescia | Can you flow? | Move with the system. |
| Aurelia | What will you protect? | Position is power. |
| Infinity Isles | What is possible? | Possibility has no edge. |

### Lumina

Observation and recognition. Mechanical language: reflection, illumination, radiance, recognition, locks, revealing, mirrored spaces, connected light.

### Glimmer

Movement, rhythm, sequence, or performance. Puzzle thinking stays central. The Land must not become reflex-only.

### Bloomara

Relationships between board regions. Mirroring, pairing, synchronization, dual states, linked cells, mirrored chambers, paired paths.

### Transcendia

Board state or objects may evolve. Transformation, elevation, metamorphosis, portals, ascending structures.

### Quintara

Assumptions may be challenged, but outcomes stay fair and learnable. Never use arbitrary randomness to create confusion.

### Iridescia

Movement and flow. Currents, drift, floating structures, changing pathways — all on authored graph edges.

### Aurelia

Strategic positioning and territory. Boundaries, fortified spaces, central courts, defensive structures.

### Infinity Isles

May challenge spatial assumptions more aggressively. Underlying rules remain internally consistent. Orbit, portals, rings, islands, wormholes.

## Mechanical verbs

Verbs are design vocabulary until a mechanic associates with them. The registry accepts future verbs without an engine rewrite.

Canonical set includes: illuminate, reflect, reveal, lock, unlock, rotate, synchronize, pair, transform, ascend, elevate, evolve, shift, conceal, misdirect, flow, drift, protect, occupy, fortify, orbit, redirect, connect, separate, spotlight, sequence, wormhole.

A verb does not require its own engine system.

## Mechanic contract

A mechanic declares: id, Land id, version, status, activation, affected board/cells/occupants/edges, match/cascade/movement/objective/obstacle interactions, lifecycle hooks, serialization, determinism, accessibility, debug description, difficulty influence, dependencies, conflicts, topology permissions, and invariants.

Status is `reserved` | `experimental` | `implemented`. The eight Land placeholders (`land.lumina` … `land.infinity-isles`) remain `implemented: false`.

### Lifecycle

`beforeMove → move → afterMove → beforeMatch → match → afterMatch → cascade → settle → objectiveEvaluation`

Hooks are optional. The engine asks the registry and skips unimplemented handlers.

### State

Mechanic state is `{ id, mechanicId, version, payload }`. It must live in serializable game state (`AuthoritativeGameState.mechanicStates`). Initialize, serialize, deserialize, and compare are part of the contract.

### Determinism

Same board state + mechanic state + move + RNG seed → same result. Hidden `Math.random()` is forbidden. If a mechanic uses randomness, it uses `SeededRandom`.

### Effects

Explicit and inspectable: cell/occupant/edge/topology/obstacle/objective/movement changes, visual/audio/haptic cues, discovery. Avoid hidden mutation.

### Topology

Approved future mutations: enable/disable edge, redirect traversal, rotate occupants, open/close route, temporary connectivity, alter flow, synchronize paired regions, move a chamber, reveal a hidden route.

Mechanics operate on cell ids, authored edges, direction labels, and mechanic state. **Never x/y.** Coordinates are presentation.

## Composition

A level may list `mechanics: ["mechanicA", "mechanicB"]` or `{ id, priority }` bindings. The registry resolves order, dependencies, conflicts, compatibility, and state isolation.

The validator fails loudly on:

- duplicate ids
- missing or circular dependencies
- invalid lifecycle order
- incompatible exclusive topology mutations
- cross-Land use without `crossLand: true`
- color-only accessibility
- attempts to redefine Special Icons or assign the Glitter Icon to a Land

It does not auto-repair conflicts.

## Isolation

- A Land mechanic must not silently alter another Land.
- Universal Special Icons remain universal inventory. No Land-specific copies.
- The Glitter Icon remains landless and uses the existing universal-match contract. No new Glitter powers here. **Matching is graph-authoritative**; Land DNA does not invent per-Land match geometry from coordinates. Land-specific match rules remain unregistered (`land-registered` is reserved). See `MATCH_RULES.md`.

## Accessibility

Every Land and every mechanic declares reduced-motion behavior, non-color communication, text/state descriptions, optional audio/haptics, timing accommodations, and how state changes are indicated. Gameplay state must remain representable when the visual presentation changes.

## Difficulty metadata

Lands expose `difficultyBias`. Mechanics expose `difficultyInfluence` axes. This is authoring metadata, not calculated player difficulty and not adaptive difficulty.

## Testing

`runMechanicHarness` tests a mechanic against a development board fixture, seed, move, expected effects, and expected state. `dev.echo` is a development-only contract primitive. It is not a Land mechanic and not campaign content.

Invariant checks run in the harness: valid graph references, no orphan cells, no invalid edges, possible occupants, determinism, serialization integrity, graph authority, Special Icon isolation, Glitter isolation.

## Finale and progression

Each Land may later designate Level 80 as a signature finale. Those references are **empty**. Mechanic introduction lists and Gate transition refs are empty. Do not author 640 level entries here.

## Boundary

Land DNA is the mechanical identity layer. It is not production art, story, Gates, Sanctuary, Museum, Personal Story, adaptive difficulty, a CMS, or any production level.

Future Land handlers compose **mechanic primitives** (state, topology, pairing, paths, …). Those primitives stay Land-neutral. See `MECHANIC_PRIMITIVES.md`.
