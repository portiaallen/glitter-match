import type { RandomSource } from "../random/index.js";
import type {
  Condition,
  PrimitiveEffect,
  PrimitiveExplanation,
  PrimitiveTrigger,
  StateTransition,
  TransformationContract,
} from "./contract.js";
import { applyEffectBatch, type BatchResult } from "./batch.js";
import { evaluateCondition } from "./conditions.js";
import type { PrimitiveRuntime } from "./runtime.js";

export interface PrimitivePipelineInput {
  runtime: PrimitiveRuntime;
  trigger: PrimitiveTrigger;
  condition?: Condition;
  transition?: StateTransition;
  transformation?: TransformationContract;
  effects?: PrimitiveEffect[];
  rng?: RandomSource;
  usesRng?: boolean;
}

export interface PrimitivePipelineResult extends BatchResult {
  skipped: boolean;
  rngUsed: boolean;
}

/**
 * Trigger → Condition → State Transition → Effects → Validation → Events
 * Primitives do not mutate unrelated engine state outside this contract.
 */
export function runPrimitivePipeline(input: PrimitivePipelineInput): PrimitivePipelineResult {
  const condition = input.condition ?? input.transition?.condition ?? input.transformation?.condition ?? { type: "always" };
  if (!evaluateCondition(condition, input.runtime, input.trigger)) {
    return {
      ok: true,
      skipped: true,
      rngUsed: false,
      runtime: input.runtime,
      applied: [],
      events: [],
      issues: [],
      explanation: {
        what: "Pipeline skipped",
        why: "Condition was not met",
        trigger: input.trigger,
        changedCells: [],
        changedEdges: [],
        effects: [],
        events: [],
      },
    };
  }

  const effects: PrimitiveEffect[] = [...(input.effects ?? [])];
  if (input.transition && input.transition.trigger === input.trigger.kind) {
    input.runtime.transitionState = input.transition.to;
    effects.push(...(input.transition.effects ?? []));
  }
  if (input.transformation && input.transformation.trigger === input.trigger.kind) {
    effects.push(...input.transformation.effects);
  }

  const batch = applyEffectBatch(input.runtime, effects);
  return {
    ...batch,
    skipped: false,
    rngUsed: Boolean(input.usesRng && input.rng),
    explanation: withTrigger(batch.explanation, input.trigger, input.transition),
  };
}

function withTrigger(
  explanation: PrimitiveExplanation,
  trigger: PrimitiveTrigger,
  transition?: StateTransition,
): PrimitiveExplanation {
  return {
    ...explanation,
    trigger,
    why: transition
      ? `Trigger ${trigger.kind} fired transition ${transition.from} → ${transition.to}. ${explanation.why}`
      : `Trigger ${trigger.kind}. ${explanation.why}`,
  };
}

export function tickTemporaryStates(runtime: PrimitiveRuntime): PrimitiveEffect[] {
  const effects: PrimitiveEffect[] = [];
  for (const record of Object.values(runtime.temporary)) {
    if (record.kind === "moves" && record.remainingMoves !== undefined) {
      record.remainingMoves -= 1;
      if (record.remainingMoves <= 0) {
        effects.push({ kind: "remove-temporary", temporaryId: record.id });
      }
    }
  }
  return effects;
}
