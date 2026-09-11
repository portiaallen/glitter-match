# Progression & Level-State Engine

This document is the contract for **level identity, availability, attempts, completion, mastery, unlocks, and aggregate progress**.

**640 levels, Level 1, Land finales, production unlock chains, story, rewards, Gates, Sanctuary, Museum, and Personal Story are not part of this implementation.** The development universe under `src/progression/fixtures.ts` / `data/lab/progression/` is an engine test fixture (`purpose: "engine-fixture"`).

## Content vs player progress

```
Level Definition (content)
  +
Player Progress (save)
  →
Level State (derived view)
```

Never mutate level content to represent a player's save. A content validator must not read player progress.

## Hierarchy

```
Universe
  → Land (reference to Land Registry; not duplicated)
  → Level Pack
  → Level (stable id, never array index)
```

The engine does **not** require 8 Lands or 80 levels to function. Those numbers are campaign canon, not progression algorithms. Do not write `if (completedLevels === 640)` or `if (land === "lumina")`.

Level references: `{ universeId, landId, packId, levelId }`. Unknown references fail loudly.

## Availability dimensions

Kept separate:

- availability: `UNAVAILABLE` | `LOCKED` | `AVAILABLE`
- play: `NOT_STARTED` | `IN_PROGRESS` | `ABANDONED`
- completion record
- mastery: `NOT_ATTEMPTED` | `NOT_MASTERED` | `MASTERED`

A derived view status (`LOCKED` / `AVAILABLE` / `IN_PROGRESS` / `COMPLETED` / `MASTERED`) is for debug/a11y only.

## Unlocks

Composable conditions reuse the existing composition ops (`and` / `or` / `sequence` / `not`) plus `count` / `always` / `level-completed` / `level-mastered` / `pack-completed` / `land-completed` / `event`. Evaluation is handler-dispatched, not a session `if (type === …)` chain.

Prerequisites are a graph. `nextLevel = current + 1` is not authoritative. A node may have one next, many next, optional branches, or none.

Unlock recalculation walks every node in the universe after a transaction (**correctness first**, bounded by catalog size). Documented as full catalog recalc.

## Attempts, completion, best result, mastery

Attempts are independent of completion (`in-progress` / `completed` / `failed` / `abandoned`). Completion answers “has this level ever been completed?” Mastery is stored separately and versioned. Best result uses a registered comparator (`higher-score`, `fewer-moves`, `mastery-then-score`). Equal results pick the lexicographically smaller attempt id.

Replay: progression stores a **reference** (`seed`, `contentVersion`, `moveCount`), not a full tape.

## Versions

Historical completions are `VALID` / `STALE` / `INVALIDATED` / `UNKNOWN` from semver comparison. No production migration policy is invented here.

## Aggregates

Pack, Land, and Campaign progress are **derived** from level state. Land completion policies: `ALL_REQUIRED_LEVELS` | `REQUIRED_THRESHOLD` | `FINALE_COMPLETION` | `CUSTOM_REGISTERED_POLICY`. Production policy is unassigned. Finale eligibility is a registered unlock condition on a `kind: "finale"` node — no production finales.

Post-campaign nodes (`post-campaign`, `event`, `challenge`, `adaptive`, `gate-experience`, `story`) exist as kinds. The engine does not terminate at an imagined campaign end.

## Events, idempotency, atomicity

Events include `LEVEL_UNLOCKED`, `LEVEL_STARTED`, `LEVEL_ATTEMPTED`, `LEVEL_COMPLETED`, `LEVEL_FAILED`, `LEVEL_MASTERED`, `BEST_RESULT_UPDATED`, pack/land/campaign updates. Gate/reward/achievement kinds are **boundaries only**.

Stable ids (`attemptId:KIND` or `LEVEL_UNLOCKED:levelId`) make duplicate delivery a no-op.

Updates clone player state, apply, validate, and replace. Validation failure restores the snapshot.

Timestamps are not used for logical decisions. Sequence numbers order events.

## Persistence

`serializeProgression` / `restoreProgression`. Restore validates unknown ids, impossible mastery, orphaned attempts, and duplicate attempt ids. No silent repair.

## Accessibility

Status text: Locked / Available / In Progress / Completed / Mastered. Non-color indicator `PROG:LOCKED`. Reduced-motion note. Optional audio/haptic cue ids.

## Board Lab

Developer-only Progression panel: inspect availability, explain locks, simulate complete/fail/mastery, inspect aggregates, serialize/restore. Not player-facing campaign UI.

## Boundaries

Progression does not own board, match, Special Matches, objectives, score formulas, economy, rewards, achievements, Gates, Sanctuary, Museum, or Personal Story. It consumes results and emits events those systems may later listen to.

`createNewProgression()` starts empty (no Land pre-unlocked). Legacy `recordLevelClear` remains for session compatibility and does not grant currency.
