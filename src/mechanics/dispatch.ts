import type { Board } from "../board/index.js";
import type { CellId } from "../ids.js";
import type { RandomSource } from "../random/index.js";
import { issue, throwIfErrors } from "../validation.js";
import { composeMechanics, type MechanicBinding, type MechanicLookup } from "./composition.js";
import type { MechanicEffect, MechanicInspection, MechanicLifecyclePhase } from "./contract.js";
import { checkMechanicInvariants } from "./invariants.js";
import { cloneMechanicStates, createMechanicState, type MechanicState } from "./state.js";

export interface DispatchOptions {
  phase: MechanicLifecyclePhase;
  bindings: MechanicBinding[];
  states: Record<string, MechanicState>;
  registry: MechanicLookup;
  board: Board;
  rng: RandomSource;
  move?: { from: CellId; to: CellId };
  checkInvariants?: boolean;
}

export interface DispatchResult {
  states: Record<string, MechanicState>;
  effects: MechanicEffect[];
  inspections: MechanicInspection[];
}

/**
 * Engine entry: ask the registry, run declared hooks, collect explicit effects.
 * Never branch on land identity in this dispatcher.
 */
export function dispatchMechanicPhase(options: DispatchOptions): DispatchResult {
  const ordered = composeMechanics(options.bindings, options.registry);
  const states = cloneMechanicStates(options.states);
  const effects: MechanicEffect[] = [];
  const inspections: MechanicInspection[] = [];

  for (const mechanic of ordered) {
    if (!mechanic.implemented) {
      inspections.push(
        mechanic.explain(states[mechanic.id] ?? mechanic.initialize(), []),
      );
      continue;
    }
    const hook = mechanic.hooks?.[options.phase];
    if (!hook) {
      continue;
    }
    if (mechanic.deterministic.usesRng === false && options.rng === undefined) {
      throwIfErrors(
        [issue("mechanic.rng_required", `mechanics.${mechanic.id}`, "Deterministic context missing RNG source.")],
        "Mechanic dispatch failed",
      );
    }
    const current = states[mechanic.id] ?? mechanic.initialize();
    const result = hook({
      board: options.board,
      mechanicState: current,
      rng: options.rng,
      phase: options.phase,
      move: options.move,
    });
    if (options.checkInvariants !== false) {
      throwIfErrors(
        checkMechanicInvariants(mechanic, current, result.state, result.effects, options.board),
        `Mechanic "${mechanic.id}" broke an invariant`,
      );
    }
    states[mechanic.id] = result.state;
    effects.push(...result.effects);
    inspections.push(mechanic.explain(result.state, result.effects));
  }

  return { states, effects, inspections };
}

export function ensureMechanicStates(
  bindings: MechanicBinding[],
  registry: MechanicLookup,
  existing: Record<string, MechanicState> = {},
): Record<string, MechanicState> {
  const states = cloneMechanicStates(existing);
  for (const mechanic of composeMechanics(bindings, registry)) {
    if (!states[mechanic.id]) {
      states[mechanic.id] = mechanic.initialize();
    }
  }
  return states;
}

export function emptyMechanicState(mechanicId: string, version = "0.0.0"): MechanicState {
  return createMechanicState(mechanicId, version);
}
