# Objective & Win-State Engine

This document is the contract for **what a level asks the player to accomplish**, how progress is tracked, and how a level becomes complete or failed.

**640 levels, Level 1, Level 80 finales, Land-specific objectives, campaign balancing, story, secrets, rewards, Glitter Gates, Sanctuary, Museum, and Personal Glitter Story are not part of this implementation.** Fixtures under `data/lab/objectives/` are engine tests only (`purpose: "engine-fixture"`).

## Architecture boundaries

```
Board Graph
  → Gameplay Events
  → Objective Engine
  → Win-State Resolver
  → COMPLETE / INCOMPLETE / FAILED  (level: IN_PROGRESS / COMPLETED / FAILED)
```

An **Objective** describes something the player must accomplish. A **Win State** decides whether the *level* succeeded. Do not assume one objective = one level. A level may have one objective, many objectives, staged objectives, or a hybrid tree.

The Objective Engine may consume board, match, Special Match, obstacle, cascade, score, topology, and discovery events. It must not own:

- board movement
- matching
- Special Match behavior
- obstacle behavior
- score calculation
- economy / inventory
- Land mechanics

Do not write `if (land === "lumina")` here. Land-specific verbs arrive later through registered content. Objective completion must not grant Glitter Gems, paid currency, or purchases. Completion emits state; a future Reward System may listen.

**Completion ≠ Mastery.** Mastery (efficiency, optional challenges, secrets, perfect clears) is a reserved boundary. Optional and mastery-role objectives never block `ALL_REQUIRED_OBJECTIVES`.

## Registry

`ObjectiveRegistry` is data-driven. Each category registers a handler contract:

- id / type, version, category
- parameter schema (Zod + `validateObjectiveDefinition`)
- activation / progress / completion / failure
- evaluation timing (`EVALUATION_PHASES`)
- dependencies and composition
- serialization + replay determinism
- accessibility + debug metadata
- `testHarness: true` (engine tests, not campaign content)

Evaluation is `registry.get(type).evaluate(...)`. There is no session-level `if (objective.type === ...)`.

## Categories (engine verbs, not levels)

| Category | Default count unit | Contract |
|---|---|---|
| collection | icon | Collect N of target X (icon/cell/artifact/state/event). `maxCount` optional. |
| clearing | cell | Clear a registered cell set. Not “remove everything.” |
| path | board-state | Graph path via authored edges. Never x/y or visual proximity. |
| score | score | Ask the score engine whether a threshold was reached. Does not own scoring. |
| combo | event | Count explicit combo events or `stats.maxCombo`. Cascades are not combos unless `REGISTERED_COMBO` is listed. |
| precision | move | Deterministic efficiency / move-threshold / forbidden-event conditions. |
| survival | cascade | Survive turns/cascades/registered hazards. Turn/move based, not wall-clock. |
| pattern | board-state | Ask the registered pattern evaluator / occupancy. Does not duplicate matching. |
| discovery | unique-target | A registered discovery event or reveal occurred. No production secrets. |
| multi-stage | stage | Ordered stages; only completed + active stage receive progress. |
| hybrid | event | AND / OR / SEQUENCE / NOT trees. |

Path default remains **cleared endpoints** for existing fixtures. `pathMode: "graph"` uses `findPath` on authored connectivity.

## Objective state

Serializable `ObjectiveState`:

- objective ID + version
- progress (`previous`, `current`, `target`)
- `INCOMPLETE` / `COMPLETE` / `FAILED` (not a boolean)
- role: `required` | `optional` | `mastery`
- active stage, counters, seen-key aggregates
- last event / reason
- metadata

Do not store a full event log inside a state record. The runtime keeps a compact event tape for debug/replay references. Progress changes emit `OBJECTIVE_PROGRESS_CHANGED` with previous/new values, source event, and reason.

## Events and evaluation timing

Objectives react to authoritative events. They do not poll the board every frame and do not evaluate during animation.

Phases: Before Move, After Move, After Match Resolution, After Special Resolution, After Cascade, After Board Settlement, After Objective Event, End of Turn, Level Evaluation.

Cascade ingest order:

```
Player Move → Match → Cascade → CASCADE_COMPLETED → Objective Evaluation
```

`ingestCascade` maps cascade/special events once per report. Do not ingest the same report twice. Collection/score/clearing read authoritative `GameStats` so re-evaluation does not double-count.

Special Match integration consumes `SPECIAL_MATCH_CREATED` / `ACTIVATED` / `RESOLVED` only. Topology handlers listen for `TOPOLOGY_CHANGED`; other objectives ignore it.

## Counting semantics

The schema declares `countUnit` where relevant (`cell` vs `match-group` vs `event`, …). Handlers define what increments:

- collection: collected icons in stats (aggregates already include cascade/special clears)
- clearing: unique cells with a clear count
- combo: `maxCombo` **or** listed event kinds
- survival: completed cascades / survived moves
- path/pattern: board-state predicates (0/1 or occupancy matches)

## Multi-stage and hybrid composition

Stages have id, objective reference, activation, completion, failure behavior, and progress. There is no hardcoded stage cap. Future stages do not receive active progress until prior stages complete.

Hybrid trees support AND, OR, SEQUENCE/THEN, and NOT. Validation rejects missing children, NOT without exactly one child, AND/OR/SEQUENCE with fewer than two children, duplicate ids, and self-NOT.

## Dependencies

`dependsOn` references other objective ids. Progress is skipped until dependencies are `COMPLETE`. Validation fails on missing ids and cycles.

## Win-State Resolver

Consumes objective states + level constraints.

| Completion policies | Failure policies | Conflict |
|---|---|---|
| `ALL_REQUIRED_OBJECTIVES` | `NONE` | `completion-first` (default) |
| `ANY_REQUIRED_OBJECTIVE` | `ANY_FAILURE` | `failure-first` |
| `SEQUENCE_COMPLETE` | `ALL_FAILURES` | |
| `CUSTOM_REGISTERED_POLICY` | `MOVE_LIMIT` | |
| | `REGISTERED_FAILURE_CONDITION` | |

Failure evaluation is independent of completion. When both become true in the same phase, `conflictPolicy` is the explicit precedence. **Do not assume a move limit is a failure.** Default: `MOVE_LIMIT` only when the level authored a move limit; otherwise `NONE`. Last-move completion still wins under `completion-first`.

`CUSTOM_REGISTERED_POLICY` currently falls through to all-required until a custom handler is registered. `REGISTERED_FAILURE_CONDITION` currently treats any `FAILED` objective as failure.

The resolver explains why complete / incomplete / failed, which required ids remain, and which optional ids completed.

## Accessibility

Definitions carry text progress, non-color status (`OBJ:INCOMPLETE:7/10`), high contrast, large readable values, reduced-motion notes, and optional audio/haptic cue ids. Progress must not depend solely on color, animation, particles, or sound.

Examples: `"Collect 7 of 10 required icons."` / `"Objective complete."` / `"Objective incomplete. 3 remain."`

## Serialization and replay

Objective state versions (`9.0.0`). Round-trip: serialize → deserialize → canonical comparison. Same level + seed + move sequence must reproduce progress, stage transitions, completion, failure, and win-state. Replay tapes record `objective` events (`complete`, `status`, `winState`, `current`, `target`) as assertions; the engine recomputes.

Evaluation never depends on wall-clock time, frame rate, animation, unseeded RNG, DOM order, or object iteration order.

## Validation

Fails loudly (no silent repair) on unknown id/type, unregistered handler, incompatible version, invalid parameters, missing references, dependency cycles, malformed composition, invalid completion/failure/counting metadata, and missing accessibility when an id is also missing.

## Board Lab

Developer-only Objective panel: load an engine fixture, inspect state, play moves, watch cascade effects, inspect completion/failure/dependencies/explanations, serialize, and replay. Fixtures remain `purpose: "engine-fixture"` and must not become campaign content.

## Known limitations

- Category handlers are engine verbs, not production level designs.
- Score formulas stay in the session/cascade (`cellCount * 10 * combo`). Objectives only ask the threshold.
- Path `graph` mode is opt-in; default cleared-endpoints preserves existing tests.
- Pattern objectives verify a registered pattern id, then test occupancy/`iconByCell`. They do not re-run the full match pipeline as the success condition.
- No wall-clock timers. A future timer contract must be deterministic and isolated.
- No Reward System. Existing development fixture `level.rewards` on win is pre-existing session behavior, not new economy.
- `CUSTOM_REGISTERED_POLICY` has no custom plugins yet.

## Approval items

See the Prompt #9 report: default `completion-first` conflict, move-limit failure only when a limit is authored, combo vs cascade, path default vs graph mode, and pattern occupancy vs full detect.
