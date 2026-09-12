# Level Runtime Architecture

`LevelRuntime` is the session orchestrator for Glitter Match. It conducts existing engines through one deterministic, transactional playable turn. It is not a second match engine, cascade engine, objective engine, or progression engine.

There is no campaign content here. Development fixtures remain fixtures.

## Responsibility

The runtime owns:

- session identity (runtime id, level id, content version, seed)
- explicit lifecycle
- load pipeline (validate → compatibility → initialize → ready)
- player-move contract and illegal-move rejection
- turn sequencing and transaction boundaries
- monotonic event sequencing
- snapshot / restore
- replay coordination
- accessibility *state* (not CSS)
- orchestration-level explanations

It does not own:

- graph topology or movement legality
- match / pattern detection
- Special Match creation or activation
- effect mutations
- cascade settle / refill
- objective counting
- win-state policies
- unlock graphs
- presentation / animation

## Engine boundaries

```
BOARD GRAPH
    ↓
MOVEMENT          canAttemptSwap / swapOccupants
    ↓
MATCH ENGINE      detectMatches (no-match check only)
    ↓
SPECIAL MATCH + EFFECT + CASCADE
                  runCascade  (authoritative combined pipeline)
    ↓
OBJECTIVE ENGINE  ingestCascade / evaluateRuntime
    ↓
WIN-STATE RESOLVER
    ↓
PROGRESSION ENGINE  startAttempt / completeAttempt / failAttempt
                    (only when a ProgressionRuntime is attached)
```

`GameSession` is a compatibility facade. There is one play path.

## Lifecycle

```
UNINITIALIZED
    ↓
LOADING
    ↓
READY
    ↓
AWAITING_MOVE
    ↓
RESOLVING_MOVE
    ↓
RESOLVING_MATCHES
    ↓
RESOLVING_SPECIALS
    ↓
RESOLVING_CASCADE
    ↓
EVALUATING_OBJECTIVES
    ↓
EVALUATING_OUTCOME
    ↓
AWAITING_MOVE | COMPLETE | FAILED
```

Additional terminal states:

- `DEAD_UNRECOVERED` — existing fairness recovery failed
- `ERROR` — load failed after `LOADING`, or the runtime cannot accept play

Invalid operations are rejected. You cannot move while loading, resolving, complete, failed, or dead.

Match / special / cascade lifecycle states are orchestration markers. The authoritative combined implementation remains `runCascade`.

## Move pipeline

1. Reject if the lifecycle cannot accept a move
2. Ask the Board Graph / movement system (`canAttemptSwap`) — never x/y
3. Snapshot committed gameplay state
4. Apply the swap
5. Detect matches (Match Engine)
6. Apply the existing no-match policy
7. `runCascade` (matches, specials, effects, settle, refill, repeat)
8. Evaluate objectives (`after-cascade`, `end-of-turn`)
9. Evaluate win / failure
10. Record progression if attached
11. Commit turn, append replay tape, await next move or enter a terminal state

## No-match policy (existing, not newly canonized)

The runtime exposes the already-shipped `level.swap.requireMatch` contract:

| Policy | When | Behavior |
|---|---|---|
| `reject-revert` | `requireMatch` true (default) | Restore snapshot. No turn advance. No RNG. No objectives. Status `NO_MATCH`. |
| `commit` | `requireMatch` false | Keep the swapped board and continue the pipeline. |

This is an inspectable engine contract, not a new player-facing design decision.

## Transaction boundary

A snapshot includes:

- board, occupants, topology, rotation
- Special Match runtime
- objective runtime
- stats, combo, move remaining, last cascade
- RNG snapshot
- turn number, event sequence, replay tape
- attempt, legacy progression blob, accessibility settings
- lifecycle / session status

Rollback restores that snapshot. Partial resolution is never presented as committed state. Progression has its own transaction; a progression error does not unwind a completed board.

## Event ordering

Every significant runtime event has a monotonic `eventSequence`. Wall-clock time is not a gameplay dependency. Cascade diagnostics may still record duration for humans; they are not used for ordering.

## Progression integration

If a `ProgressionRuntime` is attached and the catalog contains the mapped node (`progressionNodeId` or the level id):

- load → `startAttempt` (`LEVEL_STARTED`, `LEVEL_ATTEMPTED`)
- complete → `completeAttempt` (`LEVEL_COMPLETED`, maybe `BEST_RESULT_UPDATED`)
- fail → `failAttempt` (`LEVEL_FAILED`)

Unlock evaluation stays in Progression. The runtime never calls `evaluateUnlock` or `recalcAvailability`. Completion is not mastery.

## Replay and state identity

`RuntimeReplay` stores level id, content/schema versions, seed, initial state hash, and the existing `ReplayTape`. Replaying the same seed and moves must reproduce the gameplay hash. Incompatible content versions fail with `REPLAY_ERROR`.

`stateHash()` fingerprints occupants, active Special Matches, objective progress, stats, moves, turn, RNG, and lifecycle. Presentation-only data is excluded.

## Error codes

`INVALID_LEVEL`, `INVALID_INITIAL_STATE`, `INVALID_MOVE`, `RUNTIME_STATE_ERROR`, `ENGINE_RESOLUTION_ERROR`, `CASCADE_SAFETY_LIMIT`, `REPLAY_ERROR`, `RESTORE_ERROR`, `PROGRESSION_ERROR`.

Cascade safety terminations (`CASCADE_LIMIT_REACHED`, `CASCADE_STATE_REPEAT`) are surfaced from the existing Cascade Engine. `CASCADE_INVALID` rolls back.

## Board Lab

Developer-only Runtime panel:

- load the current engine fixture as a development level wrapper
- inspect lifecycle, hash, seed, attempt, outcome
- submit the two selected cells as a graph-authoritative move
- snapshot / restore
- replay the recorded move tape

Fixtures keep `purpose: "engine-fixture"`. They are not production levels.

## Intentionally deferred

- Inventory Special Icons as a move type
- Production campaign / 640 levels / Land mechanics
- Online replay service
- Presentation animation
- New no-match or move-consumption rules beyond the existing `requireMatch` contract
