import type { ObjectiveEvaluationContext } from "./model.js";
import { evaluateRuntime, serializeRuntime, type ObjectiveRuntime } from "./evaluate.js";
import { explainObjective, explainWinState } from "./explain.js";
import { validateObjectiveForest } from "./validate.js";
import { defaultObjectiveAccessibility } from "./types.js";

export interface ObjectiveInspection {
  states: ObjectiveRuntime["states"];
  events: ObjectiveRuntime["events"];
  explanations: string[];
  win: string;
  serialized: string;
  validation: ReturnType<typeof validateObjectiveForest>;
  accessibility: ReturnType<typeof defaultObjectiveAccessibility>[];
}

export function inspectObjectiveRuntime(runtime: ObjectiveRuntime, ctx: ObjectiveEvaluationContext): ObjectiveInspection {
  const win = evaluateRuntime(runtime, ctx);
  return {
    states: runtime.states,
    events: runtime.events,
    explanations: Object.values(runtime.states).map(explainObjective),
    win: explainWinState(win),
    serialized: JSON.stringify(serializeRuntime(runtime)),
    validation: validateObjectiveForest(runtime.roots, runtime.win),
    accessibility: Object.values(runtime.states).map((state) =>
      defaultObjectiveAccessibility(state.objectiveId, state.current, state.target, state.status),
    ),
  };
}
