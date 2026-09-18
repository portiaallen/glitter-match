import type { SpecialMatchEvent, SpecialMatchInstance } from "./types.js";
import type { SpecialMatchRuntime } from "./runtime.js";

export function explainSpecialMatch(instance: SpecialMatchInstance, events: SpecialMatchEvent[]): string {
  const created = events.find((event) => event.kind === "SPECIAL_MATCH_CREATED" && event.instanceId === instance.instanceId);
  return [
    `WHY WAS THIS SPECIAL MATCH CREATED? ${created?.explain.whyCreated ?? "See creation policy."}`,
    `WHY THIS ANCHOR? ${created?.explain.whyAnchor ?? instance.anchorCellId}`,
    `WHICH MATCH GROUP CREATED IT? ${instance.sourceMatchGroupId}`,
    `WHICH POLICY WON? ${created?.explain.policyWinner ?? "priority-unique-anchors"}`,
  ].join("\n");
}

export function explainActivation(instanceId: string, events: SpecialMatchEvent[]): string {
  const triggered = events.filter((event) => event.instanceId === instanceId);
  return triggered
    .map((event) => `${event.kind}: ${event.explain.whyActivated ?? event.message}`)
    .join("\n");
}

export function explainCascade(events: SpecialMatchEvent[]): string {
  const last = [...events].reverse().find((event) => event.kind.startsWith("CASCADE_"));
  return last?.explain.whyCascadeStopped ?? last?.explain.whyCascadeContinued ?? last?.message ?? "No cascade event.";
}

export function explainRuntime(runtime: SpecialMatchRuntime): string {
  return runtime.events.map((event) => `${event.kind}: ${event.message}`).join("\n");
}
