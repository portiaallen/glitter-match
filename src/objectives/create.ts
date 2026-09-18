import type { Objective, ObjectiveDefinition, ObjectiveEvaluationContext, ObjectiveProgress } from "./model.js";
import { getDefaultObjectiveRegistry } from "./registry.js";
import type { HandlerResult } from "./types.js";

export function evaluateDefinition(
  definition: ObjectiveDefinition,
  ctx: ObjectiveEvaluationContext,
  registry = getDefaultObjectiveRegistry(),
): HandlerResult {
  const handler = registry.get(definition.type);
  return handler.evaluate(definition, ctx, (child, childCtx) => evaluateDefinition(child, childCtx, registry));
}

export function handlerResultToProgress(result: HandlerResult): ObjectiveProgress {
  return {
    current: result.current,
    target: result.target,
    complete: result.status === "COMPLETE",
    failed: result.status === "FAILED" ? true : undefined,
    status: result.status,
    label: result.label,
  };
}

export function createObjective(definition: ObjectiveDefinition): Objective {
  return {
    definition,
    evaluate(ctx: ObjectiveEvaluationContext): ObjectiveProgress {
      return handlerResultToProgress(evaluateDefinition(definition, ctx));
    },
  };
}
