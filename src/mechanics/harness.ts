import { createBoard, type BoardDefinition, type Occupant } from "../board/index.js";
import { createRandomSource } from "../random/index.js";
import { issue, throwIfErrors, type ValidationIssue } from "../validation.js";
import { composeMechanics, type MechanicBinding, type MechanicLookup } from "./composition.js";
import type { MechanicEffect, MechanicLifecyclePhase } from "./contract.js";
import { dispatchMechanicPhase } from "./dispatch.js";
import { compareMechanicState, createMechanicState, type MechanicState } from "./state.js";

export interface MechanicHarnessCase {
  mechanicId: string;
  board: BoardDefinition;
  occupants?: Record<string, Occupant>;
  initialPayload?: Record<string, unknown>;
  seed: string;
  phase: MechanicLifecyclePhase;
  move?: { from: string; to: string };
  expectedEffects?: Array<Partial<MechanicEffect>>;
  expectedPayload?: Record<string, unknown>;
}

export interface MechanicHarnessResult {
  state: MechanicState;
  effects: MechanicEffect[];
  explanation: string;
}

/**
 * Test a mechanic independently of campaign levels.
 * Development fixtures only.
 */
export function runMechanicHarness(testCase: MechanicHarnessCase, registry: MechanicLookup): MechanicHarnessResult {
  if (!registry.has(testCase.mechanicId)) {
    throwIfErrors(
      [issue("mechanic.unknown", "harness", `Unknown mechanic "${testCase.mechanicId}".`)],
      "Mechanic harness failed",
    );
  }
  const mechanic = registry.get(testCase.mechanicId);
  const board = createBoard(testCase.board, testCase.occupants);
  const bindings: MechanicBinding[] = [{ id: testCase.mechanicId, priority: mechanic.priority }];
  const initial = mechanic.initialize();
  const states: Record<string, MechanicState> = {
    [testCase.mechanicId]: createMechanicState(
      mechanic.id,
      mechanic.version,
      { ...initial.payload, ...testCase.initialPayload },
      initial.id,
    ),
  };
  const dispatched = dispatchMechanicPhase({
    phase: testCase.phase,
    bindings,
    states,
    registry,
    board,
    rng: createRandomSource(testCase.seed),
    move: testCase.move,
    checkInvariants: true,
  });
  const state = dispatched.states[testCase.mechanicId] ?? initial;
  const issues: ValidationIssue[] = [];
  if (testCase.expectedPayload) {
    const expected = createMechanicState(mechanic.id, mechanic.version, {
      ...state.payload,
      ...testCase.expectedPayload,
    }, state.id);
    if (!compareMechanicState({ ...state, payload: { ...state.payload, ...testCase.expectedPayload } }, expected)) {
      issues.push(issue("harness.payload", "expectedPayload", "Resulting mechanic payload did not match the expected fields."));
    }
    for (const [key, value] of Object.entries(testCase.expectedPayload)) {
      if (JSON.stringify(state.payload[key]) !== JSON.stringify(value)) {
        issues.push(
          issue(
            "harness.payload",
            `expectedPayload.${key}`,
            `Expected payload.${key} to be ${JSON.stringify(value)}, received ${JSON.stringify(state.payload[key])}.`,
          ),
        );
      }
    }
  }
  for (const [index, expected] of (testCase.expectedEffects ?? []).entries()) {
    const actual = dispatched.effects[index];
    if (!actual) {
      issues.push(issue("harness.effect_missing", `expectedEffects[${index}]`, "Expected an effect that was not produced."));
      continue;
    }
    for (const [key, value] of Object.entries(expected)) {
      if (JSON.stringify(actual[key as keyof MechanicEffect]) !== JSON.stringify(value)) {
        issues.push(
          issue(
            "harness.effect",
            `expectedEffects[${index}].${key}`,
            `Expected ${key}=${JSON.stringify(value)}, received ${JSON.stringify(actual[key as keyof MechanicEffect])}.`,
          ),
        );
      }
    }
  }
  throwIfErrors(issues, `Mechanic harness rejected "${testCase.mechanicId}"`);
  return {
    state,
    effects: dispatched.effects,
    explanation: dispatched.inspections[0]?.explanation ?? mechanic.debugDescription,
  };
}

export function composedHarnessOrder(ids: string[], registry: MechanicLookup): string[] {
  return composeMechanics(
    ids.map((id) => ({ id })),
    registry,
  ).map((mechanic) => mechanic.id);
}
