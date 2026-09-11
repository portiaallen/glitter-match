import { serializeRuntime, type ObjectiveRuntime } from "./evaluate.js";

export function canonicalObjectiveRuntime(runtime: ObjectiveRuntime): string {
  return JSON.stringify(serializeRuntime(runtime));
}

export function objectiveRuntimesEqual(a: ObjectiveRuntime, b: ObjectiveRuntime): boolean {
  return canonicalObjectiveRuntime(a) === canonicalObjectiveRuntime(b);
}
