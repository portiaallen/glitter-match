# Special Match Engine

This document is the contract for converting Match Rule **candidates** into board **Special Match** instances and resolving them inside the existing cascade.

**640 levels, Level 1, Level 80, production puzzles, Land-specific Special Matches, inventory economy, and final visual identity are not part of this implementation.** Fixtures under `data/lab/special/` are engine tests only (`purpose: "engine-fixture"`).

## Special Match vs Inventory Special Icon

These systems must stay separate:

| Board Special Match | Inventory Special Icon |
|---|---|
| Created dynamically by matching | Player-owned strategic resource |
| Lives in game state / board occupants | Lives in inventory counts |
| `line-clear`, `area-clear`, `cross-clear` (generic engine-test categories) | Glitter Bomb, Glitter Hammer, Prism, Wild Card, Magic Swap, Glitter Lightning |
| Registered in `SpecialMatchRegistry` | Catalogued in `src/special-icons/` with `implemented: false` |

The engine must never treat an inventory Special Icon as an automatically created board Special Match. Schemas, activation, and economy are not merged.

The Universal Glitter Icon remains landless and ordinary/dev wild only. This layer does not give it bomb, line-clear, combo, generator, or currency powers.

## Architecture boundaries

```
Board Graph
  → Match Engine
  → Special Match Engine
  → Effect System (Prompt #6 primitives)
  → Cascade Engine
  → Objective Evaluation
```

The Special Match Engine consumes Match Engine outputs (groups + candidates). It emits primitive effects. It must not own the board graph, duplicate matching, duplicate the effect system, own objectives, own economy, own inventory Special Icons, or implement Land-specific mechanics.

Do not write `if (land === "lumina")` here. Land behavior arrives later through the Land Mechanic Registry.

## Registry

`SpecialMatchRegistry` is data-driven. Each type registers:

- id, version, display/debug name, category
- creation eligibility (candidate types it may consume)
- anchor policy, matched-cell preservation policy
- activation triggers (only those listed fire)
- consumption policy
- interaction notes (ordinary matches, other specials, cascades, obstacles, topology)
- deterministic + accessibility + debug + serialization + validation + test-harness metadata
- `emitEffects` handler

Cascade code must not branch `if (specialType === ...)`. It looks up the registered handler.

Shipped generic categories (engine-test identity, not final art):

| Type | Candidate eligibility | Priority |
|---|---|---|
| `cross-clear` | `cross`, `T` | 50 |
| `line-clear` | `line-5`, `line-4`, `line` | 25 |
| `area-clear` | `L`, `cluster-special` | 15 |

Mapping `T → cross-clear` and `L → area-clear` is a **generic test mapping**, not locked player-facing design.

## Candidate vs instance

`SpecialMatchCandidate` is evidence that a match qualifies. It must not mutate the board.

`SpecialMatchInstance` is a serializable board-state object:

```
instanceId, typeId, typeVersion, anchorCellId, sourceMatchGroupId,
createdAtMove, createdAtCombo, state, activationState, metadata
```

Instance ids are deterministic: `sm:{typeId}:{anchor}:{groupId}:{move}:{seq}`.

Activation ids: `act:{seq}:{instanceId}:{trigger}`.

No `Date.now()`, random UUIDs, screen coordinates, or animation state.

## Creation pipeline

Match Engine (unchanged, no board mutation):

```
Detect → Group → Resolve Overlaps → Identify Special-Match Candidates → Mark → Events
```

Cascade continuation:

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

Overlap analysis remains Prompt #7 `keep-all`. Losing candidates stay inspectable (`SPECIAL_CANDIDATE_DEFERRED`). Creation policy decides which candidates become instances.

Default creation policy: `priority-unique-anchors` using Prompt #7 order **cross > T > L > line-5/line-4 > cluster-4+**. More than one Special Match may be created when anchors do not collide. There is no global “one match = one special” rule.

## Anchor selection

Never infer anchors from x/y, visual center, array index, or screen position.

| Policy | Behavior |
|---|---|
| `authored-candidate` | Candidate anchor if it is a known affected cell |
| `match-created` | Same as authored when present, else canonical |
| `canonical-cell` | Lexicographically smallest affected cell id |
| `rule-selector` | Reserved; falls back to canonical unless a valid authored anchor exists |

Same board, match group, and seed produce the same anchor.

## Matched cells vs preservation

Creation cell policies are registered per type. Default shipped types use `preserve-anchor`: the anchor becomes the Special Match occupant; other matched cells clear. Alternatives (`clear-all`, `preserve-all-matched`) exist so future types do not rewrite the cascade.

## Activation lifecycle

```
Created → Armed → Triggered → Resolving → Resolved
                                 ↘ Cancelled
```

Supported trigger concepts: `direct`, `matched`, `adjacent-match`, `struck`, `cascade`, `topology`, `mechanic`.

Shipped types register `direct`, `matched`, `adjacent-match`, and `struck` only. They do **not** auto-fire on the creating combo (`createdThisCombo` skip) and do not register `cascade`.

Every activation has a unique id. Duplicate pending activations, resolved/cancelled instances, and unregistered triggers are rejected.

Default consumption: `consumed` (occupant cleared). Other policies (`remain`, `transform`, `replace`, `inactive`) are reserved on the contract.

## Activation ordering

When multiple Special Matches activate in one cascade:

1. triggering event sequence
2. creation move
3. Special Match priority
4. anchor cell id
5. instance id

Not JavaScript object order, DOM order, render order, or visual position.

## Effect integration

Activation emits Prompt #6 primitive effects, typically `change-occupant`.

```
Special Match → Activation Event → Effect Batch → Validate
  → Apply Transactionally → Result Events → Settle
```

If a batch fails validation, authoritative state is not partially mutated. The instance returns to `armed` and the cascade reports `CASCADE_INVALID`.

There is no second effect system.

## Special ↔ Special

`SpecialInteractionRegistry` holds explicit interactions. Default registered behavior: `strike-activate` — if an effect targets another Special Match cell and that type registered `struck`, queue the target. If nothing is registered, the safe default is `ignore`. The engine does not invent combos.

## Special → ordinary matches

Special effects change the board. The **same** Match Engine then detects ordinary matches, which may produce new candidates and new Special Matches. There is no separate “special cascade engine.”

## Obstacles

Special Matches emit effects. `ObstacleHandler.respondToSpecialEffect` decides `apply | block | weaken | unlock | reveal | redirect | ignore`. Lock/ice currently weaken (durability −1) and block clear while durability remains. Special implementations do not hardcode obstacle ids beyond asking the registry.

## Cascade lifecycle

Recommended cycle:

1. Player move
2. Detect / group / overlap / special candidates
3. Create specials / apply match resolution
4. Settle
5. Activate triggered specials / resolve effects
6. Settle
7. Detect again
8. Evaluate objective / complete turn

Internal phases recorded on `CascadeReport.steps`: `detect`, `resolve`, `effects`, `move`, `special-activate`, `refill`, `complete`.

Gameplay state does not wait on animation, frame rate, or render order. `diagnostics.durationMs` uses wall time for development metrics only.

## Cascade safety

Explicit terminations:

- `CASCADE_COMPLETED`
- `CASCADE_LIMIT_REACHED`
- `CASCADE_STATE_REPEAT`
- `CASCADE_INVALID`

Limits (`maxCombos`, `maxDepth`, `maxEffects`, `maxEvents`, `maxActivations`) are configurable and validated. A bound is not proof that a puzzle is unsolvable.

Repeated-state detection fingerprints occupants + **active** instance states + pending activations after each full cycle. The event log is excluded so debug appends cannot hide a loop.

## Serialization and replay

`AuthoritativeGameState.specialMatches` stores instances, pending activations, sequences, and events.

`serializeSpecialMatchState` / `serializeSpecialMatchRuntime` round-trip. Occupants encode as `special-match:{typeId}:{instanceId}`.

Replay reconstructs from board definition + initial occupants + seed + move sequence. The tape records `special-match` events as assertions (created ids, termination). The engine recomputes logic; the resulting board is not the primary source of truth.

## Explainability

Machine-readable kinds include `SPECIAL_CANDIDATE_IDENTIFIED`, `SPECIAL_CANDIDATE_DEFERRED`, `SPECIAL_MATCH_CREATED`, `SPECIAL_MATCH_TRIGGERED`, `SPECIAL_MATCH_ACTIVATED`, `SPECIAL_MATCH_EFFECT_EMITTED`, `SPECIAL_MATCH_CONSUMED`, `SPECIAL_MATCH_RESOLVED`, `SPECIAL_MATCH_CANCELLED`, `SPECIAL_INTERACTION_RESOLVED`, and the cascade termination kinds.

Human debug questions: why created, why this anchor, which group, which candidates, which policy, why activated, which effects, which cells/edges, why the cascade continued or stopped.

## Accessibility

Labels describe gameplay state: `"Line-clear Special Match at cell C17"`, not `"Purple glowing thing"`. Contracts include text, pattern id, high contrast, reduced motion, optional audio/haptic cue ids. Color is never the only indicator.

## Board Lab

Developer-only Special Match panel: load an engine fixture, resolve a legal match, inspect candidates / priority / creation policy / instances, trigger registered activations, inspect effects, step recorded cascade phases, serialize, and replay. Fixtures remain `purpose: "engine-fixture"` and must not become campaign content.

## Validation

Fails loudly on unknown type/version, invalid policies/triggers, unknown effect/obstacle handlers, duplicate or orphan instance ids, invalid lifecycle, malformed serialized state, and out-of-bounds cascade limits. The engine does not repair malformed Special Match state.

## Performance

Correctness first. Work is bounded by cascade limits. Development diagnostics record event/effect/activation/depth/mutation counts and duration. There is no persistent match-result cache.

## Known limitations

- Shipped types are generic engine-test categories, not final player-facing Special Matches.
- `T → cross-clear` and `L → area-clear` are temporary test mappings pending Portia’s approval.
- No Land-specific Special Match modifiers.
- Inventory Special Icons remain unimplemented and unused here.
- Glitter Icon behavior is unchanged.
- Combo powers beyond registered strike-activate are not designed.
- Animation is presentation-only and is not implemented as gameplay.

## Approval items

See the Prompt #8 report: generic category names, candidate→type mapping, default creation/anchor/consumption policies, no auto-fire on the creating combo, strike default, and lock/ice weaken response.
