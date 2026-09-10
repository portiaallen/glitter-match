# Mechanic Primitives

Primitives are reusable building blocks. They are not Land mechanics.

```
Core Engine Primitives → Land Mechanic Handlers → Level DNA
```

A Land mechanic composes primitives. A level configures the mechanic through data. The primitive layer never contains `if (land === …)`.

**640 levels, Level 1, Level 80, and production Land mechanics are not part of this implementation.**

## Registry

`createPrimitiveRegistry()` lists lightweight contracts:

state-transition, cell-state, occupant-state, edge-state, topology-mutation, temporary-state, trigger, condition, effect, batch-resolution, transformation, pairing, synchronization, region, path, threshold, controlled-randomness, accessibility-cue.

Each primitive declares id, version, category, input/state/effect contracts, lifecycle, determinism, accessibility, serialization, and a debug explanation.

## State transitions

`state A → trigger + condition → state B → effects`

Transitions are generic. No Land-specific state names are hardcoded.

## Cell, occupant, and edge state

Cell overlays may name: normal, locked, unlocked, active, inactive, revealed, hidden, protected, vulnerable, frozen, transformed. Not every name is implemented as a puzzle rule. Changes are explicit, serializable, and inspectable.

Occupant operations: replace, transform, move, swap, rotate a cycle, mark (including preserved identity).

Edge overlays keep **allowsMatch** and **allowsSwap independent**. Active/inactive and traversable are separate from those flags. One is never inferred from the other.

## Topology mutation

Enable/disable edge, redirect, open/close route, activate/deactivate portal. Mutations must keep graph references valid, stay serializable and deterministic, and can declare reversibility. Failed batches roll back.

## Temporary state

Deterministic counters: N moves, until trigger, until match, duration metadata, temporary route, temporary protection. No wall-clock timers unless a later level authors timing metadata.

## Triggers and conditions

Triggers are explicit events: move, match, cascade, cell/occupant/objective/threshold/board/mechanic-state change.

Conditions are a small typed tree: AND / OR / NOT plus cell state, icon occupancy, edge state, counters, mechanic payload, connected region, and pattern. Not a general expression language.

## Effects and batches

Effects are ordered, inspectable, and serializable. A batch:

1. receives effects
2. validates
3. orders deterministically
4. applies on a clone
5. validates the resulting graph
6. commits or rejects

Invalid batches do not partially mutate the live runtime. Conflicts on the same target fail instead of picking a silent winner.

## Transformation, pairing, synchronization

Transformation contracts declare source, destination, trigger, conditions, effects, and reversibility. No production transformations are authored.

Relationships link cell↔cell, occupant↔occupant, or region↔region. Synchronization can apply the same state change to members. These are generic. They are not Bloomara.

## Regions and paths

Regions are connected components of **walkable authored edges**. Paths use the same graph. Coordinates are presentation only.

## Thresholds and randomness

Thresholds (count, percent, objective, state, multi-stage) emit `threshold-reached` when crossed.

Randomness, if needed, uses `SeededRandom` and must be declared. Do not use it to make puzzles feel chaotic.

## Accessibility and explainability

Effects may request announcements, optional audio/haptics, reduced-motion alternatives, and high-contrast indicators. Presentation is not gameplay authority.

Every pipeline result can answer: what happened, why, what triggered it, which cells/edges changed, and which effects ran.

## Composition

`runPrimitivePipeline`: Trigger → Condition → Transition → Effects → Validation → Events.

## Board Lab

Play / inspect mode can trigger development recipes on the current engine fixture: disable edge, lock cell, swap, pair, region, path, threshold. This is inspection, not a campaign editor.

## Isolation

- Primitives are Land-neutral.
- Special Icons remain universal inventory. Primitives cannot mint them as occupants.
- The Glitter Icon remains landless. Primitives cannot assign it a Land.
