import type { Board } from "../board/index.js";
import { runMatchResolution, type MatchRules } from "../matching/index.js";
import type { IconRegistry } from "../icons/index.js";
import { queueActivation } from "./activation.js";
import { explainActivation, explainCascade, explainSpecialMatch } from "./explain.js";
import { getDefaultSpecialMatchRegistry } from "./cascade.js";
import { serializeSpecialMatchState } from "./serialize.js";
import type { SpecialMatchRuntime } from "./runtime.js";
import { validateSpecialMatchState } from "./validate.js";

export interface SpecialMatchInspection {
  candidates: ReturnType<typeof runMatchResolution>["specialMatchCandidates"];
  instances: SpecialMatchRuntime["instances"];
  pending: SpecialMatchRuntime["pending"];
  events: SpecialMatchRuntime["events"];
  explanations: string[];
  serialized: string;
  validation: ReturnType<typeof validateSpecialMatchState>;
  cascadeExplanation: string;
}

export function inspectSpecialMatches(
  board: Board,
  rules: MatchRules,
  icons: IconRegistry,
  runtime: SpecialMatchRuntime,
): SpecialMatchInspection {
  const resolution = runMatchResolution(board, rules, icons);
  const registry = getDefaultSpecialMatchRegistry();
  return {
    candidates: resolution.specialMatchCandidates,
    instances: runtime.instances,
    pending: runtime.pending,
    events: runtime.events,
    explanations: Object.values(runtime.instances).map((instance) => explainSpecialMatch(instance, runtime.events)),
    serialized: JSON.stringify(serializeSpecialMatchState(board, runtime)),
    validation: validateSpecialMatchState(board, runtime, registry),
    cascadeExplanation: explainCascade(runtime.events),
  };
}

export function inspectActivation(runtime: SpecialMatchRuntime, instanceId: string): string {
  return explainActivation(instanceId, runtime.events);
}

export function labActivateSpecial(runtime: SpecialMatchRuntime, instanceId: string): void {
  const instance = runtime.instances[instanceId];
  if (!instance) {
    return;
  }
  const registry = getDefaultSpecialMatchRegistry();
  queueActivation(runtime, instanceId, "direct", registry.get(instance.typeId).priority);
}
