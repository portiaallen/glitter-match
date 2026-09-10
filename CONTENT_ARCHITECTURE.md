# Content Architecture

This document is the Game DNA contract for Glitter Match.

**640 levels are future content. They are NOT part of this implementation.**

This phase defines how levels will be authored later. It does not create Level 1, Level 80, the campaign, production puzzles, or secret mechanic implementations.

## Hierarchy

```
Universe (glitter-universe)
  └── Land (exactly 8)
        └── Level Pack (independently versionable)
              └── Level (Level DNA document)
```

Board Laboratory files under `data/lab/` are **engine test fixtures**, not packs and not levels. They cannot be promoted to production by renaming.

## Level DNA

A level is data. The engine consumes definitions; it does not contain level-specific logic.

Canonical formula:

Board Shape + Topology + Symmetry + Movement + Match Rules + Icon Pool + Objective + Obstacles + Land Mechanic + Difficulty + Twist + Secret + Mastery + Story + Rewards

Plus: Land ID, move/timer, accessibility, validation metadata, schema/content versions.

`shape` is a human label. The engine never branches on it.

## Difficulty

Difficulty is **not** easy/medium/hard. Thirteen authored axes, each 0–10:

movePressure, topologyComplexity, obstacleDensity, objectiveComplexity, mechanicComplexity, planningDepth, cascadeDependency, rngSensitivity, timingDemand, spatialAwareness, precision, multitasking, recoveryDifficulty.

Supports designer ratings, validation, future analytics, and future adaptive difficulty. Adaptive difficulty is not implemented.

Progression is intentionally non-linear. Rest levels are first-class.

## Rule of Three

`ruleOfThree: { familiar, new, surprising }`

This is a design contract. The validator checks that production DNA includes all three lists. It does not generate levels.

## Rule of Rest

`pacing` may be: rest, standard, escalation, finale, discovery, mastery, experimental.

Rest is allowed. Not every level must escalate.

## Wonder and discovery

Secrets and discoveries are **references**: optional, hidden, trigger, reward/Museum/lore refs, accessibility labels.

A secret is never required for core completion unless it is also authored as a discovery objective.

No production secrets are implemented here.

## Eight Lands

| Land | Question |
|---|---|
| Lumina | Who are you? |
| Glimmer | How do you express yourself? |
| Bloomara | What connects you? |
| Transcendia | What are you becoming? |
| Quintara | What do you believe? |
| Iridescia | Can you flow? |
| Aurelia | What will you protect? |
| Infinity Isles | What is possible? |

Each Land has full Land DNA: id, slug, name, question, theme, mechanical verbs, board/movement/match/obstacle/objective language, difficulty bias, visual/audio language, accessibility considerations, progression metadata, and an unresolved Level 80 finale reference. **Land DNA defines the language of each Land. It does not define the individual puzzles.** See `LAND_DNA.md`. **Land mechanics are not implemented.**

## Icon Law

ONE LAND. ONE ICON FAMILY. ZERO DUPLICATES.

1. Every ordinary icon belongs to exactly one Land.
2. No ordinary icon may belong to multiple Lands.
3. No duplicate ordinary icon definitions.
4. No unauthorized Land.
5. The Universal Glitter Icon belongs to no Land.
6. Universal Special Icons belong to no Land.
7. Ordinary icons cannot silently become universal.
8. An icon cannot be reassigned between Lands without an explicit content-version change.

Canonical families (8 icons each) are registered as identity data, not as campaign puzzles. The Glimmer Champagne Glass is a decorative / non-alcoholic visual theme and must not become an alcohol mechanic.

## Universal icons

- **Glitter Icon** (`glitter`): landless. Matches ordinary icons using the existing universal-match contract. No extra behavior.
- **Special Icons** (inventory, not board matches): Glitter Bomb, Glitter Hammer, Prism, Wild Card, Magic Swap, Glitter Lightning. These are not Special Matches created from patterns.
- **Board Special Matches** are a separate engine layer (`SPECIAL_MATCH_ENGINE.md`). Generic test categories exist (`line-clear`, `area-clear`, `cross-clear`). They are not inventory items and are not production content.

## Mechanic registry

Land behavior is a handler contract: id, Land, version, status, activation, affected state, lifecycle hooks, serialization, determinism, accessibility, difficulty influence, dependencies, conflicts, topology permissions, invariants.

The engine asks the registry, runs declared hooks, and collects explicit effects. It must not contain `if (land === "lumina")` (or equivalent) in core systems.

All eight Land handlers (`land.lumina` … `land.infinity-isles`) are reserved and unimplemented. `dev.echo` exists only for the mechanic test harness.

Reusable gameplay primitives live in `src/primitives/` and are documented in `MECHANIC_PRIMITIVES.md`. Primitives are building blocks, not Land content and not campaign levels.

## Objectives and obstacles

Objective types: collection, clearing, path, score, combo, precision, survival, pattern, discovery, multi-stage, hybrid.

Obstacles expose blocking, match/movement/cascade hooks, serialization, and an accessibility description. Implemented now: lock, ice. Other types remain reserved.

## Movement and match rules

Movement is graph traversal. A level may author swap rules, constraints, directional/rotation flags, limits, and timing. Never `y + 1 = gravity` and never x/y neighbor inference.

Match contracts (`standard-3+`, horizontal/vertical/diagonal, L, T, cross, cluster, pattern, directional, path, cycle, ring, land-registered) map onto engine modes. Executable rules live in the Match Engine Rule Registry. **Matching is graph-authoritative.** Land-specific match rules must register; they are not hardcoded. See `MATCH_RULES.md`. Approved special-pattern candidates may become board Special Matches through `SPECIAL_MATCH_ENGINE.md`. That creation step is cascade/engine work, not Level DNA and not inventory.

## Twists, mastery, rewards

Twists are optional contracts (id, category, activation, constraints, objective interaction, accessibility, serialization).

**Completion ≠ Mastery.** A player can clear a level without mastery.

Rewards are references: Glitter Chips/Gems, cosmetics, collectibles, trophies, achievements, Museum entries, Sanctuary artifacts, story unlocks, Gate memories. The economy is not implemented here.

## Glitter Gates / Sanctuary / Museum / Personal Story

Reference contracts only. Gate assignment is reserved as server-authoritative. Do not create Gates, Sanctuary, Museum, or Personal Story systems in this phase.

## Accessibility

Accessibility is level data: large text, high contrast, non-color-only, large targets, reduced motion, audio, haptics, readable objectives, reflow, visual state indicators. Color-only gameplay information is a validation error.

## Versioning

Packs carry `schemaVersion` and `contentVersion`. Compatibility is major-aligned semver. Migration hooks exist as a contract; there is no production content to migrate.

## Validation

Malformed content fails loudly. The validator does not repair authoring mistakes. Production DNA requires the full contract. Development fixtures may omit future-facing fields.

## Authoring boundary

Future designers author JSON data. There is no CMS, no production editor, and no remote content delivery in this phase.
