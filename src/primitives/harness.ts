import { createBoard, type BoardDefinition, type Occupant } from "../board/index.js";
import { createRandomSource } from "../random/index.js";
import { issue, throwIfErrors } from "../validation.js";
import { applyEffectBatch } from "./batch.js";
import { runPrimitivePipeline, type PrimitivePipelineResult } from "./compose.js";
import type { Condition, PrimitiveEffect, PrimitiveTrigger, StateTransition } from "./contract.js";
import { comparePrimitiveRuntime, createPrimitiveRuntime, serializePrimitiveRuntime, type PrimitiveRuntime } from "./runtime.js";

export interface PrimitiveHarnessCase {
  board: BoardDefinition;
  occupants?: Record<string, Occupant>;
  trigger: PrimitiveTrigger;
  condition?: Condition;
  transition?: StateTransition;
  effects?: PrimitiveEffect[];
  seed?: string;
  usesRng?: boolean;
  setup?: (runtime: PrimitiveRuntime) => void;
  expectedTransitionState?: string;
  expectedEffects?: Array<Partial<PrimitiveEffect>>;
  expectedOccupant?: { cellId: string; iconId: string | null };
}

/**
 * Expand the Prompt #5 mechanic harness to primitive pipelines.
 * Development fixtures only.
 */
export function runPrimitiveHarness(testCase: PrimitiveHarnessCase): PrimitivePipelineResult {
  const runtime = createPrimitiveRuntime(createBoard(testCase.board, testCase.occupants));
  testCase.setup?.(runtime);
  const before = serializePrimitiveRuntime(runtime);
  const result = runPrimitivePipeline({
    runtime,
    trigger: testCase.trigger,
    condition: testCase.condition,
    transition: testCase.transition,
    effects: testCase.effects,
    rng: testCase.usesRng ? createRandomSource(testCase.seed ?? "primitive") : undefined,
    usesRng: testCase.usesRng,
  });
  if (testCase.expectedTransitionState && runtime.transitionState !== testCase.expectedTransitionState) {
    throwIfErrors(
      [
        issue(
          "harness.transition",
          "transitionState",
          `Expected ${testCase.expectedTransitionState}, received ${runtime.transitionState}.`,
        ),
      ],
      "Primitive harness failed",
    );
  }
  if (testCase.expectedOccupant) {
    const occupant = runtime.board.cells[testCase.expectedOccupant.cellId]?.occupant;
    const iconId = occupant?.type === "icon" ? occupant.iconId : null;
    if (iconId !== testCase.expectedOccupant.iconId) {
      throwIfErrors(
        [issue("harness.occupant", testCase.expectedOccupant.cellId, `Expected occupant ${testCase.expectedOccupant.iconId}.`)],
        "Primitive harness failed",
      );
    }
  }
  for (const [index, expected] of (testCase.expectedEffects ?? []).entries()) {
    const actual = result.applied[index];
    if (!actual) {
      throwIfErrors(
        [issue("harness.effect_missing", `expectedEffects[${index}]`, "Expected effect missing.")],
        "Primitive harness failed",
      );
      continue;
    }
    for (const [key, value] of Object.entries(expected)) {
      if (JSON.stringify(actual[key as keyof PrimitiveEffect]) !== JSON.stringify(value)) {
        throwIfErrors(
          [issue("harness.effect", `expectedEffects[${index}].${key}`, `Expected ${JSON.stringify(value)}.`)],
          "Primitive harness failed",
        );
      }
    }
  }
  void before;
  return result;
}

export function assertUnchangedOnFailure(runtime: PrimitiveRuntime, effects: PrimitiveEffect[]): boolean {
  const before = createPrimitiveRuntime(runtime.board);
  Object.assign(before, {
    cells: structuredClone(runtime.cells),
    edges: structuredClone(runtime.edges),
    occupants: structuredClone(runtime.occupants),
    relationships: structuredClone(runtime.relationships),
    temporary: structuredClone(runtime.temporary),
    thresholds: structuredClone(runtime.thresholds),
    counters: structuredClone(runtime.counters),
    mechanicPayload: structuredClone(runtime.mechanicPayload),
    transitionState: runtime.transitionState,
  });
  const snapshot = serializePrimitiveRuntime(runtime);
  const result = applyEffectBatch(runtime, effects);
  if (result.ok) {
    return false;
  }
  return serializePrimitiveRuntime(runtime) === snapshot && comparePrimitiveRuntime(runtime, runtime);
}
